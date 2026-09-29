"use client";
import { ExternalLink, Monitor, RotateCw, Smartphone } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePreview } from "@/hooks/usePreview";
import { LoadingDots } from "./LoadingDots";
import { WebPreview, type Device } from "./WebPreview";

type Tab = "code" | "preview";

const TABS: { id: Tab; label: string }[] = [
    { id: "preview", label: "Preview" },
    { id: "code", label: "Code" },
];

const DEVICES: { id: Device; label: string; icon: typeof Monitor }[] = [
    { id: "desktop", label: "Desktop", icon: Monitor },
    { id: "mobile", label: "Mobile", icon: Smartphone },
];

// A router URL without its one-time sign-in token. Once the page has loaded here, the browser has the
// project's cookie, so the address also works in a new tab.
function withoutToken(url: string) {
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete("bolty_token");
        return parsed;
    } catch {
        return null;
    }
}

const toolbarLink =
    "inline-flex items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-graphite outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30";

export function CodePanel({ projectId, url }: { projectId: string; url: string | null }) {
    // The site is what people come for, so it shows first
    const [tab, setTab] = useState<Tab>("preview");
    const [device, setDevice] = useState<Device>("desktop");
    const [previewReloads, setPreviewReloads] = useState(0);
    const preview = usePreview(projectId);

    const editorUrl = url ? withoutToken(url) : null;
    const previewUrl = preview.status === "ready" ? withoutToken(preview.url) : null;

    return (
        <section aria-label="Code and preview" className="flex min-h-[70dvh] flex-1 flex-col p-3 lg:min-h-0 lg:pl-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-paper shadow-[0_24px_48px_-32px_rgba(21,20,31,0.3)]">
                <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
                    <div role="tablist" aria-label="Show" className="inline-flex rounded-full bg-frost p-0.5">
                        {TABS.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={tab === id}
                                onClick={() => setTab(id)}
                                className={cn(
                                    "flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/30",
                                    tab === id ? "bg-paper text-ink shadow-[0_1px_2px_rgba(21,20,31,0.08)]" : "text-graphite hover:text-ink",
                                )}
                            >
                                {label}
                                {id === "preview" && (
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-1.5 rounded-full",
                                            preview.status === "ready" ? "bg-mint" : preview.status === "failed" ? "bg-destructive" : "animate-pulse bg-sun",
                                        )}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        {tab === "preview" && previewUrl && (
                            <div role="radiogroup" aria-label="Preview size" className="inline-flex rounded-full bg-frost p-0.5">
                                {DEVICES.map(({ id, label, icon: Icon }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="radio"
                                        aria-checked={device === id}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => setDevice(id)}
                                        className={cn(
                                            "grid size-7 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/30",
                                            device === id ? "bg-paper text-ink shadow-[0_1px_2px_rgba(21,20,31,0.08)]" : "text-graphite hover:text-ink",
                                        )}
                                    >
                                        <Icon className="size-3.5" />
                                    </button>
                                ))}
                            </div>
                        )}
                        {tab === "preview" && previewUrl && (
                            <button type="button" onClick={() => setPreviewReloads((n) => n + 1)} className={toolbarLink}>
                                <RotateCw className="size-3.5" />
                                Reload
                            </button>
                        )}
                        {(tab === "code" ? editorUrl : previewUrl) && (
                            <a
                                href={(tab === "code" ? editorUrl : previewUrl)!.toString()}
                                target="_blank"
                                rel="noreferrer"
                                className={toolbarLink}
                            >
                                Open in new tab
                                <ExternalLink className="size-3.5" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Kept loaded while the preview is showing, so switching back doesn't reload the editor */}
                <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "code" && "hidden")}>
                    {url ? (
                        <iframe
                            src={url}
                            title="Code editor"
                            allow="clipboard-read; clipboard-write"
                            className="min-h-0 w-full flex-1 bg-[#1e1e1e]"
                        />
                    ) : (
                        <div className="grid flex-1 place-items-center p-8 text-center">
                            <div className="flex flex-col items-center">
                                <LoadingDots />
                                <h2 className="mt-6 font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
                                    Setting up a machine for this project
                                </h2>
                                <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-graphite">
                                    The first start can take a few minutes. The editor opens here by itself when it&apos;s ready.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Also kept loaded, so the app keeps its state while you look at the code */}
                <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "preview" && "hidden")}>
                    <WebPreview preview={preview} device={device} reloadKey={previewReloads} />
                </div>
            </div>
        </section>
    );
}
