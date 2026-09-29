import { ExternalLink } from "lucide-react";
import { LogoMark } from "../Brand";

// The editor URL without its one-time sign-in token. The browser already has the project's
// cookie once the editor has loaded here, so this address works in a new tab as well.
function withoutToken(url: string) {
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete("bolty_token");
        return parsed;
    } catch {
        return null;
    }
}

export function CodePanel({ url }: { url: string | null }) {
    const openUrl = url ? withoutToken(url) : null;

    return (
        <section aria-label="Code" className="flex min-h-[70dvh] flex-1 flex-col p-3 lg:min-h-0 lg:pl-0">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-paper shadow-[0_24px_48px_-32px_rgba(21,20,31,0.3)]">
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline px-4">
                    <div className="flex items-center gap-2 text-[13px]">
                        <span className="font-medium text-ink">Code</span>
                        {openUrl && <span className="hidden font-mono text-[12px] text-graphite sm:inline">{openUrl.host}</span>}
                    </div>
                    {openUrl && (
                        <a
                            href={openUrl.toString()}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-graphite outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30"
                        >
                            Open in new tab
                            <ExternalLink className="size-3.5" />
                        </a>
                    )}
                </div>

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
                            <LogoMark size="lg" animated />
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
        </section>
    );
}
