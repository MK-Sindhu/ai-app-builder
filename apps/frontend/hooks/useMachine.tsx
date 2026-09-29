import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

// While the project page is open we ask for its machine every minute. If the orchestrator's
// IDLE_TIMEOUT_MINUTES is set, this is what keeps an open project's machine alive.
const HEARTBEAT_MS = 60 * 1000;
// How soon to ask again when no machine is free yet
const RETRY_MS = 5000;

export function useMachine(projectId: string) {
    const [codeServerUrl, setCodeServerUrl] = useState<string | null>(null);
    const { getToken } = useAuth();

    useEffect(() => {
        let stopped = false;
        let busy = false;
        let timer: ReturnType<typeof setTimeout>;

        async function getMachine() {
            // One request at a time, so returning to the tab mid-request doesn't start a second loop
            if (busy) {
                return;
            }
            busy = true;
            clearTimeout(timer);
            let next = HEARTBEAT_MS;

            // Skip while the tab is in the background, so a forgotten tab doesn't hold a machine forever
            if (!document.hidden) {
                try {
                    const token = await getToken();
                    const res = await axios.get(`${BACKEND_URL}/project/${projectId}/machine`, {
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    // Changes when the old machine was released and the project got a new one
                    if (!stopped) {
                        setCodeServerUrl(res.data.codeServerUrl);
                    }
                } catch (e) {
                    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
                    // Not this user's project, stop asking
                    if (status === 404) {
                        return;
                    }
                    if (status === 503) {
                        next = RETRY_MS;
                    }
                }
            }

            busy = false;
            if (!stopped) {
                timer = setTimeout(getMachine, next);
            }
        }

        // Ask right away when the user comes back to the tab
        function onVisibilityChange() {
            if (!document.hidden) {
                getMachine();
            }
        }

        getMachine();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            stopped = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [projectId]);

    return {
        codeServerUrl,
    };
}
