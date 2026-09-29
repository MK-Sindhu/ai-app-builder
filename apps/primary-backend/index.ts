import { prismaClient } from "db/client";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { authMiddleware } from "common/middleware";

const PORT = Number(process.env.PORT ?? 9090);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:9092";
// "private" when the backend runs in the same VPC as the worker machines, "public" for local dev
const WORKER_ADDRESS = process.env.WORKER_ADDRESS ?? "private";
const WORKER_PORT = 9091;
const CODE_SERVER_PORT = 8080;
// Where the router serves editors, e.g. https://code.ndstill.com for https://code.ndstill.com/<projectId>/.
// Unset for local dev, where the frontend opens code-server on the machine directly.
const CODE_URL = process.env.CODE_URL;
// Signs the tokens that let a user through the router to their project's editor
const ROUTER_SECRET = process.env.ROUTER_SECRET ?? "";
const SESSION_COOKIE = "bolty_session";

const app = express();

app.use(express.json());
// FRONTEND_URL can list several origins, comma separated (e.g. https://ndstill.com,https://www.ndstill.com)
app.use(cors({ origin: (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",") }));

type Machine = {
  machineId: string;
  publicDns: string;
  privateIp: string;
};

// Asks the orchestrator for this project's machine. Returns null when none is free yet.
// With lookupOnly, only finds a machine already assigned to the project and never assigns a new one.
async function getMachine(projectId: string, lookupOnly = false): Promise<Machine | null> {
  const query = lookupOnly ? "?lookup=1" : "";
  const response = await fetch(`${ORCHESTRATOR_URL}/project/${encodeURIComponent(projectId)}${query}`, {
    headers: { Authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 503 || response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Orchestrator returned ${response.status}`);
  }
  return (await response.json()) as Machine;
}

function workerHost(machine: Machine) {
  return WORKER_ADDRESS === "public" ? machine.publicDns : machine.privateIp;
}

function signRouterToken(projectId: string, userId: string, expiresIn: "2m" | "12h") {
  return jwt.sign({ projectId }, ROUTER_SECRET, { subject: userId, expiresIn, algorithm: "HS256" });
}

// Returns the user id if the token is valid for this project
function verifyRouterToken(token: string | undefined, projectId: string) {
  if (!token || !ROUTER_SECRET) {
    return null;
  }
  try {
    const claims = jwt.verify(token, ROUTER_SECRET, { algorithms: ["HS256"] });
    if (typeof claims === "string" || claims.projectId !== projectId) {
      return null;
    }
    return claims.sub ?? null;
  } catch {
    return null;
  }
}

function readCookie(header: string | undefined, name: string) {
  return header
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
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

  const response = await fetch(`http://${workerHost(machine)}:${WORKER_PORT}/prompt`, {
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

  const codeServerUrl = CODE_URL
    // Through the router, which swaps this short-lived token for a cookie on the project's path
    ? `${CODE_URL}/${projectId}/?bolty_token=${signRouterToken(projectId, userId, "2m")}`
    // Local dev: straight to the machine
    : `http://${machine.publicDns}:${CODE_SERVER_PORT}`;

  res.json({ machineId: machine.machineId, codeServerUrl });
});

// Caddy calls this before every request to CODE_URL/<projectId>/... A 2xx lets the request through to
// the machine in X-Machine; any other response goes back to the browser as is.
app.get("/router/auth", async (req, res) => {
  const uri = new URL(String(req.headers["x-forwarded-uri"] ?? "/"), "https://router.invalid");
  const projectId = uri.pathname.split("/")[1] ?? "";

  // First visit: swap the short-lived token in the URL for a cookie, then reload without it
  const handoff = uri.searchParams.get("bolty_token");
  if (handoff) {
    const userId = verifyRouterToken(handoff, projectId);
    if (!userId) {
      res.status(401).send("This link has expired. Reopen the project from the app.");
      return;
    }
    res.cookie(SESSION_COOKIE, signRouterToken(projectId, userId, "12h"), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      // Each project gets its own cookie, sent only with that project's requests
      path: `/${projectId}`,
      maxAge: 12 * 60 * 60 * 1000,
    });
    uri.searchParams.delete("bolty_token");
    res.redirect(302, uri.pathname + uri.search);
    return;
  }

  if (!verifyRouterToken(readCookie(req.headers.cookie, SESSION_COOKIE), projectId)) {
    res.status(401).send("Open this project from the app.");
    return;
  }

  // Only an already assigned machine. A tab left open after its session ended must not start a new one.
  const machine = await getMachine(projectId, true);
  if (!machine) {
    res.status(404).send("This session has ended. Reopen the project from the app.");
    return;
  }

  res.setHeader("X-Machine", `${workerHost(machine)}:${CODE_SERVER_PORT}`);
  res.sendStatus(200);
});

// Express 5 sends errors thrown in async handlers here
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
