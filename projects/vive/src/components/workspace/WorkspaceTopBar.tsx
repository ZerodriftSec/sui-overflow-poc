import { Sparkles } from "lucide-react";
import type { WorkspaceMode } from "../../lib/workflow";
import type { Project } from "../../lib/project";
import { AppTopBar } from "../AppTopBar";

interface WorkspaceTopBarProps {
  project: Project;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onOpenSettings: () => void;
  showSetupIndicator?: boolean;
}

export function WorkspaceTopBar({
  project,
  workspaceMode,
  onWorkspaceModeChange,
  onOpenSettings,
  showSetupIndicator = false,
}: WorkspaceTopBarProps) {
  return (
    <AppTopBar
      centerTitle={project.title}
      onOpenSettings={onOpenSettings}
      showSetupIndicator={showSetupIndicator}
      trailing={
        workspaceMode === "control" ? (
          <button
            type="button"
            onClick={() => onWorkspaceModeChange("agent")}
            className="inline-flex items-center gap-1.5 rounded-sm border border-resolve-accent/50 bg-resolve-accent/10 px-2.5 py-1 text-[11px] font-medium text-resolve-accent transition-colors hover:border-resolve-accent hover:bg-resolve-accent/15"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Agent
          </button>
        ) : null
      }
    />
  );
}
