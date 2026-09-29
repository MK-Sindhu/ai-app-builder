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
// Tried once when the main model is busy or gone. It can be on another provider (e.g. a second free tier):
// set LLM_FALLBACK_BASE_URL and LLM_FALLBACK_API_KEY, which otherwise default to the main provider's.
const LLM_FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL;
// A whole app is many files. Too low and replies stop partway through.
const LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 32000);
// How long to wait for a model to start answering. Free services sometimes queue requests for a long time.
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_SECONDS ?? 120) * 1000;
// How long a reply may go without sending anything (no thinking, no text) before we give up on it
const LLM_STALL_MS = 3 * 60 * 1000;

// Both retry overloaded (5xx), rate-limited (429) and timed-out requests before giving up.
// With a fallback ready, the main model gets fewer retries so a busy one doesn't hold up the build.
const llm = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: LLM_BASE_URL,
  maxRetries: LLM_FALLBACK_MODEL ? 1 : 3,
  timeout: LLM_TIMEOUT_MS,
});
const fallbackLlm = new OpenAI({
  // || rather than ??, so a line left empty in the .env also means "same as the main provider"
  apiKey: process.env.LLM_FALLBACK_API_KEY || process.env.LLM_API_KEY,
  baseURL: process.env.LLM_FALLBACK_BASE_URL || LLM_BASE_URL,
  maxRetries: 3,
  timeout: LLM_TIMEOUT_MS,
});

// Busy (429, 5xx) or unreachable even after retries, or gone (404: Google retires models, sometimes
// only for new accounts)
function shouldFallBack(error: unknown): error is InstanceType<typeof OpenAI.APIError> {
  return error instanceof OpenAI.APIConnectionError
    || (error instanceof OpenAI.APIError && (error.status === 404 || error.status === 429 || (error.status ?? 0) >= 500));
}

// Starts the model's reply, falling back to LLM_FALLBACK_MODEL if the main model is busy or unavailable
async function startReply(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  const request = (client: OpenAI, model: string) => client.chat.completions.create({
    model,
    max_tokens: LLM_MAX_TOKENS,
    stream: true,
    messages,
  });

  try {
    console.log(`asking ${LLM_MODEL}`);
    return await request(llm, LLM_MODEL);
  } catch (error) {
    if (LLM_FALLBACK_MODEL && shouldFallBack(error)) {
      console.log(`${LLM_MODEL} is unavailable (${error.status ?? error.message}), asking ${LLM_FALLBACK_MODEL}`);
      return await request(fallbackLlm, LLM_FALLBACK_MODEL);
    }
    throw error;
  }
}

// What the user sees in the build log when a build fails
function describeError(error: unknown) {
  if (error instanceof OpenAI.APIUserAbortError) {
    return "The AI model stopped responding partway through. Send your message again.";
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return "The AI model took too long to respond or couldn't be reached. Send your message again.";
  }
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
  console.log(`prompt received for project ${projectId}`);

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
  const startedAt = Date.now();
  const seconds = () => Math.round((Date.now() - startedAt) / 1000);

  // Give up on a reply that goes quiet, instead of waiting forever
  let stallTimer = setTimeout(() => stream.controller.abort(), LLM_STALL_MS);

  // Set when the reply hit LLM_MAX_TOKENS, so the last files may be missing
  let cutOff = false;
  let loggedThinking = false;
  let nextProgressLog = 0;
  for await (const chunk of stream) {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => stream.controller.abort(), LLM_STALL_MS);

    const choice = chunk.choices[0];
    if (choice?.finish_reason === "length") {
      cutOff = true;
    }
    // Reasoning models stream their thinking separately, before the answer
    const delta = choice?.delta as { reasoning_content?: string; reasoning?: string } | undefined;
    if (!loggedThinking && (delta?.reasoning_content || delta?.reasoning)) {
      console.log(`model is thinking (after ${seconds()}s)`);
      loggedThinking = true;
    }
    const text = choice?.delta?.content;
    if (!text) {
      continue;
    }
    artifactProcessor.append(text);
    parseAll();
    artifact += text;

    if (artifact.length >= nextProgressLog) {
      console.log(nextProgressLog === 0 ? `model started writing (after ${seconds()}s)` : `written ${artifact.length} characters (${seconds()}s)`);
      nextProgressLog += 5000;
    }
  }
  clearTimeout(stallTimer);

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
