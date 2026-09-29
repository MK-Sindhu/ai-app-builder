import type { CSSProperties } from "react";
import { Appbar } from "@/components/Appbar";
import { Prompt } from "@/components/Prompt";

export default function Home() {
  return (
    <div className="min-h-dvh bg-frost bg-[radial-gradient(1100px_560px_at_50%_-10%,#ffffff_25%,transparent_72%)]">
      <Appbar />
      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-14 sm:pt-24">
        <h1 className="rise text-center font-display text-[31px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[56px] sm:leading-[1.04] lg:text-[64px]">
          Websites,
          <br />
          from a sentence.
        </h1>
        <p
          className="rise mx-auto mt-5 max-w-[540px] text-balance text-center text-[16px] leading-relaxed text-graphite sm:text-[17px]"
          style={{ "--delay": "90ms" } as CSSProperties}
        >
          Describe your site in plain words. ndstill writes the React code, installs what it needs,
          and shows it live as it builds.
        </p>
        <div className="rise mt-10" style={{ "--delay": "180ms" } as CSSProperties}>
          <Prompt />
        </div>
      </main>
    </div>
  );
}
