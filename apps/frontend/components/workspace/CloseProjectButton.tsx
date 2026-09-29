"use client";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { CircleAlert, LoaderCircle, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/config";
import { describeRequestError } from "@/lib/errors";

// Shuts down the project's machine so it's free for someone else, after asking first
export function CloseProjectButton({ projectId }: { projectId: string }) {
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [error, setError] = useState("");
    const { getToken } = useAuth();
    const router = useRouter();

    async function closeProject() {
        setClosing(true);
        setError("");
        try {
            const token = await getToken();
            await axios.post(`${BACKEND_URL}/project/${projectId}/close`, {}, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            // Leave right away: staying on the page would ask for a machine again
            router.push("/");
        } catch (e) {
            setError(describeRequestError(e, "close the project"));
            setClosing(false);
        }
    }

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!closing) {
                    setOpen(next);
                    setError("");
                }
            }}
        >
            <Dialog.Trigger asChild>
                <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-paper px-3.5 text-[14px] font-medium text-ink outline-none transition-colors hover:border-ink/20 focus-visible:ring-2 focus-visible:ring-ink/30"
                >
                    <Power className="size-4" />
                    <span className="hidden sm:inline">Close project</span>
                </button>
            </Dialog.Trigger>

            <Dialog.Portal>
                <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" />
                <Dialog.Content className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-paper p-6 shadow-[0_24px_48px_-24px_rgba(21,20,31,0.35)] outline-none">
                    <Dialog.Title className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
                        Close this project?
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-[14px] leading-relaxed text-graphite">
                        Its machine shuts down so someone else can use it, and the code on it is deleted. Your chat stays,
                        and opening the project again starts a fresh machine.
                    </Dialog.Description>

                    {error && (
                        <p role="alert" className="mt-4 flex items-start gap-2 text-[13px] leading-snug text-destructive">
                            <CircleAlert className="mt-px size-3.5 shrink-0" />
                            {error}
                        </p>
                    )}

                    <div className="mt-6 flex justify-end gap-2">
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                disabled={closing}
                                className="h-9 rounded-full px-4 text-[14px] font-medium text-graphite outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40"
                            >
                                Cancel
                            </button>
                        </Dialog.Close>
                        <button
                            type="button"
                            onClick={closeProject}
                            disabled={closing}
                            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-medium text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:opacity-60"
                        >
                            {closing && <LoaderCircle className="size-4 animate-spin" />}
                            {closing ? "Closing" : "Close project"}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
