import { FileText, Loader2, X } from "lucide-react";
import type { AttachedReferenceMeta } from "../../lib/agent-context";
import { cn } from "../../lib/utils";

interface ChatContextChipsProps {
  attachedReferences: AttachedReferenceMeta[];
  onRemoveAttached: (id: string) => void;
  disabled?: boolean;
}

export function ChatContextChips({
  attachedReferences,
  onRemoveAttached,
  disabled = false,
}: ChatContextChipsProps) {
  if (attachedReferences.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-3">
      {attachedReferences.map((reference) => (
        <div
          key={reference.id}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-foreground",
            reference.status === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-border-subtle bg-bg-raised",
          )}
        >
          {reference.status === "loading" ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-text-secondary" />
          ) : (
            <FileText
              className={cn(
                "h-3 w-3 shrink-0",
                reference.status === "error"
                  ? "text-destructive-foreground"
                  : "text-text-secondary",
              )}
            />
          )}
          <span className="truncate text-[11px] font-medium">
            {reference.title}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemoveAttached(reference.id)}
            aria-label={`Remove ${reference.title} from context`}
            className="shrink-0 rounded p-0.5 text-text-secondary transition-colors hover:bg-bg-panel hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
