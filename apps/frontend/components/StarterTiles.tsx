import { CookingPot, Crown, Droplet, Dumbbell, Flame, Layers, NotebookPen, Receipt, type LucideIcon } from "lucide-react";
import { tileBackground } from "./Brand";

type Starter = {
  label: string;
  color: string;
  icon: LucideIcon;
  prompt: string;
};

const STARTERS: Starter[] = [
  { label: "Habits", color: "#ff5b3a", icon: Flame, prompt: "A habit tracker where I add daily habits, tick them off each day, and see my current streak for each one." },
  { label: "Water", color: "#2e8bff", icon: Droplet, prompt: "An app that counts the glasses of water I drink each day, with a daily goal and a chart of the last seven days." },
  { label: "Split bill", color: "#1db67a", icon: Receipt, prompt: "An app to split a restaurant bill: enter the total, the tip, and the people, and it shows what each person owes." },
  { label: "Recipes", color: "#ffb020", icon: CookingPot, prompt: "A recipe box where I save recipes with ingredients and steps, and search them by name or ingredient." },
  { label: "Workouts", color: "#f0487d", icon: Dumbbell, prompt: "A workout log where I record exercises, sets, reps, and weight, and see my progress for each exercise over time." },
  { label: "Flashcards", color: "#8b5cf6", icon: Layers, prompt: "A flashcard app where I make decks, flip through cards, and mark which ones I got right so I can review the rest." },
  { label: "Chess", color: "#15141f", icon: Crown, prompt: "A two-player chess game on one phone that only allows legal moves and shows whose turn it is." },
  { label: "Journal", color: "#12b5a6", icon: NotebookPen, prompt: "A daily journal with a mood picker for each entry and a calendar that shows the mood of past days." },
];

// Starter ideas laid out like apps on a home screen. Picking one fills in the prompt.
export function StarterTiles({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div>
      <p className="text-center text-[13px] text-graphite">Or start from an idea</p>
      <ul className="mx-auto mt-5 grid max-w-[560px] grid-cols-4 gap-x-2 gap-y-6 sm:max-w-none sm:grid-cols-8">
        {STARTERS.map(({ label, color, icon: Icon, prompt }) => (
          <li key={label} className="flex justify-center">
            <button
              type="button"
              onClick={() => onSelect(prompt)}
              className="app-tile group flex w-full flex-col items-center gap-2 rounded-2xl py-1 outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              <span
                className="app-tile-icon grid size-14 place-items-center rounded-[17px]"
                style={{
                  backgroundImage: tileBackground(color),
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 18px -10px ${color}`,
                }}
              >
                <Icon className="size-6 text-white" strokeWidth={2.2} />
              </span>
              <span className="text-[12px] font-medium text-graphite transition-colors group-hover:text-ink">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
