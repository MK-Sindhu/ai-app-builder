"use client";
import { ArrowUp, CircleAlert, Square } from "lucide-react";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/config";
import type { Action } from "@/hooks/useActions";
import type { Prompt } from "@/hooks/usePrompts";
import { describeRequestError } from "@/lib/errors";
import { isWorking, lastBuildFailed, Timeline } from "./Timeline";

export function ChatPanel({ projectId, prompts, actions }: { projectId: string; prompts: Prompt[]; actions: Action[] }) {
    const [message, setMessage] = useState("");
    // Shown in the timeline between sending a message and the next poll picking it up
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState("");
    const { getToken } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);

    const messageCount = prompts.filter((p) => p.type === "USER").length;
    useEffect(() => {
        setPendingMessage(null);
    }, [messageCount]);

    const working = pendingMessage !== null || isWorking(prompts, actions);
    useEffect(() => {
        if (!working) {
            setStopping(false);
        }
    }, [working]);

    // Follow the newest steps as they arrive
    const eventCount = prompts.length + actions.length + (pendingMessage === null ? 0 : 1);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [eventCount]);

    // Your latest message, which Retry sends again
    const lastMessage = [...prompts]
        .filter((p) => p.type === "USER")
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .pop()?.content;
    const canRetry = !working && !sending && lastMessage !== undefined && lastBuildFailed(actions);

    async function send(text: string) {
        if (!text.trim() || sending || working) {
            return;
        }
        setError("");
        setSending(true);
        try {
            const token = await getToken();
            await axios.post(`${BACKEND_URL}/prompt`, {
                projectId,
                prompt: text,
            }, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            setMessage("");
            setPendingMessage(text);
        } catch (e) {
            setError(describeRequestError(e, "send your message"));
        } finally {
            setSending(false);
        }
    }

    async function stop() {
        setError("");
        setStopping(true);
        try {
            const token = await getToken();
            await axios.post(`${BACKEND_URL}/project/${projectId}/stop`, {}, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            // The pending message has been accepted, so the timeline shows the rest from here
            setPendingMessage(null);
        } catch (e) {
            setError(describeRequestError(e, "stop the build"));
            setStopping(false);
        }
    }

    return (
        <section aria-label="Conversation" className="flex h-[55dvh] min-h-0 flex-col border-hairline lg:h-auto lg:w-[420px] lg:shrink-0 lg:border-r">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <Timeline
                    prompts={prompts}
                    actions={actions}
                    pendingMessage={pendingMessage}
                    working={working}
                    stopping={stopping}
                    onRetry={canRetry && lastMessage !== undefined ? () => send(lastMessage) : undefined}
                />
            </div>

            <form
                className="p-3 pt-0"
                onSubmit={(e) => {
                    e.preventDefault();
                    send(message);
                }}
            >
                {error && (
                    <p role="alert" className="mb-2 flex items-start gap-2 px-1 text-[13px] leading-snug text-destructive">
                        <CircleAlert className="mt-px size-3.5 shrink-0" />
                        {error}
                    </p>
                )}
                <div className="rounded-2xl border border-hairline bg-paper p-2 shadow-[0_12px_28px_-20px_rgba(21,20,31,0.35)] transition-colors focus-within:border-ink/20">
                    <label htmlFor="message" className="sr-only">Ask for a change</label>
                    <textarea
                        id="message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                send(message);
                            }
                        }}
                        rows={2}
                        placeholder={working ? "You can write your next change while ndstill works" : "Ask for a change, like “add a contact section”"}
                        className="field-sizing-content block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-2 pt-1 text-[14px] leading-relaxed text-ink outline-none placeholder:text-graphite/70"
                    />
                    <div className="flex items-center justify-between pl-2">
                        <span className="text-[12px] text-graphite/80">
                            {working ? "Stop ndstill to send a new message" : "Enter to send · Shift+Enter for a new line"}
                        </span>
                        {working ? (
                            <button
                                type="button"
                                onClick={stop}
                                disabled={stopping}
                                aria-label="Stop"
                                title="Stop"
                                className="grid size-9 place-items-center rounded-full bg-ink text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                <Square className="size-3.5 fill-current" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!message.trim() || sending}
                                aria-label="Send"
                                className="grid size-9 place-items-center rounded-full bg-ink text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                <ArrowUp className="size-4" />
                            </button>
                        )}
                    </div>
                </div>
            </form>
        </section>
    );
}
