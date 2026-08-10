import {
  AGENT_MODE_MAX_TOTAL_DURATION_SEC,
  MIN_VIDEO_DURATION_SEC,
} from "../../../lib/openrouter-models";
import { calculateChunkCount } from "../../../lib/workflow-options";
import { cn } from "../../../lib/utils";

interface AgentDurationSliderProps {
  value: number;
  maxClipDurationSec: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function clampDuration(value: number): number {
  return Math.min(
    AGENT_MODE_MAX_TOTAL_DURATION_SEC,
    Math.max(MIN_VIDEO_DURATION_SEC, Math.round(value)),
  );
}

function durationFillPercent(value: number): number {
  const clamped = clampDuration(value);
  return (
    ((clamped - MIN_VIDEO_DURATION_SEC) /
      (AGENT_MODE_MAX_TOTAL_DURATION_SEC - MIN_VIDEO_DURATION_SEC)) *
    100
  );
}

export function AgentDurationSlider({
  value,
  maxClipDurationSec,
  disabled = false,
  onChange,
}: AgentDurationSliderProps) {
  const clampedValue = clampDuration(value);
  const fillPercent = durationFillPercent(clampedValue);
  const chunkCount = calculateChunkCount(clampedValue, maxClipDurationSec);

  return (
    <div className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-secondary">Total Duration</span>
        <span className="text-[9px] text-text-disabled">
          {chunkCount} clip{chunkCount === 1 ? "" : "s"} (up to {maxClipDurationSec}s each)
        </span>
      </div>

      <div
        className={cn(
          "relative h-5 w-full overflow-hidden rounded-md border border-border-subtle bg-bg-viewer shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]",
          disabled && "opacity-50",
        )}
      >
        <div
          className="absolute inset-y-0 left-0 bg-resolve-accent/45"
          style={{ width: `${fillPercent}%` }}
        />

        <span
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white"
          aria-hidden
        >
          {clampedValue}s
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white"
          style={{ left: `${fillPercent}%` }}
        />

        <input
          type="range"
          min={MIN_VIDEO_DURATION_SEC}
          max={AGENT_MODE_MAX_TOTAL_DURATION_SEC}
          step={1}
          value={clampedValue}
          disabled={disabled}
          aria-label="Total video duration in seconds"
          aria-valuemin={MIN_VIDEO_DURATION_SEC}
          aria-valuemax={AGENT_MODE_MAX_TOTAL_DURATION_SEC}
          aria-valuenow={clampedValue}
          aria-valuetext={`${clampedValue} seconds total, ${chunkCount} clips`}
          onChange={(event) => onChange(clampDuration(Number(event.target.value)))}
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
            disabled && "cursor-not-allowed",
          )}
        />
      </div>
    </div>
  );
}
