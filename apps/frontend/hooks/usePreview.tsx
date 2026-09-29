import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

export type PreviewState =
    | { status: "starting" }
    | { status: "ready"; machineId: string; url: string }
    | { status: "failed"; error: string };

// How often to ask while the preview starts, and once it's running (to notice if it stops)
const STARTING_MS = 5000;
const READY_MS = 30_000;

// The project's preview: the web version of the app, served by Expo's dev server on its machine
export function usePreview(projectId: string) {
    const [preview, setPreview] = useState<PreviewState>({ status: "starting" });
    const { getToken } = useAuth();

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        async function check() {
            let next = STARTING_MS;
            // Don't poll while the tab is in the background
            if (!document.hidden) {
                try {
                    const token = await getToken();
                    const res = await axios.get(`${BACKEND_URL}/project/${projectId}/preview`, {
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    const state: PreviewState = res.data;
                    if (!stopped) {
                        // Every answer has a fresh sign-in link, so keep the current one (and don't reload
                        // the preview) unless the project got a different machine
                        setPreview((current) =>
                            state.status === "ready" && current.status === "ready" && current.machineId === state.machineId ? current : state,
                        );
                    }
                    if (state.status === "ready") {
                        next = READY_MS;
                    }
                } catch {
                    // Keep showing the last state and ask again
                }
            }
            if (!stopped) {
                timer = setTimeout(check, next);
            }
        }

        check();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [projectId]);

    return preview;
}
