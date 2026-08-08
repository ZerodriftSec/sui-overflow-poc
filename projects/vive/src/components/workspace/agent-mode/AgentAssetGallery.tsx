import { useEffect, useMemo, useState } from "react";
import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import type { WorkflowRun, WorkflowStage } from "../../../lib/workflow";
import {
  isWorkflowStageVisible,
  WORKFLOW_STAGES,
} from "../../../lib/workflow";
import { getProject } from "../../../lib/project";
import {
  listDesignAssetsForProject,
  listFilmAssetsForProject,
  listScriptAssetsForProject,
  listStoryboardAssetsForProject,
  loadStoryboardAssetDocument,
  type WalrusNetwork,
} from "../../../lib/workspace";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import { AgentAssetCard } from "./AgentAssetCard";

interface StageAssetItem {
  id: string;
  label: string;
  detail?: string;
}

interface AgentAssetGalleryProps {
  projectId: string;
  run: WorkflowRun;
  expandedStage: WorkflowStage | null;
  highlightedStage: WorkflowStage | null;
  onToggleStage: (stage: WorkflowStage) => void;
  onOpenInControl?: (stage: WorkflowStage) => void;
}

export function AgentAssetGallery({
  projectId,
  run,
  expandedStage,
  highlightedStage,
  onToggleStage,
  onOpenInControl,
}: AgentAssetGalleryProps) {
  const walrusNetwork = useCurrentNetwork() as WalrusNetwork;
  const walrusStorage = useWalrusStorage();
  const [stageAssetItems, setStageAssetItems] = useState<
    Record<WorkflowStage, StageAssetItem[]>
  >({
    script: [],
    characters: [],
    environments: [],
    storyboard_plan: [],
    storyboard_sheets: [],
    video_clips: [],
  });

  const stageAssetIdsKey = useMemo(
    () =>
      WORKFLOW_STAGES.map(({ id }) => `${id}:${run.stages[id].assetIds.join(",")}`).join("|"),
    [run.stages],
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveStageAssetItems(): Promise<void> {
      const project = getProject(projectId);
      if (!project) {
        if (!cancelled) {
          setStageAssetItems({
            script: [],
            characters: [],
            environments: [],
            storyboard_plan: [],
            storyboard_sheets: [],
            video_clips: [],
          });
        }
        return;
      }

      try {
        const ctx = await walrusStorage.getStorageContext();
        const [scriptAssets, designAssets, storyboardAssets, filmAssets] =
          await Promise.all([
            listScriptAssetsForProject(ctx, project, walrusNetwork),
            listDesignAssetsForProject(ctx, project, walrusNetwork),
            listStoryboardAssetsForProject(ctx, project, walrusNetwork),
            listFilmAssetsForProject(ctx, project, walrusNetwork),
          ]);

        const scriptById = new Map(scriptAssets.map((asset) => [asset.id, asset]));
        const designById = new Map(designAssets.map((asset) => [asset.id, asset]));
        const storyboardById = new Map(
          storyboardAssets.map((asset) => [asset.id, asset]),
        );
        const filmById = new Map(filmAssets.map((asset) => [asset.id, asset]));

        const nextItems: Record<WorkflowStage, StageAssetItem[]> = {
          script: run.stages.script.assetIds.map((assetId, index) => {
            const asset = scriptById.get(assetId);
            return {
              id: assetId,
              label: asset?.title || `Script ${index + 1}`,
              detail: asset ? undefined : assetId,
            };
          }),
          characters: run.stages.characters.assetIds.map((assetId, index) => {
            const asset = designById.get(assetId);
            return {
              id: assetId,
              label: asset?.title || `Character ${index + 1}`,
              detail: asset ? "Character design" : assetId,
            };
          }),
          environments: run.stages.environments.assetIds.map((assetId, index) => {
            const asset = designById.get(assetId);
            return {
              id: assetId,
              label: asset?.title || `Environment ${index + 1}`,
              detail: asset ? "Environment board" : assetId,
            };
          }),
          storyboard_plan: run.stages.storyboard_plan.assetIds.map((assetId, index) => {
            const asset = storyboardById.get(assetId);
            return {
              id: assetId,
              label: asset?.title || `Storyboard ${index + 1}`,
              detail: asset ? undefined : assetId,
            };
          }),
          storyboard_sheets: [],
          video_clips: run.stages.video_clips.assetIds.map((assetId, index) => {
            const asset = filmById.get(assetId);
            return {
              id: assetId,
              label: asset?.title || `Clip ${index + 1}`,
              detail: asset ? undefined : assetId,
            };
          }),
        };

        if (run.stages.storyboard_sheets.assetIds.length > 0) {
          const sheetTitleBySegmentId = new Map<string, string>();
          for (const storyboardAssetId of run.stages.storyboard_plan.assetIds) {
            const storyboardAsset = storyboardById.get(storyboardAssetId);
            if (!storyboardAsset) {
              continue;
            }
            try {
              const document = await loadStoryboardAssetDocument(
                ctx,
                project,
                storyboardAsset,
              );
              for (const sheet of document.sheets ?? []) {
                sheetTitleBySegmentId.set(sheet.segmentId, sheet.segmentTitle);
              }
            } catch {
              // Ignore lookup failures and use fallback labels.
            }
          }

          nextItems.storyboard_sheets = run.stages.storyboard_sheets.assetIds.map(
            (assetId, index) => ({
              id: assetId,
              label:
                sheetTitleBySegmentId.get(assetId) || `Storyboard sheet ${index + 1}`,
              detail: sheetTitleBySegmentId.has(assetId)
                ? "Multi-panel sheet"
                : assetId,
            }),
          );
        }

        if (!cancelled) {
          setStageAssetItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error("Failed to resolve agent stage asset labels", loadError);
        }
      }
    }

    void resolveStageAssetItems();

    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    run.stages,
    stageAssetIdsKey,
    walrusNetwork,
    walrusStorage.getStorageContext,
    walrusStorage.projectAssetRefreshKey,
  ]);

  return (
    <div className="space-y-2">
      {WORKFLOW_STAGES.filter(({ id }) =>
        isWorkflowStageVisible(run.stages[id]),
      ).map(({ id }) => (
        <AgentAssetCard
          key={id}
          projectId={projectId}
          stage={id}
          status={run.stages[id].status}
          assetIds={run.stages[id].assetIds}
          assetItems={stageAssetItems[id]}
          storyboardPlanAssetIds={run.stages.storyboard_plan.assetIds}
          error={run.stages[id].error}
          expanded={expandedStage === id}
          highlighted={highlightedStage === id}
          onToggle={() => onToggleStage(id)}
          onOpenInControl={
            onOpenInControl ? () => onOpenInControl(id) : undefined
          }
        />
      ))}
    </div>
  );
}
