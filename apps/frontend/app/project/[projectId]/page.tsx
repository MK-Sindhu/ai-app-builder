"use client";
import { usePrompts } from "@/hooks/usePrompts";
import { useActions } from "@/hooks/useActions";
import { useMachine } from "@/hooks/useMachine";
import { useParams } from "next/navigation";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { CodePanel } from "@/components/workspace/CodePanel";

export default function ProjectPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const { prompts } = usePrompts(projectId);
    const { actions } = useActions(projectId);
    const { codeServerUrl } = useMachine(projectId);

    // The project is named after the first line of its first message
    const title = prompts.find((p) => p.type === "USER")?.content.split("\n")[0] || "New project";

    return (
        <div className="flex h-dvh flex-col bg-frost">
            <WorkspaceHeader projectId={projectId} title={title} machineReady={codeServerUrl !== null} />
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                <ChatPanel projectId={projectId} prompts={prompts} actions={actions} />
                <CodePanel projectId={projectId} url={codeServerUrl} />
            </div>
        </div>
    );
}
