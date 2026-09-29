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
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle, PanelLeft, Plus, Search, Trash2 } from "lucide-react";
import { describeRequestError } from "@/lib/errors";
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

    return [projects, setProjects] as const;
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
    const [projects, setProjects] = useProjects(open);
    const [search, setSearch] = useState("");
    // The project whose delete button was clicked, waiting for confirmation
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const { getToken } = useAuth();
    const router = useRouter();

    async function deleteProject(projectId: string) {
        setDeleting(true);
        setDeleteError("");
        try {
            const token = await getToken();
            await axios.delete(`${BACKEND_URL}/project/${projectId}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            setProjects((current) => current?.filter((project) => project.id !== projectId) ?? null);
            setConfirmingId(null);
            // Don't leave the user on a page for a project that no longer exists
            if (projectId === currentProjectId) {
                onOpenChange(false);
                router.push("/");
            }
        } catch (e) {
            setDeleteError(describeRequestError(e, "delete the project"));
        } finally {
            setDeleting(false);
        }
    }

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
                                        <li key={project.id} className="group relative">
                                            {confirmingId === project.id ? (
                                                <div className="rounded-xl bg-paper px-3 py-2.5 shadow-[0_1px_2px_rgba(21,20,31,0.06)]">
                                                    <p className="text-[13px] leading-snug text-ink">Delete this project and its chat? This can&apos;t be undone.</p>
                                                    {deleteError && (
                                                        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-destructive">
                                                            <CircleAlert className="mt-px size-3.5 shrink-0" />
                                                            {deleteError}
                                                        </p>
                                                    )}
                                                    <div className="mt-2 flex justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setConfirmingId(null);
                                                                setDeleteError("");
                                                            }}
                                                            disabled={deleting}
                                                            className="h-7 rounded-full px-3 text-[12.5px] font-medium text-graphite outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteProject(project.id)}
                                                            disabled={deleting}
                                                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-destructive px-3 text-[12.5px] font-medium text-white outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
                                                        >
                                                            {deleting && <LoaderCircle className="size-3.5 animate-spin" />}
                                                            {deleting ? "Deleting" : "Delete"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <Link
                                                        href={`/project/${project.id}`}
                                                        onClick={() => onOpenChange(false)}
                                                        aria-current={project.id === currentProjectId ? "page" : undefined}
                                                        className={cn(
                                                            "flex items-center gap-3 rounded-xl py-2 pl-2 pr-10 text-[14px] text-ink outline-none hover:bg-paper focus-visible:ring-2 focus-visible:ring-ink/30",
                                                            project.id === currentProjectId && "bg-paper shadow-[0_1px_2px_rgba(21,20,31,0.06)]",
                                                        )}
                                                    >
                                                        <ProjectTile projectId={project.id} className="size-7 rounded-[8px]" />
                                                        <span className="truncate">{project.description || "Untitled project"}</span>
                                                    </Link>
                                                    {/* With a mouse it appears on hover; on touch screens it's always there */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setConfirmingId(project.id);
                                                            setDeleteError("");
                                                        }}
                                                        aria-label={`Delete ${project.description || "untitled project"}`}
                                                        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-graphite outline-none transition hover:bg-frost hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ink/30 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </button>
                                                </>
                                            )}
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
