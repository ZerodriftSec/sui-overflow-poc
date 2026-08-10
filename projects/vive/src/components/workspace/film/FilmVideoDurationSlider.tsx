import {
  clampVideoDurationSecForModel,
  getVideoDurationSliderConfig,
  resolveVideoInputMode,
  type VideoGenerationInputMode,
} from "../../../lib/openrouter-models";
import { cn } from "../../../lib/utils";

interface FilmVideoDurationSliderProps {
  value: number;
  videoModelId: string;
  hasInputReferences?: boolean;
  hasFrameImages?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function clampDuration(
  value: number,
  modelId: string,
  inputMode: VideoGenerationInputMode,
): number {
  return clampVideoDurationSecForModel(value, modelId, inputMode);
}

function durationFillPercent(
  value: number,
  minDurationSec: number,
  maxDurationSec: number,
): number {
  if (maxDurationSec <= minDurationSec) {
    return 100;
  }
  const clamped = Math.min(maxDurationSec, Math.max(minDurationSec, value));
  return (
    ((clamped - minDurationSec) / (maxDurationSec - minDurationSec)) * 100
  );
}

export function FilmVideoDurationSlider({
  value,
  videoModelId,
  hasInputReferences = false,
  hasFrameImages = false,
  disabled = false,
  onChange,
}: FilmVideoDurationSliderProps) {
  const inputMode = resolveVideoInputMode({ hasInputReferences, hasFrameImages });
  const config = getVideoDurationSliderConfig(videoModelId, inputMode);
  const clampedValue = clampDuration(value, videoModelId, inputMode);
  const fillPercent = durationFillPercent(
    clampedValue,
    config.minDurationSec,
    config.maxDurationSec,
  );

  const discreteDurations = config.discreteDurations;
  const sliderMin = discreteDurations ? 0 : config.minDurationSec;
  const sliderMax = discreteDurations
    ? discreteDurations.length - 1
    : config.maxDurationSec;
  const sliderStep = discreteDurations ? 1 : 1;
  const sliderValue = discreteDurations
    ? Math.max(
        0,
        discreteDurations.findIndex((duration) => duration === clampedValue),
      )
    : clampedValue;

  function handleSliderChange(rawValue: number) {
    if (discreteDurations) {
      onChange(discreteDurations[rawValue] ?? discreteDurations[0]);
      return;
    }
    onChange(clampDuration(rawValue, videoModelId, inputMode));
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-text-secondary">Duration</span>
        {config.hint ? (
          <span className="text-[9px] text-text-disabled">{config.hint}</span>
        ) : null}
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
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          disabled={disabled}
          aria-label="Video duration in seconds"
          aria-valuemin={config.minDurationSec}
          aria-valuemax={config.maxDurationSec}
          aria-valuenow={clampedValue}
          aria-valuetext={`${clampedValue} seconds`}
          onChange={(event) => handleSliderChange(Number(event.target.value))}
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
