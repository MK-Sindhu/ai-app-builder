import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const DOT_COLORS = ["bg-tomato", "bg-sun", "bg-mint", "bg-sky"];

// Four dots taking turns, shown while something on the machine starts
export function LoadingDots() {
    return (
        <div aria-hidden className="flex gap-2">
            {DOT_COLORS.map((color, i) => (
                <span
                    key={color}
                    className={cn("blink-dot size-2.5 rounded-full", color)}
                    style={{ "--delay": `${i * 200}ms` } as CSSProperties}
                />
            ))}
        </div>
    );
}
