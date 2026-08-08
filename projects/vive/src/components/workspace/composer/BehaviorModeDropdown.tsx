import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  BEHAVIOR_MODES,
  behaviorModesForMediaMode,
  type BehaviorMode,
  type MediaMode,
} from "../../../lib/chat-scope";
import { cn } from "../../../lib/utils";

interface BehaviorModeDropdownProps {
  value: BehaviorMode;
  onChange: (mode: BehaviorMode) => void;
  mediaMode?: MediaMode;
  disabled?: boolean;
}

export function BehaviorModeDropdown({
  value,
  onChange,
  mediaMode = "text",
  disabled = false,
}: BehaviorModeDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const modes = behaviorModesForMediaMode(mediaMode);

  const currentLabel =
    BEHAVIOR_MODES.find((mode) => mode.id === value)?.label ?? "Draft";

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Behavior mode"
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] font-medium text-foreground transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-border-focus hover:bg-bg-raised",
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-text-secondary transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Behavior modes"
          className="absolute bottom-full left-0 z-50 mb-1 w-52 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-xl"
        >
          <div className="max-h-[240px] overflow-y-auto py-1">
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="option"
                aria-selected={mode.id === value}
                onClick={() => {
                  onChange(mode.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-bg-raised",
                  mode.id === value ? "text-resolve-accent" : "text-foreground",
                )}
              >
                <span className="text-[11px] font-medium">{mode.label}</span>
                <span className="text-[10px] text-text-secondary">
                  {mode.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
