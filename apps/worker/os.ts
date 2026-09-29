import { prismaClient } from "db/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

export const BASE_WORKER_DIR = "/tmp/bolty-worker";
// Kill a command that hangs, e.g. an install waiting for input
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
// Commands that start a server and never exit on their own
const LONG_RUNNING_COMMAND = /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview)\b|^(npx\s+(--yes\s+)?)?vite\b(?!\s+build)/;

// The model's commands only get what they need, not the worker's secrets (DATABASE_URL, LLM_API_KEY)
export const COMMAND_ENV = { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp" };

mkdirSync(BASE_WORKER_DIR, { recursive: true });

// The model picks the file path, so refuse anything that points outside the project folder
function resolveProjectPath(filePath: string) {
    const fullPath = path.resolve(BASE_WORKER_DIR, filePath);
    if (!fullPath.startsWith(BASE_WORKER_DIR + path.sep)) {
        throw new Error(`Refusing to write outside the project: ${filePath}`);
    }
    return fullPath;
}

export async function onFileUpdate(filePath: string, fileContent: string, projectId: string) {
    await Bun.write(resolveProjectPath(filePath), fileContent);
    await prismaClient.action.create({
        data: {
            projectId,
            content: `Updated file ${filePath}`
        },
    });
}

export async function onShellCommand(shellCommand: string, projectId: string) {
    //npm run build && npm run start
    const commands = shellCommand.split("&&").map((command) => command.trim()).filter(Boolean);
    for (const command of commands) {
        console.log(`Running command: ${command}`);

        if (LONG_RUNNING_COMMAND.test(command)) {
            // The preview (preview.ts) already runs the dev server. A second one would clash with it.
            await prismaClient.action.create({
                data: {
                    projectId,
                    content: `Skipped command: ${command}`,
                },
            });
            continue;
        }

        const proc = Bun.spawn({ cmd: ["sh", "-c", command], cwd: BASE_WORKER_DIR, env: COMMAND_ENV, stdout: "ignore", stderr: "pipe" });
        const timeout = setTimeout(() => proc.kill(), COMMAND_TIMEOUT_MS);
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        clearTimeout(timeout);

        if (exitCode !== 0) {
            console.error(`Command failed (${exitCode}): ${command}\n${stderr}`);
            await prismaClient.action.create({
                data: {
                    projectId,
                    content: `Command failed: ${command}`,
                },
            });
            // Like &&, skip the rest once one command fails
            return;
        }

        await prismaClient.action.create({
            data: {
                projectId,
                content: `Ran command: ${command}`,
            },
        });
    }
}
