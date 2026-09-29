"use client";
import { ArrowUp, CircleAlert } from "lucide-react";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/config";
import type { Action } from "@/hooks/useActions";
import type { Prompt } from "@/hooks/usePrompts";
import { describeRequestError } from "@/lib/errors";
import { Timeline } from "./Timeline";

export function ChatPanel({ projectId, prompts, actions }: { projectId: string; prompts: Prompt[]; actions: Action[] }) {
    const [message, setMessage] = useState("");
    // Shown in the timeline between sending a message and the next poll picking it up
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const { getToken } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);

    const messageCount = prompts.filter((p) => p.type === "USER").length;
    useEffect(() => {
        setPendingMessage(null);
    }, [messageCount]);

    // Follow the newest steps as they arrive
    const eventCount = prompts.length + actions.length + (pendingMessage === null ? 0 : 1);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [eventCount]);

    const canSend = message.trim().length > 0 && !sending;

    async function send() {
        if (!canSend) {
            return;
        }
        setError("");
        setSending(true);
        const text = message;
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
            setError(describeRequestError(e, "Couldn't send your message. Try again."));
        } finally {
            setSending(false);
        }
    }

    return (
        <section aria-label="Conversation" className="flex h-[55dvh] min-h-0 flex-col border-hairline lg:h-auto lg:w-[420px] lg:shrink-0 lg:border-r">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                <Timeline prompts={prompts} actions={actions} pendingMessage={pendingMessage} />
            </div>

            <form
                className="p-3 pt-0"
                onSubmit={(e) => {
                    e.preventDefault();
                    send();
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
                                send();
                            }
                        }}
                        rows={2}
                        placeholder="Ask for a change, like “add a settings screen”"
                        className="field-sizing-content block max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-2 pt-1 text-[14px] leading-relaxed text-ink outline-none placeholder:text-graphite/70"
                    />
                    <div className="flex items-center justify-between pl-2">
                        <span className="text-[12px] text-graphite/80">Enter to send · Shift+Enter for a new line</span>
                        <button
                            type="submit"
                            disabled={!canSend}
                            aria-label="Send"
                            className="grid size-9 place-items-center rounded-full bg-ink text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ArrowUp className="size-4" />
                        </button>
                    </div>
                </div>
            </form>
        </section>
    );
}
