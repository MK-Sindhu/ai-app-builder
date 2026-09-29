import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const DOT_COLORS = ["bg-tomato", "bg-sun", "bg-mint", "bg-sky"];

// The ndstill mark: an app icon holding four dots in the starter colours.
// Animated, the dots take turns, which the workspace uses while a machine starts.
export function LogoMark({ size = "sm", animated = false, className }: { size?: "sm" | "lg"; animated?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 grid-cols-2 place-content-center bg-ink",
        size === "sm" ? "size-6 gap-[3px] rounded-[7px]" : "size-14 gap-[6px] rounded-[17px]",
        className,
      )}
    >
      {DOT_COLORS.map((color, i) => (
        <span
          key={color}
          className={cn("rounded-full", color, size === "sm" ? "size-[5px]" : "size-[11px]", animated && "blink-dot")}
          style={animated ? ({ "--delay": `${i * 400}ms` } as CSSProperties) : undefined}
        />
      ))}
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-4 focus-visible:ring-offset-frost">
      <LogoMark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">ndstill</span>
    </Link>
  );
}

// The same gradient every app-icon tile uses: lighter at the top, the full colour at the bottom
export function tileBackground(color: string) {
  return `linear-gradient(155deg, color-mix(in oklab, ${color} 60%, white), ${color})`;
}

const PROJECT_COLORS = ["#ff5b3a", "#ffb020", "#1db67a", "#2e8bff", "#8b5cf6", "#f0487d", "#12b5a6"];

// Every project gets its own icon colour, picked from its id so it's the same everywhere it appears
export function projectColor(projectId: string) {
  let sum = 0;
  for (const char of projectId) {
    sum += char.charCodeAt(0);
  }
  return PROJECT_COLORS[sum % PROJECT_COLORS.length];
}

export function ProjectTile({ projectId, className }: { projectId: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]", className)}
      style={{ backgroundImage: tileBackground(projectColor(projectId)) }}
    />
  );
}
