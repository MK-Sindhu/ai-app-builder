import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { BASE_WORKER_DIR, COMMAND_ENV } from "./os";

// Vite's dev server. It serves the site, which the router shows as the project's preview.
export const PREVIEW_PORT = 8081;
// Every project starts from this: Vite, React, TypeScript and Tailwind
const TEMPLATE_DIR = path.resolve(import.meta.dir, "../../templates/website");
const VITE = path.join(BASE_WORKER_DIR, "node_modules/.bin/vite");

type PreviewState =
    | { status: "starting" }
    | { status: "ready" }
    | { status: "failed"; error: string };

let projectReady = false;
let running = false;
let lastError = "";

// Builds wait for this: until the template is installed, the machine isn't ready to hand out
export function isProjectReady() {
    return projectReady;
}

// Ready once the dev server answers; while it's down, the last thing Vite printed explains why
export async function previewState(): Promise<PreviewState> {
    try {
        const response = await fetch(`http://localhost:${PREVIEW_PORT}/`, { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
            return { status: "ready" };
        }
    } catch {
        // Not answering yet
    }
    return !running && lastError ? { status: "failed", error: lastError } : { status: "starting" };
}

// Copies the website template into an empty project folder and installs it. On a restart it only
// re-runs the install, which finishes quickly when nothing changed.
async function setUpProject() {
    if (!existsSync(path.join(BASE_WORKER_DIR, "package.json"))) {
        console.log("setting up the project from the website template");
        cpSync(TEMPLATE_DIR, BASE_WORKER_DIR, { recursive: true });
    }

    const install = Bun.spawn({
        cmd: ["npm", "install", "--no-audit", "--no-fund"],
        cwd: BASE_WORKER_DIR,
        env: COMMAND_ENV,
        stdout: "ignore",
        stderr: "pipe",
    });
    const stderr = await new Response(install.stderr).text();
    if ((await install.exited) !== 0) {
        throw new Error(`npm install failed: ${stderr.slice(-500)}`);
    }
}

// Sets up the project, then runs Vite for the preview and keeps it running, restarting it if it stops
export async function runPreview() {
    while (!projectReady) {
        try {
            await setUpProject();
            projectReady = true;
            console.log("project ready");
        } catch (error) {
            console.error(error);
            await Bun.sleep(10_000);
        }
    }

    while (true) {
        running = true;
        const lastLines: string[] = [];

        try {
            const proc = Bun.spawn({
                cmd: [VITE, "--host", "0.0.0.0", "--port", String(PREVIEW_PORT), "--strictPort"],
                cwd: BASE_WORKER_DIR,
                env: COMMAND_ENV,
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
            });
            await Promise.all([keepLastLines(proc.stdout, lastLines), keepLastLines(proc.stderr, lastLines)]);
            const exitCode = await proc.exited;
            lastError = lastLines[lastLines.length - 1] ?? `The preview stopped (exit code ${exitCode}).`;
        } catch {
            // Vite's binary is missing, e.g. package.json was rewritten without it and the install ran
            lastError = "Vite isn't installed in this project. Ask ndstill to add vite back to package.json.";
        }

        running = false;
        console.log(`preview stopped (${lastError}), restarting in 10 seconds`);
        await Bun.sleep(10_000);
    }
}

// Reads Vite's output, keeping the last few lines for when it stops
async function keepLastLines(stream: ReadableStream<Uint8Array>, lastLines: string[]) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            return;
        }
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";

        for (const rawLine of lines) {
            // Drop terminal colour codes
            const line = rawLine.replace(/\x1b\[[0-9;]*m/g, "").trim();
            if (!line) {
                continue;
            }
            lastLines.push(line);
            if (lastLines.length > 5) {
                lastLines.shift();
            }
        }
    }
}
