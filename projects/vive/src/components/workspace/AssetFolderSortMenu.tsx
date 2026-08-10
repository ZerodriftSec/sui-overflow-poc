import { useEffect, useRef } from "react";
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  ArrowUpWideNarrow,
  Check,
} from "lucide-react";
import {
  DEFAULT_FOLDER_SORT,
  type FolderSortPreference,
} from "../../lib/asset-catalog";
import { cn } from "../../lib/utils";

const SORT_OPTIONS: Array<{
  preference: FolderSortPreference;
  label: string;
  description: string;
  Icon: typeof ArrowDownAZ;
}> = [
  {
    preference: { field: "name", direction: "asc" },
    label: "Name",
    description: "A to Z",
    Icon: ArrowDownAZ,
  },
  {
    preference: { field: "name", direction: "desc" },
    label: "Name",
    description: "Z to A",
    Icon: ArrowUpAZ,
  },
  {
    preference: { field: "created", direction: "desc" },
    label: "Date created",
    description: "Newest first",
    Icon: ArrowDownWideNarrow,
  },
  {
    preference: { field: "created", direction: "asc" },
    label: "Date created",
    description: "Oldest first",
    Icon: ArrowUpWideNarrow,
  },
];

function isSameSortPreference(
  left: FolderSortPreference,
  right: FolderSortPreference,
): boolean {
  return left.field === right.field && left.direction === right.direction;
}

function getSortTriggerIcon(
  preference: FolderSortPreference,
): typeof ArrowDownAZ {
  const match = SORT_OPTIONS.find((option) =>
    isSameSortPreference(option.preference, preference),
  );
  return match?.Icon ?? ArrowDownAZ;
}

function getSortTriggerLabel(preference: FolderSortPreference): string {
  const match = SORT_OPTIONS.find((option) =>
    isSameSortPreference(option.preference, preference),
  );
  return match ? `${match.label}, ${match.description}` : "Sort files";
}

interface AssetFolderSortMenuProps {
  open: boolean;
  preference: FolderSortPreference;
  onOpenChange: (open: boolean) => void;
  onChange: (preference: FolderSortPreference) => void;
}

export function AssetFolderSortMenu({
  open,
  preference,
  onOpenChange,
  onChange,
}: AssetFolderSortMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const TriggerIcon = getSortTriggerIcon(preference);
  const isDefault = isSameSortPreference(preference, DEFAULT_FOLDER_SORT);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        aria-label={getSortTriggerLabel(preference)}
        title={getSortTriggerLabel(preference)}
        className={cn(
          "rounded p-1 transition-colors",
          open || !isDefault
            ? "bg-bg-raised text-foreground"
            : "text-text-secondary hover:bg-bg-raised hover:text-foreground",
        )}
      >
        <TriggerIcon className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-border-subtle bg-bg-panel shadow-xl">
          <div className="border-b border-border-subtle px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            Sort files
          </div>
          <div className="py-1">
            {SORT_OPTIONS.map((option) => {
              const active = isSameSortPreference(
                option.preference,
                preference,
              );
              const OptionIcon = option.Icon;

              return (
                <button
                  key={`${option.preference.field}-${option.preference.direction}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(option.preference);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "bg-resolve-accent/15 text-foreground"
                      : "text-foreground hover:bg-bg-raised",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active
                        ? "border-resolve-accent bg-resolve-accent text-bg-app"
                        : "border-border-subtle text-transparent",
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <OptionIcon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium">
                      {option.label}
                    </span>
                    <span className="block text-[10px] text-text-secondary">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
