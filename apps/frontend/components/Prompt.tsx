"use client";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Send } from "lucide-react";
import axios from "axios";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/config";
import { useRouter } from "next/navigation";
export function Prompt() {
  const [prompt, setPrompt] = useState("");
  // Kept so retrying after "no machine free" reuses the same project
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { getToken } = useAuth();
  const router = useRouter();

  return (
    <div>
      <Textarea placeholder="Create a chess application..." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      {error && <div className="text-sm text-red-500 pt-2">{error}</div>}
      <div className="flex justify-end pt-2">
        <Button onClick={async () => {
            setError("");
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
  );
}
