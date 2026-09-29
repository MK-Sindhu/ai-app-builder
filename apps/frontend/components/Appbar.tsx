"use client";
import {
    SignInButton,
    SignUpButton,
    SignedIn,
    SignedOut,
    UserButton,
} from '@clerk/nextjs'
import { Brand } from "./Brand";
import { ProjectsButton } from "./ProjectsDrawer";

export function Appbar() {
  return (
    <header className="flex h-16 items-center justify-between px-5 sm:px-8">
      <Brand />
      <nav className="flex items-center gap-2">
        <SignedOut>
          <SignInButton mode="modal">
            <button type="button" className="h-9 rounded-full px-4 text-[14px] font-medium text-graphite outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button type="button" className="h-9 rounded-full bg-ink px-4 text-[14px] font-medium text-white outline-none transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2">
              Get started
            </button>
          </SignUpButton>
        </SignedOut>
        <SignedIn>
          <ProjectsButton />
          <div className="ml-1 flex">
            <UserButton />
          </div>
        </SignedIn>
      </nav>
    </header>
  );
}
