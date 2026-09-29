import { CircleCheck, CircleSlash, CircleStop, CircleX, FilePen, LoaderCircle, Play, RotateCw, SquareTerminal, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Action } from "@/hooks/useActions";
import type { Prompt } from "@/hooks/usePrompts";
import { cn } from "@/lib/utils";

type Step = {
    icon: LucideIcon;
    verb: string;
    detail: string;
    tone: "plain" | "done" | "failed";
};

// Turns the worker's action text ("Updated file app/index.tsx", "Ran command: npm install") into a step
function toStep(content: string): Step {
    if (content === "Done!") {
        return { icon: CircleCheck, verb: "Done", detail: "", tone: "done" };
    }
    if (content === "Stopped") {
        return { icon: CircleStop, verb: "Stopped", detail: "", tone: "plain" };
    }
    if (content.startsWith("Error:")) {
        return { icon: TriangleAlert, verb: content.slice("Error:".length).trim(), detail: "", tone: "failed" };
    }
    const kinds: [string, LucideIcon, string, Step["tone"]][] = [
        ["Updated file ", FilePen, "Wrote", "plain"],
        ["Ran command: ", SquareTerminal, "Ran", "plain"],
        ["Started command: ", Play, "Started", "plain"],
        // Dev server commands; the preview already runs one
        ["Skipped command: ", CircleSlash, "Skipped", "plain"],
        ["Command failed: ", CircleX, "Failed", "failed"],
    ];
    for (const [prefix, icon, verb, tone] of kinds) {
        if (content.startsWith(prefix)) {
            return { icon, verb, detail: content.slice(prefix.length), tone };
        }
    }
    return { icon: SquareTerminal, verb: content, detail: "", tone: "plain" };
}

type Block =
    | { kind: "message"; id: string; text: string }
    | { kind: "reply"; id: string; text: string }
    | { kind: "steps"; id: string; steps: (Step & { id: string })[] };

// The model's reply without the code it wrote, which the steps already show. Empty if it only wrote code.
function replyText(content: string) {
    return content.replace(/<boltArtifact[\s\S]*?(<\/boltArtifact>|$)/g, "").trim();
}

// Your messages, the model's replies, and the worker's steps in the order they happened,
// with consecutive steps grouped
function toBlocks(prompts: Prompt[], actions: Action[]): Block[] {
    const events = [
        ...prompts.filter((p) => p.type === "USER").map((p) => ({ at: Date.parse(p.createdAt), id: p.id, message: p.content })),
        ...prompts
            .filter((p) => p.type === "SYSTEM" && replyText(p.content))
            .map((p) => ({ at: Date.parse(p.createdAt), id: p.id, reply: replyText(p.content) })),
        ...actions.map((a) => ({ at: Date.parse(a.createdAt), id: a.id, step: toStep(a.content) })),
    ].sort((a, b) => a.at - b.at);

    const blocks: Block[] = [];
    for (const event of events) {
        if ("message" in event) {
            blocks.push({ kind: "message", id: event.id, text: event.message });
            continue;
        }
        if ("reply" in event) {
            blocks.push({ kind: "reply", id: event.id, text: event.reply });
            continue;
        }
        const last = blocks[blocks.length - 1];
        if (last?.kind === "steps") {
            last.steps.push({ ...event.step, id: event.id });
        } else {
            blocks.push({ kind: "steps", id: event.id, steps: [{ ...event.step, id: event.id }] });
        }
    }
    return blocks;
}

// How a build ends: done, failed, or stopped
function isFinish(action: Action) {
    return action.content === "Done!" || action.content === "Stopped" || action.content.startsWith("Error:");
}

// Still working when your latest message came after the last build ended
export function isWorking(prompts: Prompt[], actions: Action[]) {
    const lastMessage = Math.max(0, ...prompts.filter((p) => p.type === "USER").map((p) => Date.parse(p.createdAt)));
    const lastFinish = Math.max(0, ...actions.filter(isFinish).map((a) => Date.parse(a.createdAt)));
    return lastMessage > lastFinish;
}

// The last build failed or was stopped, so resending the last message may help
export function lastBuildFailed(actions: Action[]) {
    const finishes = actions.filter(isFinish).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const last = finishes[finishes.length - 1];
    return last !== undefined && last.content !== "Done!";
}

export function Timeline({ prompts, actions, pendingMessage, working, stopping, onRetry }: {
    prompts: Prompt[];
    actions: Action[];
    pendingMessage: string | null;
    working: boolean;
    stopping: boolean;
    // Set when the last build failed or was stopped
    onRetry?: () => void;
}) {
    const blocks = toBlocks(prompts, actions);

    if (blocks.length === 0 && pendingMessage === null) {
        return (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <p className="max-w-[280px] text-[14px] leading-relaxed text-graphite">
                    Describe what to build or change. Every file ndstill writes and every command it runs shows up here.
                </p>
            </div>
        );
    }

    return (
        <ol className="flex flex-col gap-3 px-4 py-5">
            {blocks.map((block) =>
                block.kind === "message" ? (
                    <li key={block.id} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14px] leading-relaxed text-white">
                            {block.text}
                        </p>
                    </li>
                ) : block.kind === "reply" ? (
                    <li key={block.id}>
                        <p className="max-w-[92%] whitespace-pre-wrap px-1 text-[14px] leading-relaxed text-ink">
                            {block.text}
                        </p>
                    </li>
                ) : (
                    <li key={block.id}>
                        <ol className="flex flex-col gap-1.5 rounded-2xl border border-hairline bg-paper px-3.5 py-3">
                            {block.steps.map((step) => (
                                <li key={step.id} className="flex items-start gap-2.5 text-[13px] leading-5">
                                    <step.icon
                                        className={cn(
                                            "mt-0.5 size-3.5 shrink-0",
                                            step.tone === "done" && "text-mint",
                                            step.tone === "failed" && "text-destructive",
                                            step.tone === "plain" && "text-graphite",
                                        )}
                                    />
                                    <span className="min-w-0">
                                        <span className={cn(step.tone === "done" ? "font-medium text-ink" : step.tone === "failed" ? "text-destructive" : "text-graphite")}>
                                            {step.verb}
                                        </span>
                                        {step.detail && <code className="ml-1.5 break-all font-mono text-[12.5px] text-ink">{step.detail}</code>}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </li>
                ),
            )}

            {pendingMessage !== null && (
                <li className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink/80 px-4 py-2.5 text-[14px] leading-relaxed text-white">
                        {pendingMessage}
                    </p>
                </li>
            )}

            {working && (
                <li className="flex items-center gap-2 px-1 text-[13px] text-graphite">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    {stopping ? "Stopping…" : "Writing code…"}
                </li>
            )}

            {onRetry && (
                <li className="px-1">
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline bg-paper px-3 text-[13px] font-medium text-ink outline-none transition-colors hover:border-ink/20 focus-visible:ring-2 focus-visible:ring-ink/30"
                    >
                        <RotateCw className="size-3.5" />
                        Retry
                    </button>
                </li>
            )}
        </ol>
    );
}
