import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import {
  getOpenRouterModelLabel,
  type OpenRouterModelOption,
} from "../../lib/openrouter-models";
import { cn } from "../../lib/utils";

interface ModelDropdownProps {
  modelId: string;
  models: OpenRouterModelOption[];
  disabled?: boolean;
  onChange: (id: string) => void;
  className?: string;
  /** Menu opens above (default) or below the trigger. */
  placement?: "top" | "bottom";
  /** Short role label shown before the model name (e.g. Image, Video). */
  label?: string;
  /** Optional helper copy shown at the top of the menu. */
  hint?: string;
  /** Optional leading icon; defaults to Sparkles when no label is set. */
  icon?: ReactNode;
  /** Widen the trigger for dual-picker toolbars. */
  size?: "sm" | "md";
}

export function ModelDropdown({
  modelId,
  models,
  disabled = false,
  onChange,
  className,
  placement = "top",
  label,
  hint,
  icon,
  size = "sm",
}: ModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const providers = [...new Set(models.map((model) => model.provider))];
  const modelLabel = getOpenRouterModelLabel(modelId);
  const leadingIcon =
    icon ??
    (label ? null : <Sparkles className="h-3 w-3 shrink-0 text-resolve-accent" />);

  return (
    <div ref={rootRef} className={cn("relative inline-flex min-w-0", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label ? `${label} model: ${modelLabel}` : `Model: ${modelLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel text-[11px] font-medium text-foreground transition-colors",
          size === "md" ? "max-w-[220px] px-2.5 py-1.5" : "max-w-[180px] px-2 py-1",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-border-focus hover:bg-bg-raised",
          open && "border-border-focus bg-bg-raised",
        )}
      >
        {leadingIcon}
        {label ? (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
            {label}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{modelLabel}</span>
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
          aria-label={label ? `${label} models` : "Models"}
          className={cn(
            "absolute z-50 w-64 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-xl",
            placement === "top" ? "bottom-full left-0 mb-1" : "top-full left-0 mt-1",
          )}
        >
          {(label || hint) && (
            <div className="border-b border-border-subtle px-3 py-2">
              {label ? (
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {label} model
                </p>
              ) : null}
              {hint ? (
                <p className={cn("text-[11px] text-text-secondary", label && "mt-0.5")}>
                  {hint}
                </p>
              ) : null}
            </div>
          )}
          <div className="max-h-[280px] overflow-y-auto">
            {providers.map((provider) => (
              <div key={provider}>
                <div className="sticky top-0 bg-bg-raised/95 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-text-secondary backdrop-blur-sm">
                  {provider}
                </div>
                {models
                  .filter((model) => model.provider === provider)
                  .map((model) => {
                    const selected = model.id === modelId;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onChange(model.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] transition-colors hover:bg-bg-raised",
                          selected
                            ? "bg-resolve-accent/10 text-resolve-accent"
                            : "text-foreground",
                        )}
                      >
                        <span className="min-w-0 truncate">{model.label}</span>
                        {selected ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
