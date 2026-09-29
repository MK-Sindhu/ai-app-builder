import { prismaClient } from "db/client";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { authMiddleware } from "common/middleware";

const PORT = Number(process.env.PORT ?? 9090);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:9092";
// "private" when the backend runs in the same VPC as the worker machines, "public" for local dev
const WORKER_ADDRESS = process.env.WORKER_ADDRESS ?? "private";
const WORKER_PORT = 9091;
const CODE_SERVER_PORT = 8080;

const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));

type Machine = {
  machineId: string;
  publicDns: string;
  privateIp: string;
};

// Asks the orchestrator for this project's machine. Returns null when none is free yet.
async function getMachine(projectId: string): Promise<Machine | null> {
  const response = await fetch(`${ORCHESTRATOR_URL}/project/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 503) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Orchestrator returned ${response.status}`);
  }
  return (await response.json()) as Machine;
}

// Returns the project only if it belongs to this user
function findUserProject(projectId: string, userId: string) {
  return prismaClient.project.findFirst({ where: { id: projectId, userId } });
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/project", authMiddleware, async (req, res) => {
  const { prompt } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ message: "prompt is required" });
    return;
  }

  const userId = req.userId!;
  //TODO: add logic to get a useful name for the project from the prompt
  const description = prompt.split("\n")[0];
  const project = await prismaClient.project.create({
    data: { description, userId },
  });
  res.json({ projectId: project.id });
});

app.get("/projects", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const projects = await prismaClient.project.findMany({
    where: { userId },
  });
  res.json({ projects });
});

app.get("/prompts/:projectId", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const projectId = String(req.params.projectId);

  if (!(await findUserProject(projectId, userId))) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const prompts = await prismaClient.prompt.findMany({
    where: { projectId },
  });
  res.json({ prompts });
});

app.get("/actions/:projectId", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const projectId = String(req.params.projectId);

  if (!(await findUserProject(projectId, userId))) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const actions = await prismaClient.action.findMany({
    where: { projectId },
  });
  res.json({ actions });
});

// Sends the prompt to the worker on this project's machine
app.post("/prompt", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const { prompt, projectId } = req.body ?? {};
  if (typeof prompt !== "string" || !prompt.trim() || typeof projectId !== "string") {
    res.status(400).json({ message: "prompt and projectId are required" });
    return;
  }

  if (!(await findUserProject(projectId, userId))) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const machine = await getMachine(projectId);
  if (!machine) {
    res.status(503).json({ message: "No machine is free yet, try again in a minute" });
    return;
  }

  const workerHost = WORKER_ADDRESS === "public" ? machine.publicDns : machine.privateIp;
  const response = await fetch(`http://${workerHost}:${WORKER_PORT}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WORKER_SECRET}`,
    },
    body: JSON.stringify({ prompt, projectId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Worker returned ${response.status}`);
  }

  res.status(202).json({ message: "Prompt accepted" });
});

// Where the frontend loads code-server for this project
app.get("/project/:projectId/machine", authMiddleware, async (req, res) => {
  const userId = req.userId!;
  const projectId = String(req.params.projectId);

  if (!(await findUserProject(projectId, userId))) {
    res.status(404).json({ message: "Project not found" });
    return;
  }

  const machine = await getMachine(projectId);
  if (!machine) {
    res.status(503).json({ message: "No machine is free yet, try again in a minute" });
    return;
  }

  res.json({ codeServerUrl: `http://${machine.publicDns}:${CODE_SERVER_PORT}` });
});

// Express 5 sends errors thrown in async handlers here
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
