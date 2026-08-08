import { AssetContentRouter } from "./AssetContentRouter";
import { AssetExplorer } from "./AssetExplorer";
import { OnChainTransactionRetryBanner } from "./OnChainTransactionRetryBanner";
import { WorkflowAgentPanel } from "./WorkflowAgentPanel";
import { useLoadScriptReference } from "../../hooks/useLoadScriptReference";
import { ControlModeEditorSyncProvider } from "../../hooks/useControlModeEditorSync";
import { ControlModeWalrusSessionProvider } from "../../hooks/useControlModeWalrusSession";
import { useControlModeActions } from "../../hooks/useControlModeActions";
import { ProjectAssetsProvider } from "../../hooks/useProjectAssets";
import { WorkspaceSelectionProvider } from "../../hooks/useWorkspaceSelection";

interface ControlModeViewProps {
  projectId: string;
  onOpenSettings?: () => void;
}

function ControlModeWorkspace({
  projectId,
  onOpenSettings,
}: ControlModeViewProps) {
  const loadScriptReference = useLoadScriptReference(projectId);
  const actions = useControlModeActions({ projectId, onOpenSettings });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <OnChainTransactionRetryBanner projectId={projectId} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <AssetExplorer projectId={projectId} />
      <AssetContentRouter
        projectId={projectId}
        onOpenSettings={onOpenSettings}
      />
      <WorkflowAgentPanel
        projectId={projectId}
        onOpenSettings={onOpenSettings}
        onApplyContent={async (content, options) => {
          await actions.applyContent(content, options);
        }}
        onPreviewContent={actions.previewContent}
        loadScriptReference={loadScriptReference}
        onGenerateVideo={actions.generateVideo}
        onGenerateCharacterSheet={actions.generateCharacterSheet}
        onGenerateImage={actions.generateImage}
        onGenerateStoryboardImage={actions.generateStoryboardImage}
        onGenerateStoryboardPlan={actions.generateStoryboardPlan}
      />
      </div>
    </div>
  );
}

export function ControlModeView({
  projectId,
  onOpenSettings,
}: ControlModeViewProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <WorkspaceSelectionProvider>
        <ControlModeEditorSyncProvider>
          <ControlModeWalrusSessionProvider>
            <ProjectAssetsProvider projectId={projectId}>
              <ControlModeWorkspace
                projectId={projectId}
                onOpenSettings={onOpenSettings}
              />
            </ProjectAssetsProvider>
          </ControlModeWalrusSessionProvider>
        </ControlModeEditorSyncProvider>
      </WorkspaceSelectionProvider>
    </div>
  );
}
