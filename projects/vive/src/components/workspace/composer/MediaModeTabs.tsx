import { cn } from "../../../lib/utils";
import { MEDIA_MODES, type MediaMode } from "../../../lib/chat-scope";

interface MediaModeTabsProps {
  value: MediaMode;
  onChange: (mode: MediaMode) => void;
  disabled?: boolean;
}

export function MediaModeTabs({
  value,
  onChange,
  disabled = false,
}: MediaModeTabsProps) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-border-subtle bg-bg-viewer p-0.5"
      role="tablist"
      aria-label="Media mode"
    >
      {MEDIA_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={value === mode.id}
          disabled={disabled}
          onClick={() => onChange(mode.id)}
          className={cn(
            "min-w-0 flex-1 truncate rounded px-2 py-1 text-[10px] font-medium transition-colors",
            value === mode.id
              ? "bg-bg-raised text-foreground"
              : "text-text-secondary hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
