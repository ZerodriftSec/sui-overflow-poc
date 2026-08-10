import type { ReactNode } from "react";
import { storagePhaseForFolder } from "../../lib/asset-catalog";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { DesignPhaseView } from "./design/DesignPhaseView";
import { FilmPhaseView } from "./film/FilmPhaseView";
import { ScriptPhaseView } from "./script/ScriptPhaseView";
import { StoryboardPhaseView } from "./storyboard/StoryboardPhaseView";

interface AssetContentRouterProps {
  projectId: string;
  onOpenSettings?: () => void;
}

function AssetContentFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}

export function AssetContentRouter({
  projectId,
  onOpenSettings,
}: AssetContentRouterProps) {
  const { selection } = useWorkspaceSelection();
  const folderId = selection.folderId ?? "scripts";
  const storagePhase = storagePhaseForFolder(folderId);
  const externalSelectedId = selection.assetId;

  if (storagePhase === "design") {
    return (
      <AssetContentFrame>
        <DesignPhaseView
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          embedded
          externalSelectedId={externalSelectedId}
        />
      </AssetContentFrame>
    );
  }

  if (storagePhase === "storyboard") {
    return (
      <AssetContentFrame>
        <StoryboardPhaseView
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          embedded
          externalSelectedId={externalSelectedId}
        />
      </AssetContentFrame>
    );
  }

  if (storagePhase === "film") {
    return (
      <AssetContentFrame>
        <FilmPhaseView
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          embedded
          externalSelectedId={externalSelectedId}
        />
      </AssetContentFrame>
    );
  }

  return (
    <AssetContentFrame>
      <ScriptPhaseView
        projectId={projectId}
        onOpenSettings={onOpenSettings}
        embedded
        externalSelectedId={externalSelectedId}
      />
    </AssetContentFrame>
  );
}
