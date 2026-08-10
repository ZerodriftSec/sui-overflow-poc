import { Check, Loader2, Save, XCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { getOpenRouterModelLabel } from "../../../lib/openrouter-models";
import { ContentDownloadButton } from "../ContentDownloadButton";
import {
  ScriptEditorActionsMenu,
  type ScriptEditorMenuItem,
} from "./ScriptEditorActionsMenu";

interface ScriptEditorProps {
  title: string;
  open: boolean;
  content: string;
  generationPrompt?: string;
  generationModelId?: string;
  loading: boolean;
  saving?: boolean;
  error: string | null;
  dirty: boolean;
  isDraft: boolean;
  viewingVersion?: number | null;
  latestVersion?: number | null;
  readOnly?: boolean;
  menuItems?: ScriptEditorMenuItem[];
  canDownload?: boolean;
  downloading?: boolean;
  canOpenDesign?: boolean;
  openDesignDisabledReason?: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onDownload?: () => void;
  onOpenDesign: () => void;
  onViewLatest?: () => void;
  onRestoreVersion?: () => void;
}

export function ScriptEditor({
  title,
  open,
  content,
  generationPrompt = "",
  generationModelId = "",
  loading,
  saving = false,
  error,
  dirty,
  isDraft,
  viewingVersion,
  latestVersion,
  readOnly = false,
  menuItems = [],
  canDownload = false,
  downloading = false,
  onChange,
  onSave,
  onDownload,
  onViewLatest,
  onRestoreVersion,
}: ScriptEditorProps) {
  const isHistoricalView =
    viewingVersion != null &&
    latestVersion != null &&
    viewingVersion !== latestVersion;
  const canSave = open && dirty && !loading && !readOnly && !saving;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-bg-app">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-panel px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </span>
          {isDraft && (
            <span className="shrink-0 rounded-sm bg-bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
              Unsaved
            </span>
          )}
          {isHistoricalView && (
            <span className="shrink-0 rounded-sm bg-bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
              v{viewingVersion}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isHistoricalView && onRestoreVersion && (
            <button
              type="button"
              onClick={onRestoreVersion}
              className="inline-flex items-center rounded-sm border border-border-subtle px-2 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-bg-raised"
            >
              Restore as new version
            </button>
          )}
          {isHistoricalView && onViewLatest && (
            <button
              type="button"
              onClick={onViewLatest}
              className="inline-flex items-center rounded-sm px-2 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
            >
              Back to latest
            </button>
          )}

          {!readOnly && (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[12px] font-medium transition-colors",
                  canSave
                    ? "border-border-subtle text-foreground hover:bg-bg-raised"
                    : "cursor-not-allowed border-transparent bg-bg-raised text-text-disabled",
                )}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving
                  </>
                ) : dirty ? (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Saved
                  </>
                )}
              </button>
            </>
          )}

          {onDownload && (
            <ContentDownloadButton
              disabled={!canDownload}
              downloading={downloading}
              onDownload={onDownload}
            />
          )}

          {!readOnly && (
            <>
              <ScriptEditorActionsMenu
                items={menuItems}
                disabled={!open || loading}
              />

              <span
                className="mx-0.5 h-4 w-px bg-border-subtle"
                aria-hidden="true"
              />

            </>
          )}
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-bg-viewer">
        {!open && (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-[13px] text-text-disabled">
              Select a script or create a new one
            </p>
          </div>
        )}

        {open && loading && (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading script…
          </div>
        )}

        {open && error && !loading && (
          <div className="flex h-full items-center justify-center gap-2 px-6">
            <XCircle className="h-4 w-4 shrink-0 text-destructive-foreground" />
            <p className="text-center text-[13px] text-destructive-foreground">
              {error}
            </p>
          </div>
        )}

        {open && !loading && !error && (
          <div className="flex h-full min-h-0 flex-col">
            {(generationPrompt.trim().length > 0 ||
              generationModelId.trim().length > 0) && (
              <div className="shrink-0 space-y-3 border-b border-border-subtle bg-bg-panel px-4 py-3">
                {generationModelId.trim().length > 0 && (
                  <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                    Generation model
                    <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground">
                      {getOpenRouterModelLabel(generationModelId)}
                    </p>
                  </div>
                )}
                {generationPrompt.trim().length > 0 && (
                  <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                    Generation prompt
                    <p className="max-h-28 overflow-y-auto rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground whitespace-pre-wrap">
                      {generationPrompt}
                    </p>
                  </div>
                )}
              </div>
            )}
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              readOnly={readOnly}
              spellCheck
              className={cn(
                "min-h-0 w-full flex-1 resize-none overflow-x-hidden border-0 bg-transparent p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-foreground outline-none",
                readOnly && "cursor-default text-text-secondary",
              )}
              placeholder="Start writing your script…"
            />
          </div>
        )}
      </div>
    </div>
  );
}
