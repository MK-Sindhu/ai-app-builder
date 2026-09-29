"use client"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { BACKEND_URL } from "@/config";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PanelLeft, Plus, Search } from "lucide-react";
import { ProjectTile } from "./Brand";
import { cn } from "@/lib/utils";

type Project = {
    id: string;
    description: string | null;
    createdAt: string;
}

// Loads the user's projects each time the drawer opens, newest first. null while loading.
function useProjects(open: boolean) {
    const { getToken } = useAuth();
    const [projects, setProjects] = useState<Project[] | null>(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const token = await getToken();
                const response = await axios.get(`${BACKEND_URL}/projects`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                const sorted = [...response.data.projects as Project[]].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
                if (!cancelled) {
                    setProjects(sorted);
                }
            } catch {
                if (!cancelled) {
                    setProjects([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    return projects;
}

function dayLabel(date: Date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysAgo = Math.round((today - day) / 86_400_000);
    if (daysAgo === 0) {
        return "Today";
    }
    if (daysAgo === 1) {
        return "Yesterday";
    }
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
}

export function ProjectsDrawer({ open, onOpenChange, currentProjectId }: { open: boolean; onOpenChange: (open: boolean) => void; currentProjectId?: string }) {
    const projects = useProjects(open);
    const [search, setSearch] = useState("");

    // Projects that match the search, grouped by the day they were created
    const groups = useMemo(() => {
        const query = search.trim().toLowerCase();
        const byDay = new Map<string, Project[]>();
        for (const project of projects ?? []) {
            if (query && !(project.description ?? "").toLowerCase().includes(query)) {
                continue;
            }
            const label = dayLabel(new Date(project.createdAt));
            byDay.set(label, [...(byDay.get(label) ?? []), project]);
        }
        return [...byDay.entries()];
    }, [projects, search]);

    return (
        <Drawer open={open} onOpenChange={onOpenChange} direction="left">
            <DrawerContent className="border-r border-hairline bg-frost">
                <DrawerHeader className="gap-4 p-5">
                    <div className="flex items-center justify-between">
                        <DrawerTitle className="font-display text-[15px] font-semibold tracking-[-0.01em]">Projects</DrawerTitle>
                        <Link
                            href="/"
                            onClick={() => onOpenChange(false)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink pl-2.5 pr-3 text-[13px] font-medium text-white outline-none hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2"
                        >
                            <Plus className="size-3.5" />
                            New project
                        </Link>
                    </div>
                    <DrawerDescription className="sr-only">Open one of your projects or start a new one</DrawerDescription>
                    <label className="flex h-9 items-center gap-2 rounded-xl border border-hairline bg-paper px-3 focus-within:border-ink/20">
                        <Search className="size-4 text-graphite" />
                        <span className="sr-only">Search projects</span>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search projects"
                            className="w-full bg-transparent text-[14px] outline-none placeholder:text-graphite/70"
                        />
                    </label>
                </DrawerHeader>

                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    {projects === null ? (
                        <p className="px-2 text-[13px] text-graphite">Loading projects…</p>
                    ) : groups.length === 0 ? (
                        <p className="px-2 text-[13px] leading-relaxed text-graphite">
                            {search ? "No projects match that search." : "No projects yet. Describe an app to start your first one."}
                        </p>
                    ) : (
                        groups.map(([label, items]) => (
                            <section key={label} className="mb-5">
                                <h3 className="px-2 pb-1.5 text-[12px] font-medium text-graphite">{label}</h3>
                                <ul>
                                    {items.map((project) => (
                                        <li key={project.id}>
                                            <Link
                                                href={`/project/${project.id}`}
                                                onClick={() => onOpenChange(false)}
                                                aria-current={project.id === currentProjectId ? "page" : undefined}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-xl px-2 py-2 text-[14px] text-ink outline-none hover:bg-paper focus-visible:ring-2 focus-visible:ring-ink/30",
                                                    project.id === currentProjectId && "bg-paper shadow-[0_1px_2px_rgba(21,20,31,0.06)]",
                                                )}
                                            >
                                                <ProjectTile projectId={project.id} className="size-7 rounded-[8px]" />
                                                <span className="truncate">{project.description || "Untitled project"}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    )
}

// The "Projects" button in the top bar, with the drawer it opens
export function ProjectsButton({ currentProjectId }: { currentProjectId?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-paper px-3.5 text-[14px] font-medium text-ink outline-none transition-colors hover:border-ink/20 focus-visible:ring-2 focus-visible:ring-ink/30"
            >
                <PanelLeft className="size-4" />
                Projects
            </button>
            <ProjectsDrawer open={open} onOpenChange={setOpen} currentProjectId={currentProjectId} />
        </>
    );
}
