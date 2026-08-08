import {
  IMAGE_GENERATION_SIZES,
  type ImageGenerationSize,
} from "../../lib/openrouter-models";
import { cn } from "../../lib/utils";

interface ImageResolutionSelectorProps {
  value: ImageGenerationSize;
  disabled?: boolean;
  onChange: (value: ImageGenerationSize) => void;
  className?: string;
}

export function ImageResolutionSelector({
  value,
  disabled = false,
  onChange,
  className,
}: ImageResolutionSelectorProps) {
  return (
    <div className={cn("inline-flex w-full gap-1 rounded-lg bg-bg-app p-1", className)}>
      {IMAGE_GENERATION_SIZES.map((size) => {
        const selected = value === size;
        return (
          <button
            key={size}
            type="button"
            disabled={disabled}
            onClick={() => onChange(size)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              selected
                ? "bg-bg-raised text-foreground"
                : "text-text-secondary hover:text-foreground",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
