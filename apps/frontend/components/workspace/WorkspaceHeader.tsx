"use client";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Brand, ProjectTile } from "../Brand";
import { ProjectsButton } from "../ProjectsDrawer";
import { CloseProjectButton } from "./CloseProjectButton";

export function WorkspaceHeader({ projectId, title, machineReady }: { projectId: string; title: string; machineReady: boolean }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-paper/80 px-4 backdrop-blur">
            <Brand className="text-[16px] focus-visible:ring-offset-paper" />
            <span aria-hidden className="text-graphite/40">/</span>
            <div className="flex min-w-0 items-center gap-2">
                <ProjectTile projectId={projectId} className="size-5 rounded-[6px]" />
                <h1 className="truncate text-[14px] font-medium text-ink">{title}</h1>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <span
                    role="status"
                    className="hidden items-center gap-2 rounded-full border border-hairline bg-paper px-3 py-1.5 text-[12.5px] font-medium text-graphite sm:inline-flex"
                >
                    <span className={cn("size-2 rounded-full", machineReady ? "bg-mint" : "animate-pulse bg-sun")} />
                    {machineReady ? "Machine ready" : "Starting machine"}
                </span>
                <CloseProjectButton projectId={projectId} />
                <ProjectsButton currentProjectId={projectId} />
                <div className="ml-1 flex">
                    <UserButton />
                </div>
            </div>
        </header>
    );
}
