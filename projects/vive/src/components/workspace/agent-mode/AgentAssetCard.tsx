import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { WorkflowStage, WorkflowStageStatus } from "../../../lib/workflow";
import { WORKFLOW_STAGES } from "../../../lib/workflow";
import { AgentStageContentPreview } from "./AgentStageContentPreview";

interface AgentAssetCardProps {
  projectId: string;
  stage: WorkflowStage;
  status: WorkflowStageStatus;
  assetIds: string[];
  assetItems?: Array<{
    id: string;
    label: string;
    detail?: string;
  }>;
  storyboardPlanAssetIds?: string[];
  error?: string;
  expanded: boolean;
  highlighted?: boolean;
  onToggle: () => void;
  onOpenInControl?: () => void;
}

function isInlinePreviewStage(stage: WorkflowStage): boolean {
  return (
    stage === "script" ||
    stage === "characters" ||
    stage === "environments" ||
    stage === "storyboard_sheets" ||
    stage === "video_clips"
  );
}

function StageSkeleton({ stage }: { stage: WorkflowStage }) {
  if (stage === "script") {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded bg-bg-raised"
            style={{ width: `${70 + (index % 3) * 10}%` }}
          />
        ))}
      </div>
    );
  }

  if (stage === "characters" || stage === "environments") {
    return (
      <div className="grid grid-cols-2 gap-2 p-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="aspect-square animate-pulse rounded-md bg-bg-raised"
          />
        ))}
      </div>
    );
  }

  if (stage === "storyboard_plan") {
    return (
      <div className="grid grid-cols-3 gap-2 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded bg-bg-raised"
          />
        ))}
      </div>
    );
  }

  if (stage === "storyboard_sheets" || stage === "video_clips") {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="aspect-video animate-pulse rounded-md bg-bg-raised" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function statusIcon(status: WorkflowStageStatus) {
  switch (status) {
    case "working":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-resolve-accent" />;
    case "done":
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-approved" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive-foreground" />;
    case "preview":
      return <CheckCircle2 className="h-3.5 w-3.5 text-resolve-accent" />;
    default:
      return <span className="h-2 w-2 rounded-full bg-text-disabled" />;
  }
}

function statusLabel(status: WorkflowStageStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "working":
      return "Generating…";
    case "preview":
      return "Ready for review";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function AgentAssetCard({
  projectId,
  stage,
  status,
  assetIds,
  assetItems = [],
  storyboardPlanAssetIds = [],
  error,
  expanded,
  highlighted = false,
  onToggle,
  onOpenInControl,
}: AgentAssetCardProps) {
  const label =
    WORKFLOW_STAGES.find((entry) => entry.id === stage)?.label ?? stage;

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel transition-colors duration-300",
        highlighted && "border-resolve-accent ring-1 ring-resolve-accent/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-bg-raised/60"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {statusIcon(status)}
            <span className="truncate text-[13px] font-medium">{label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-secondary">
            {error ?? statusLabel(status)}
            {assetIds.length > 0 ? ` · ${assetIds.length} asset${assetIds.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle">
          {status === "working" ? (
            <StageSkeleton stage={stage} />
          ) : isInlinePreviewStage(stage) && assetIds.length > 0 ? (
            <div className="space-y-2 p-3">
              <AgentStageContentPreview
                projectId={projectId}
                stage={stage}
                assetIds={assetIds}
                assetItems={assetItems}
                storyboardPlanAssetIds={storyboardPlanAssetIds}
              />
              {onOpenInControl && (
                <button
                  type="button"
                  onClick={onOpenInControl}
                  className="rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:border-border-focus"
                >
                  Open in Control
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {assetItems.length > 0 ? (
                <ul className="space-y-1 text-[11px] text-text-secondary">
                  {assetItems.map((asset) => (
                    <li key={asset.id} className="rounded border border-border-subtle bg-bg-raised/40 px-2 py-1.5">
                      <p className="truncate font-medium text-foreground">{asset.label}</p>
                      {asset.detail ? (
                        <p className="mt-0.5 truncate text-[10px] text-text-secondary">
                          {asset.detail}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : assetIds.length > 0 ? (
                <ul className="space-y-1 text-[11px] text-text-secondary">
                  {assetIds.map((assetId) => (
                    <li key={assetId} className="truncate font-mono">
                      {assetId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-text-secondary">
                  No assets generated yet.
                </p>
              )}
              {onOpenInControl && assetIds.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenInControl}
                  className="rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:border-border-focus"
                >
                  Open in Control
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
