import Link from "next/link";
import { cn } from "@/lib/utils";

// The ndstill logo: just the name, set in the display face
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "rounded-lg font-display text-[20px] font-semibold tracking-[-0.02em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-4 focus-visible:ring-offset-frost",
        className,
      )}
    >
      ndstill
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
