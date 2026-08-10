import { useState } from "react";
import type { WorkspaceMode } from "../../lib/workflow";
import type { Project } from "../../lib/project";
import { AgentModeOverlay } from "./agent-mode/AgentModeOverlay";
import { ControlModeView } from "./ControlModeView";
import { WorkspaceTopBar } from "./WorkspaceTopBar";

interface WorkspaceShellProps {
  project: Project;
  onOpenSettings: () => void;
  showSetupIndicator?: boolean;
}

export function WorkspaceShell({
  project,
  onOpenSettings,
  showSetupIndicator = false,
}: WorkspaceShellProps) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("control");

  function handleWorkspaceModeChange(mode: WorkspaceMode) {
    if (mode === "agent" && showSetupIndicator) {
      onOpenSettings();
      return;
    }
    setWorkspaceMode(mode);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-app text-foreground">
      <WorkspaceTopBar
        project={project}
        workspaceMode={workspaceMode}
        onWorkspaceModeChange={handleWorkspaceModeChange}
        onOpenSettings={onOpenSettings}
        showSetupIndicator={showSetupIndicator}
      />

      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {workspaceMode === "control" ? (
          <ControlModeView
            projectId={project.id}
            onOpenSettings={onOpenSettings}
          />
        ) : null}
      </div>

      <AgentModeOverlay
        projectId={project.id}
        projectTitle={project.title}
        open={workspaceMode === "agent"}
        onClose={() => setWorkspaceMode("control")}
        onModeChange={handleWorkspaceModeChange}
      />
    </div>
  );
}
