import { useRef, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import {
  ASSET_DRAG_MIME,
  serializeAssetDragPayload,
} from "../../../lib/agent-context";
import { cn } from "../../../lib/utils";
import {
  getLatestScriptAssetVersion,
  getScriptAssetVersions,
  type ScriptAsset,
  type ScriptDraft,
} from "../../../lib/workspace";

interface ScriptAssetPanelProps {
  assets: ScriptAsset[];
  draft: ScriptDraft | null;
  selectedId: string | null;
  selectedAsset: ScriptAsset | null;
  viewingVersion: number | null;
  loading: boolean;
  error: string | null;
  namespace: string;
  onSelect: (id: string) => void;
  onSelectDraft: () => void;
  onSelectVersion: (version: number | null) => void;
  onRefresh: () => void;
  onCreate: () => void;
}

function formatVersionDate(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function VersionHistorySection({
  asset,
  viewingVersion,
  onSelectVersion,
}: {
  asset: ScriptAsset;
  viewingVersion: number | null;
  onSelectVersion: (version: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const versions = getScriptAssetVersions(asset);
  const latestVersion = versions[0]?.version ?? null;
  const activeVersion = viewingVersion ?? latestVersion;

  if (versions.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-bg-raised/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-text-secondary" />
        ) : (
          <ChevronRight className="h-3 w-3 text-text-secondary" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          Version History
        </span>
      </button>
      {open && (
        <div className="max-h-32 space-y-1 overflow-y-auto px-2 pb-3">
          {versions.map((entry) => {
            const isActive = entry.version === activeVersion;
            const isLatest = entry.version === latestVersion;
            return (
              <button
                key={entry.version}
                type="button"
                onClick={() => onSelectVersion(isLatest ? null : entry.version)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left transition-colors",
                  isActive
                    ? "bg-bg-raised ring-1 ring-resolve-accent"
                    : "hover:bg-bg-raised/70",
                )}
              >
                <span className="text-[11px] font-medium text-foreground">
                  v{entry.version}
                  {isLatest && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
                      latest
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[9px] text-text-secondary">
                  {formatVersionDate(entry.savedAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ScriptAssetPanel({
  assets,
  draft,
  selectedId,
  selectedAsset,
  viewingVersion,
  loading,
  error,
  namespace,
  onSelect,
  onSelectDraft,
  onSelectVersion,
  onRefresh,
  onCreate,
}: ScriptAssetPanelProps) {
  const showGrid = namespace && !(loading && assets.length === 0 && !draft);
  const latestVersion = selectedAsset ? getLatestScriptAssetVersion(selectedAsset)?.version : null;
  const scriptDragStartedRef = useRef(false);

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Script Assets
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!namespace || loading}
          aria-label="Refresh script assets"
          className="rounded p-1 text-text-secondary hover:text-foreground hover:bg-bg-raised transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!namespace && (
          <p className="px-1 py-4 text-[12px] leading-relaxed text-text-secondary">
            This project is not linked to a Walrus namespace yet.
          </p>
        )}

        {namespace && loading && assets.length === 0 && !draft && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading assets…
          </div>
        )}

        {namespace && error && (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-destructive-foreground">
            {error}
          </p>
        )}

        {showGrid && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCreate}
              aria-label="New script"
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border-subtle bg-bg-raised p-2 text-text-secondary transition-colors hover:border-border-focus hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              <span className="w-full truncate text-center text-[10px] font-medium">
                New script
              </span>
            </button>

            {draft && (
              <button
                type="button"
                onClick={onSelectDraft}
                className={cn(
                  "group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-sm border border-dashed bg-bg-raised p-2 text-left transition-colors",
                  selectedId === draft.id
                    ? "border-resolve-accent ring-1 ring-resolve-accent"
                    : "border-border-subtle hover:border-border-focus",
                )}
              >
                <FileText
                  className={cn(
                    "h-5 w-5",
                    selectedId === draft.id
                      ? "text-resolve-accent"
                      : "text-text-secondary",
                  )}
                />
                <span className="w-full truncate text-center text-[10px] font-medium text-foreground">
                  {draft.title}
                </span>
              </button>
            )}

            {assets.map((asset) => {
              const isSelected = selectedId === asset.id;
              return (
                <button
                  key={asset.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    scriptDragStartedRef.current = true;
                    event.dataTransfer.setData(
                      ASSET_DRAG_MIME,
                      serializeAssetDragPayload({
                        id: asset.id,
                        title: asset.title,
                        folderId: "scripts",
                        fileType: "text",
                      }),
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => {
                    window.setTimeout(() => {
                      scriptDragStartedRef.current = false;
                    }, 0);
                  }}
                  onClick={() => {
                    if (scriptDragStartedRef.current) {
                      scriptDragStartedRef.current = false;
                      return;
                    }
                    onSelect(asset.id);
                  }}
                  className={cn(
                    "group relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-sm border bg-bg-raised p-2 text-left transition-colors cursor-grab active:cursor-grabbing",
                    isSelected
                      ? "border-resolve-accent ring-1 ring-resolve-accent"
                      : "border-border-subtle hover:border-border-focus",
                  )}
                >
                  <FileText
                    className={cn(
                      "h-5 w-5",
                      isSelected ? "text-resolve-accent" : "text-text-secondary",
                    )}
                  />
                  <span className="w-full truncate text-center text-[10px] font-medium text-foreground">
                    {asset.title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAsset && (
        <div className="shrink-0 border-t border-border-subtle bg-bg-panel">
          <div className="px-3 pt-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Asset Information
            </span>
          </div>
          <div className="space-y-1.5 px-3 pb-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-[11px] text-text-secondary">Asset</span>
              <span className="truncate text-right font-mono text-[10px] text-foreground">
                {selectedAsset.title}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-[11px] text-text-secondary">Version</span>
              <span className="truncate text-right font-mono text-[10px] text-foreground">
                {viewingVersion != null
                  ? `v${viewingVersion}${viewingVersion === latestVersion ? " (latest)" : ""}`
                  : latestVersion != null
                    ? `v${latestVersion} (latest)`
                    : "—"}
              </span>
            </div>
          </div>

          <VersionHistorySection
            asset={selectedAsset}
            viewingVersion={viewingVersion}
            onSelectVersion={onSelectVersion}
          />
        </div>
      )}
    </aside>
  );
}
