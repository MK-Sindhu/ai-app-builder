import express from "express";
import OpenAI from "openai";
import { prismaClient } from "db/client";
import { secretAuthMiddleware } from "common/middleware";
import { systemPrompt } from "./systemPrompt";
import { ArtifactProcessor } from "./parser";
import { onFileUpdate, onShellCommand } from "./os";
import { previewState, runPreview } from "./preview";

const PORT = Number(process.env.PORT ?? 9091);
// Any OpenAI-compatible API works. For Grok use LLM_BASE_URL=https://api.x.ai/v1 and a grok model.
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://api.deepseek.com";
const LLM_MODEL = process.env.LLM_MODEL ?? "deepseek-v4-pro";
// Tried once when the main model is overloaded or rate-limited, e.g. gemini-2.5-flash
const LLM_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL;
// A whole app is many files. Too low and replies stop partway through.
const LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 32000);

// Retries overloaded (5xx) and rate-limited (429) requests with backoff before giving up
const llm = new OpenAI({ apiKey: process.env.LLM_API_KEY, baseURL: LLM_BASE_URL, maxRetries: 4 });

// Busy (429, 5xx) even after retries, or gone (404: Google retires models, sometimes only for new accounts)
function shouldFallBack(error: unknown): error is InstanceType<typeof OpenAI.APIError> {
  return error instanceof OpenAI.APIError && (error.status === 404 || error.status === 429 || (error.status ?? 0) >= 500);
}

// Starts the model's reply, falling back to LLM_FALLBACK_MODEL if the main model is busy or unavailable
async function startReply(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const request = (model: string) => llm.chat.completions.create({
    model,
    max_tokens: LLM_MAX_TOKENS,
    stream: true,
    messages,
  });

  try {
    return await request(LLM_MODEL);
  } catch (error) {
    if (LLM_FALLBACK_MODEL && shouldFallBack(error)) {
      console.log(`${LLM_MODEL} is unavailable (${error.status}), using ${LLM_FALLBACK_MODEL}`);
      return await request(LLM_FALLBACK_MODEL);
    }
    throw error;
  }
}

// What the user sees in the build log when a build fails
function describeError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return "The AI model's usage limit was reached. Wait a minute, then send your message again.";
    }
    if ((error.status ?? 0) >= 500) {
      return "The AI model is overloaded right now. Wait a moment, then send your message again.";
    }
    if (error.status === 401 || error.status === 403) {
      return "The AI model rejected the API key. Check LLM_API_KEY on the worker.";
    }
    if (error.status === 404) {
      return "The AI model wasn't found. Check LLM_MODEL and LLM_FALLBACK_MODEL on the worker.";
    }
    if (error.status === 400) {
      return "The AI model rejected the request. Check LLM_MAX_TOKENS on the worker (at most about 65000).";
    }
  }
  return "Something went wrong while building. Send your message again.";
}

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Whether the preview (Expo's dev server, serving the web version of the app) is up
app.get("/preview", secretAuthMiddleware("WORKER_SECRET"), async (req, res) => {
  res.json(await previewState());
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
        content: `Error: ${describeError(error)}`,
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

  const stream = await startReply(messages);

  // Set when the reply hit LLM_MAX_TOKENS, so the last files may be missing
  let cutOff = false;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.finish_reason === "length") {
      cutOff = true;
    }
    const text = choice?.delta?.content;
    if (!text) {
      continue;
    }
    artifactProcessor.append(text);
    parseAll();
    artifact += text;
  }

  await queue;
  console.log(cutOff ? "cut off at the length limit" : "done!");

  // Before the reply is saved, so the log shows the steps, then how they ended, then the reply's text
  await prismaClient.action.create({
    data: {
      content: cutOff
        ? "Error: The reply hit its length limit, so some files may be missing. Raise LLM_MAX_TOKENS on the worker, then ask again."
        : "Done!",
      projectId,
    },
  });

  await prismaClient.prompt.create({
    data: {
      content: artifact,
      projectId,
      type: "SYSTEM",
    },
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

runPreview();
