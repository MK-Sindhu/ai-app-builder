import { CircleAlert } from "lucide-react";
import type { PreviewState } from "@/hooks/usePreview";
import { LoadingDots } from "./LoadingDots";

// The app running in a phone-sized frame. `reloadKey` changes to reload it.
export function WebPreview({ preview, reloadKey }: { preview: PreviewState; reloadKey: number }) {
    if (preview.status === "starting") {
        return (
            <div className="grid flex-1 place-items-center p-8 text-center">
                <div className="flex flex-col items-center">
                    <LoadingDots />
                    <h2 className="mt-6 font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">Starting the preview</h2>
                    <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-graphite">
                        Expo is getting your app ready. It appears here by itself, usually a minute or two after the machine is ready.
                    </p>
                </div>
            </div>
        );
    }

    if (preview.status === "failed") {
        return (
            <div className="grid flex-1 place-items-center p-8 text-center">
                <div className="flex max-w-[420px] flex-col items-center">
                    <CircleAlert className="size-6 text-destructive" />
                    <h2 className="mt-4 font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">The preview stopped</h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-graphite">It restarts by itself in a few seconds. Expo said:</p>
                    <code className="mt-3 w-full break-words rounded-xl bg-frost px-3 py-2 text-left font-mono text-[12.5px] text-ink">
                        {preview.error}
                    </code>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-frost p-6">
            <div className="aspect-[390/844] h-full max-h-[780px] rounded-[46px] bg-ink p-[10px] shadow-[0_30px_60px_-30px_rgba(21,20,31,0.45)]">
                <iframe
                    key={reloadKey}
                    src={preview.url}
                    title="App preview"
                    className="size-full rounded-[36px] bg-white"
                />
            </div>
        </div>
    );
}
