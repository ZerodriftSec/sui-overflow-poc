import { useState } from "react";
import { ImageIcon, Video } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  getOpenRouterModelLabel,
  OPENROUTER_IMAGE_MODELS,
  OPENROUTER_VIDEO_MODELS,
} from "../../../lib/openrouter-models";
import type { AgentMessage } from "../../../lib/workflow-messages";
import { ModelDropdown } from "../ModelDropdown";

interface AgentRecoveryPromptProps {
  message: Extract<AgentMessage, { type: "recovery" }>;
  highlighted?: boolean;
  onModelChange: (messageId: string, modelId: string) => void;
  onContinue: (messageId: string, modelId: string) => void;
  onAbort?: (messageId: string) => void;
}

export function AgentRecoveryPrompt({
  message,
  highlighted = false,
  onModelChange,
  onContinue,
  onAbort,
}: AgentRecoveryPromptProps) {
  const [selectedModelId, setSelectedModelId] = useState(message.selectedModelId);
  const resolved = message.resolved;
  const failedLabel = getOpenRouterModelLabel(message.failedModelId);
  const isVideoRecovery = message.kind === "video_model";
  const models = isVideoRecovery ? OPENROUTER_VIDEO_MODELS : OPENROUTER_IMAGE_MODELS;
  const modelKindLabel = isVideoRecovery ? "Video" : "Image";

  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3",
        highlighted && "ring-1 ring-destructive",
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-destructive-foreground">
        {modelKindLabel} provider error
      </div>
      <p className="mb-1 text-[11px] text-text-secondary">
        {failedLabel} failed during {message.stage.replace(/_/g, " ")}.
        Choose another {modelKindLabel.toLowerCase()} model to continue the pipeline.
      </p>
      <p className="mb-3 whitespace-pre-wrap rounded-md border border-destructive/20 bg-bg-app/40 px-2.5 py-2 text-[12px] leading-relaxed text-destructive-foreground">
        {message.error}
      </p>

      {resolved ? (
        <p className="text-[11px] text-text-secondary">
          {resolved === "continue"
            ? `Continuing with ${getOpenRouterModelLabel(message.selectedModelId)}`
            : "Paused"}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ModelDropdown
            label={modelKindLabel}
            hint={`Switch ${modelKindLabel.toLowerCase()} provider, then continue the pipeline`}
            icon={
              isVideoRecovery ? (
                <Video className="h-3 w-3 shrink-0 text-resolve-accent" />
              ) : (
                <ImageIcon className="h-3 w-3 shrink-0 text-resolve-accent" />
              )
            }
            modelId={selectedModelId}
            models={models}
            placement="bottom"
            size="md"
            onChange={(modelId) => {
              setSelectedModelId(modelId);
              onModelChange(message.id, modelId);
            }}
          />
          <button
            type="button"
            onClick={() => onContinue(message.id, selectedModelId)}
            className="rounded-md bg-resolve-accent px-3 py-1.5 text-[11px] font-medium text-bg-app hover:opacity-90"
          >
            Continue
          </button>
          {onAbort && (
            <button
              type="button"
              onClick={() => onAbort(message.id)}
              className="rounded-md px-2.5 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
            >
              Pause
            </button>
          )}
        </div>
      )}
    </div>
  );
}
