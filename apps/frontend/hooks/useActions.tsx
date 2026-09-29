import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

export interface Action {
    id: string;
    content: string;
    createdAt: string;
}

export function useActions(projectId: string) {
    const [actions, setactions] = useState<Action[]>([]);
    const { getToken } = useAuth();
    useEffect(() => {
        async function getactions() {
            // Don't poll while the tab is in the background
            if (document.hidden) {
                return;
            }
            const token = await getToken();
            axios.get(`${BACKEND_URL}/actions/${projectId}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }).then((res) => {
                setactions(res.data.actions);
            }).catch(() => {});
        }
        getactions();
        let interval = setInterval(getactions, 3000);
        return () => clearInterval(interval);
    }, [projectId]);

    return {
        actions,
    };
}