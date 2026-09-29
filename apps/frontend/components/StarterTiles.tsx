import { Briefcase, CalendarDays, Coffee, LayoutDashboard, PenLine, Rocket, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { tileBackground } from "./Brand";

type Starter = {
  label: string;
  color: string;
  icon: LucideIcon;
  prompt: string;
};

const STARTERS: Starter[] = [
  { label: "Portfolio", color: "#ff5b3a", icon: Briefcase, prompt: "A personal portfolio with a short intro, a grid of my projects with links, and a contact form." },
  { label: "Café", color: "#ffb020", icon: Coffee, prompt: "A landing page for a coffee shop with a big hero photo, the menu with prices, and opening hours." },
  { label: "Store", color: "#1db67a", icon: ShoppingBag, prompt: "A small online store with a product grid, a page for each product, and a cart that remembers what I added." },
  { label: "Event", color: "#2e8bff", icon: CalendarDays, prompt: "A page for a one-day conference with the schedule, the speakers, and a sign-up form." },
  { label: "Blog", color: "#8b5cf6", icon: PenLine, prompt: "A blog with a list of posts, a page for each post, and tags to filter posts by topic." },
  { label: "Dashboard", color: "#15141f", icon: LayoutDashboard, prompt: "A sales dashboard with summary cards, a revenue chart for the last 30 days, and a table of recent orders." },
  { label: "Launch", color: "#f0487d", icon: Rocket, prompt: "A launch page for a new app with a hero, a features section, three pricing plans, and FAQs." },
  { label: "Recipes", color: "#12b5a6", icon: UtensilsCrossed, prompt: "A recipe site where I can browse recipes, search by ingredient, and save favourites." },
];

// Starter ideas as a row of colourful tiles. Picking one fills in the prompt.
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
