import { BASE_WORKER_DIR, COMMAND_ENV } from "./os";

// Expo's dev server. It serves the web version of the app, which the router shows as the project's preview.
export const PREVIEW_PORT = 8081;

type PreviewState =
    | { status: "starting" }
    | { status: "ready" }
    | { status: "failed"; error: string };

let running = false;
let lastError = "";

// Ready once the dev server answers; while it's down, the last thing Expo printed explains why
export async function previewState(): Promise<PreviewState> {
    try {
        const response = await fetch(`http://localhost:${PREVIEW_PORT}/status`, { signal: AbortSignal.timeout(2000) });
        if (response.ok && (await response.text()).includes("packager-status:running")) {
            return { status: "ready" };
        }
    } catch {
        // Not answering yet
    }
    return !running && lastError ? { status: "failed", error: lastError } : { status: "starting" };
}

// Runs `expo start` for the project and keeps it running, restarting it if it stops
export async function runPreview() {
    while (true) {
        running = true;
        const lastLines: string[] = [];

        const proc = Bun.spawn({
            cmd: ["npx", "expo", "start", "--port", String(PREVIEW_PORT)],
            cwd: BASE_WORKER_DIR,
            env: { ...COMMAND_ENV, BROWSER: "none", EXPO_NO_TELEMETRY: "1" },
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
        });

        await Promise.all([keepLastLines(proc.stdout, lastLines), keepLastLines(proc.stderr, lastLines)]);
        const exitCode = await proc.exited;

        running = false;
        lastError = lastLines[lastLines.length - 1] ?? `The preview stopped (exit code ${exitCode}).`;
        console.log(`preview stopped (exit code ${exitCode}), restarting in 10 seconds`);
        await Bun.sleep(10_000);
    }
}

// Reads Expo's output, keeping the last few lines for when it stops
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
