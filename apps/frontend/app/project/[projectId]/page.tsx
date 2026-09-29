"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BACKEND_URL } from "@/config";
import { Send } from "lucide-react";
import { usePrompts } from "@/hooks/usePrompts";
import { useActions } from "@/hooks/useActions";
import { useMachine } from "@/hooks/useMachine";
import axios from "axios";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";

export default function ProjectPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { prompts } = usePrompts(projectId);
    const { actions } = useActions(projectId);
    const { codeServerUrl } = useMachine(projectId);
    const [prompt, setPrompt] = useState("");
    const [error, setError] = useState("");
    const { getToken } = useAuth();

    return <div>
        <div className="flex h-screen">
            <div className="w-1/4 h-screen flex flex-col justify-between p-4">
                <div>
                    Chat history
                    {prompts.filter((prompt) => prompt.type === "USER").map((prompt) => (
                        <div key={prompt.id}>
                            {prompt.content}
                        </div>
                    ))}
                    {actions.map((action) => (
                        <div key={action.id}>
                            {action.content}
                        </div>
                    ))}
                </div>
                <div className="pb-8">
                    {error && <div className="text-sm text-red-500 pb-2">{error}</div>}
                    <div className="flex gap-2">
                        <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                        <Button onClick={async () => {
                            setError("");
                            const token = await getToken();
                            try {
                                await axios.post(`${BACKEND_URL}/prompt`, {
                                    projectId: projectId,
                                    prompt: prompt,
                                }, {
                                    headers: {
                                        "Authorization": `Bearer ${token}`
                                    }
                                });
                                setPrompt("");
                            } catch (e) {
                                if (axios.isAxiosError(e) && e.response?.status === 503) {
                                    setError("All machines are busy. A new one is starting, try again in a minute.");
                                } else {
                                    setError("Something went wrong, please try again.");
                                }
                            }
                        }}>
                            <Send />
                        </Button>
                    </div>
                </div>
            </div>
            <div className="w-3/4 p-8">
                {codeServerUrl
                    ? <iframe src={codeServerUrl} width={"100%"}  height={"100%"}/>
                    : <div>Starting your machine...</div>}
            </div>
        </div>
    </div>
}
