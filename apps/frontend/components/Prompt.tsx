"use client";
import { ArrowRight, CircleAlert, Globe, LoaderCircle } from "lucide-react";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { BACKEND_URL } from "@/config";
import { describeRequestError } from "@/lib/errors";
import { useRouter } from "next/navigation";
import { StarterTiles } from "./StarterTiles";

export function Prompt() {
  const [prompt, setPrompt] = useState("");
  // Kept so retrying after "no machine free" reuses the same project
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const { getToken, isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);

  const canBuild = prompt.trim().length > 0 && !sending;

  async function build() {
    if (!canBuild) {
      return;
    }
    if (!isSignedIn) {
      clerk.openSignIn();
      return;
    }

    setError("");
    setSending(true);
    const token = await getToken();
    const headers = {
      "Authorization": `Bearer ${token}`
    };
    try {
      let id = projectId;
      if (!id) {
        const response = await axios.post(`${BACKEND_URL}/project`, {
          prompt: prompt,
        }, { headers });
        id = response.data.projectId as string;
        setProjectId(id);
      }
      // The backend finds this project's machine and hands the prompt to its worker
      await axios.post(`${BACKEND_URL}/prompt`, {
        projectId: id,
        prompt: prompt,
      }, { headers });
      router.push(`/project/${id}`);
    } catch (e) {
      setError(describeRequestError(e, "start the build"));
      setSending(false);
    }
  }

  return (
    <div>
      <div className="rounded-[28px] border border-hairline bg-paper p-3 shadow-[0_28px_56px_-32px_rgba(21,20,31,0.28)] transition-[border-color,box-shadow] focus-within:border-ink/20 focus-within:shadow-[0_28px_56px_-28px_rgba(21,20,31,0.36)]">
        <label htmlFor="prompt" className="sr-only">Describe your site</label>
        <textarea
          id="prompt"
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              build();
            }
          }}
          rows={3}
          placeholder="A landing page for my coffee shop with the menu and opening hours"
          className="field-sizing-content block max-h-[280px] min-h-[104px] w-full resize-none bg-transparent px-3 pt-2 text-[17px] leading-relaxed text-ink outline-none placeholder:text-graphite/70"
        />
        <div className="flex items-center justify-between gap-3 pl-2 pt-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-frost px-3 py-1.5 text-[12.5px] font-medium text-graphite">
            <Globe className="size-3.5" />
            React · Tailwind
          </span>
          <div className="flex items-center gap-3">
            <kbd className="hidden font-sans text-[12px] text-graphite/80 sm:inline">{isMac ? "⌘" : "Ctrl"} ↵</kbd>
            <button
              type="button"
              onClick={build}
              disabled={!canBuild}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-5 pr-4 text-[15px] font-medium text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {sending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Starting
                </>
              ) : (
                <>
                  Build
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 px-3 text-[14px] leading-snug text-destructive">
          <CircleAlert className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-14">
        <StarterTiles
          onSelect={(starter) => {
            setPrompt(starter);
            setError("");
            textareaRef.current?.focus();
          }}
        />
      </div>
    </div>
  );
}
