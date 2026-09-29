import { BACKEND_URL } from "@/config";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useState } from "react";

export interface Prompt {
    id: string;
    content: string;
    type: "USER" | "SYSTEM";
    createdAt: string;
}

export function usePrompts(projectId: string) {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const { getToken } = useAuth();

    useEffect(() => {
        async function getPrompts() {
            // Don't poll while the tab is in the background
            if (document.hidden) {
                return;
            }
            const token = await getToken();
            axios.get(`${BACKEND_URL}/prompts/${projectId}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }).then((res) => {
                setPrompts(res.data.prompts);
            }).catch(() => {});
        }
        getPrompts();
        let interval = setInterval(getPrompts, 3000);
        return () => clearInterval(interval);
    }, [projectId]);

    return {
        prompts,
    };
}