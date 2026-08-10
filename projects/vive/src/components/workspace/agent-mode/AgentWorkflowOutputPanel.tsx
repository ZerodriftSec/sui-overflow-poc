import { useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, Palette, Settings2, Volume2 } from "lucide-react";
import {
  formatVideoOutputSummary,
  getAgentModeMaxClipDurationSec,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "../../../lib/openrouter-models";
import { cn } from "../../../lib/utils";
import { STYLE_BRIEF_STARTERS } from "../../../lib/style-brief-starters";
import type { WorkflowOptions } from "../../../lib/workflow-options";
import { AgentDurationSlider } from "./AgentDurationSlider";
import {
  FilmVideoOutputPopover,
  getOutputPopoverAnchor,
} from "../film/FilmVideoOutputPopover";

interface AgentWorkflowOutputPanelProps {
  options: WorkflowOptions;
  disabled?: boolean;
  onChange: (patch: Partial<WorkflowOptions>) => void;
}

export function AgentWorkflowOutputPanel({
  options,
  disabled = false,
  onChange,
}: AgentWorkflowOutputPanelProps) {
  const [outputOpen, setOutputOpen] = useState(false);
  const outputButtonRef = useRef<HTMLButtonElement>(null);
  const [outputAnchor, setOutputAnchor] = useState<ReturnType<
    typeof getOutputPopoverAnchor
  > | null>(null);

  useLayoutEffect(() => {
    if (!outputOpen || !outputButtonRef.current) {
      setOutputAnchor(null);
      return;
    }
    setOutputAnchor(getOutputPopoverAnchor(outputButtonRef.current));
  }, [outputOpen, options.videoAspectRatio, options.videoResolution]);

  return (
    <div className="space-y-2 px-2 pt-2">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            <Volume2 className="h-3 w-3" />
            Audio
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={options.videoGenerateAudio}
            disabled={disabled}
            onClick={() =>
              onChange({ videoGenerateAudio: !options.videoGenerateAudio })
            }
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors outline-none",
              options.videoGenerateAudio ? "bg-resolve-accent" : "bg-border-subtle",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                options.videoGenerateAudio ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </label>

        <button
          ref={outputButtonRef}
          type="button"
          disabled={disabled}
          onClick={() => setOutputOpen((open) => !open)}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2 text-left transition-colors",
            outputOpen && "border-border-focus",
            !disabled && "hover:border-border-focus",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <Settings2 className="h-3 w-3 shrink-0" />
              Output
            </span>
            <span className="truncate text-[11px] font-medium text-foreground">
              {formatVideoOutputSummary(
                options.videoAspectRatio,
                options.videoResolution,
              )}
            </span>
          </span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform",
              outputOpen && "rotate-90",
            )}
          />
        </button>

        <AgentDurationSlider
          value={options.agentModeTotalDurationSec}
          maxClipDurationSec={getAgentModeMaxClipDurationSec(options.videoModelId)}
          disabled={disabled}
          onChange={(agentModeTotalDurationSec) => onChange({ agentModeTotalDurationSec })}
        />

        <label className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            <Palette className="h-3 w-3 shrink-0" />
            Style brief
          </span>
          <div className="flex flex-wrap gap-1">
            {STYLE_BRIEF_STARTERS.map((starter) => {
              const selected = options.styleBrief === starter.value;
              return (
                <button
                  key={starter.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ styleBrief: starter.value })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    selected
                      ? "border-border-focus bg-bg-app text-foreground"
                      : "border-border-subtle text-text-secondary hover:border-border-focus hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {starter.label}
                </button>
              );
            })}
          </div>
          <textarea
            rows={3}
            value={options.styleBrief}
            onChange={(event) => onChange({ styleBrief: event.target.value })}
            disabled={disabled}
            placeholder="Optional. Pick a starter above or describe look, lighting, and mood."
            className="w-full resize-none bg-transparent text-[11px] leading-relaxed text-foreground outline-none placeholder:text-text-disabled disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>

      <FilmVideoOutputPopover
        open={outputOpen}
        anchor={outputAnchor}
        aspectRatio={options.videoAspectRatio}
        resolution={options.videoResolution}
        disabled={disabled}
        triggerRef={outputButtonRef}
        onClose={() => setOutputOpen(false)}
        onAspectRatioChange={(videoAspectRatio: VideoAspectRatioSetting) =>
          onChange({ videoAspectRatio })
        }
        onResolutionChange={(videoResolution: VideoResolution) =>
          onChange({ videoResolution })
        }
      />
    </div>
  );
}
