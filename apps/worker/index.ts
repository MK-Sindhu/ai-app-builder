import express from "express";
import OpenAI from "openai";
import { prismaClient } from "db/client";
import { secretAuthMiddleware } from "common/middleware";
import { systemPrompt } from "./systemPrompt";
import { ArtifactProcessor } from "./parser";
import { onFileUpdate, onShellCommand } from "./os";

const PORT = Number(process.env.PORT ?? 9091);
// Any OpenAI-compatible API works. For Grok use LLM_BASE_URL=https://api.x.ai/v1 and a grok model.
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://api.deepseek.com";
const LLM_MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";

const llm = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: LLM_BASE_URL });

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Only the primary backend calls this, after checking the user owns the project
app.post("/prompt", secretAuthMiddleware("WORKER_SECRET"), async (req, res) => {
  const { prompt, projectId } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim() || typeof projectId !== "string") {
    res.status(400).json({ message: "prompt and projectId are required" });
    return;
  }

  await prismaClient.prompt.create({
    data: {
      content: prompt,
      projectId,
      type: "USER",
    },
  });

  const allPrompts = await prismaClient.prompt.findMany({
    where: {
      projectId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // The frontend polls for actions, so answer now and let the model run in the background
  res.status(202).json({ message: "Prompt accepted" });

  runPrompt(projectId, allPrompts).catch(async (error) => {
    console.log("error", error);
    await prismaClient.action.create({
      data: {
        content: "Error: the model request failed, please try again",
        projectId,
      },
    }).catch(console.error);
  });
});

async function runPrompt(projectId: string, allPrompts: { type: "USER" | "SYSTEM"; content: string }[]) {
  // Run actions one at a time, in order, so npm install waits for package.json to be written
  let queue = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error) => console.error("action failed", error));
  };

  const artifactProcessor = new ArtifactProcessor(
    "",
    (filePath, fileContent) => enqueue(() => onFileUpdate(filePath, fileContent, projectId)),
    (shellCommand) => enqueue(() => onShellCommand(shellCommand, projectId)),
  );
  let artifact = "";

  // parse() handles one action per call, so keep going until a chunk has nothing left to run
  const parseAll = () => {
    let previous;
    do {
      previous = artifactProcessor.currentArtifact;
      artifactProcessor.parse();
    } while (artifactProcessor.currentArtifact !== previous);
  };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...allPrompts.map((p): OpenAI.Chat.ChatCompletionMessageParam =>
      p.type === "USER" ? { role: "user", content: p.content } : { role: "assistant", content: p.content },
    ),
  ];

  const stream = await llm.chat.completions.create({
    model: LLM_MODEL,
    max_tokens: 8000,
    stream: true,
    messages,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (!text) {
      continue;
    }
    artifactProcessor.append(text);
    parseAll();
    artifact += text;
  }

  await queue;
  console.log("done!");

  await prismaClient.prompt.create({
    data: {
      content: artifact,
      projectId,
      type: "SYSTEM",
    },
  });

  await prismaClient.action.create({
    data: {
      content: "Done!",
      projectId,
    },
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
