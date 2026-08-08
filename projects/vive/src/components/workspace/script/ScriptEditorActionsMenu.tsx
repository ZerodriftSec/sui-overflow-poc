import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface ScriptEditorMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface ScriptEditorActionsMenuProps {
  items: ScriptEditorMenuItem[];
  disabled?: boolean;
}

export function ScriptEditorActionsMenu({
  items,
  disabled = false,
}: ScriptEditorActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const hasEnabledItem = items.some((item) => !item.disabled);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled || !hasEnabledItem}
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center justify-center rounded-sm border p-1 transition-colors",
          disabled || !hasEnabledItem
            ? "cursor-not-allowed border-transparent bg-bg-raised text-text-disabled"
            : open
              ? "border-border-focus bg-bg-raised text-foreground"
              : "border-border-subtle text-foreground hover:bg-bg-raised",
        )}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-md border border-border-subtle bg-bg-panel py-1 shadow-xl"
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore && (
                <div
                  className="my-1 border-t border-border-subtle"
                  role="separator"
                />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.disabled ? item.disabledReason : undefined}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full px-3 py-1.5 text-left text-[12px] transition-colors",
                  item.disabled
                    ? "cursor-not-allowed text-text-disabled"
                    : item.destructive
                      ? "text-destructive-foreground hover:bg-destructive/10"
                      : "text-foreground hover:bg-bg-raised",
                )}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
