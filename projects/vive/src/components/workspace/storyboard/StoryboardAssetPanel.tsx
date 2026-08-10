import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { StoryboardAsset } from "../../../lib/project";

interface StoryboardAssetPanelProps {
  assets: StoryboardAsset[];
  selectedAssetId: string | null;
  viewingVersion: number | null;
  loading: boolean;
  hasDraft: boolean;
  onSelectAsset: (id: string) => void;
  onSelectDraft: () => void;
  onSelectVersion: (version: number | null) => void;
  onCreateStoryboard: () => void;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StoryboardAssetPanel({
  assets,
  selectedAssetId,
  viewingVersion,
  loading,
  hasDraft,
  onSelectAsset,
  onSelectDraft,
  onSelectVersion,
  onCreateStoryboard,
}: StoryboardAssetPanelProps) {
  const [versionOpen, setVersionOpen] = useState(true);
  const selectedAsset = useMemo(
    () => assets.find((item) => item.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel">
      <div className="flex h-8 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Storyboards
        </span>
        <button
          type="button"
          onClick={onCreateStoryboard}
          title="Create storyboard"
          className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center py-8">
            <p className="text-[12px] text-text-secondary">Loading storyboards…</p>
          </div>
        ) : !hasDraft && assets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-[12px] text-text-secondary">No storyboards yet</p>
            <button
              type="button"
              onClick={onCreateStoryboard}
              className="inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
            >
              <Plus className="h-3.5 w-3.5" />
              New storyboard
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {hasDraft && (
              <button
                type="button"
                onClick={onSelectDraft}
                className={cn(
                  "w-full rounded border px-2 py-2 text-left transition-colors",
                  selectedAssetId === null
                    ? "border-resolve-accent bg-bg-raised"
                    : "border-border-subtle hover:bg-bg-raised",
                )}
              >
                <p className="truncate text-[12px] font-semibold text-foreground">
                  Unsaved draft
                </p>
                <p className="mt-1 text-[10px] text-yellow-500">Unsaved</p>
              </button>
            )}
            {assets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelectAsset(asset.id)}
                  className={cn(
                    "w-full rounded border px-2 py-2 text-left transition-colors",
                    isSelected
                      ? "border-resolve-accent bg-bg-raised"
                      : "border-border-subtle hover:bg-bg-raised",
                  )}
                >
                  <p className="truncate text-[12px] font-semibold text-foreground">
                    {asset.title}
                  </p>
                  <p className="mt-1 text-[10px] text-text-secondary">
                    v{asset.currentVersion} · {formatSavedAt(asset.updatedAt)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAsset && (
        <div className="border-t border-border-subtle p-2">
          <div>
            <button
              type="button"
              onClick={() => setVersionOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 px-1 py-1 text-left transition-colors hover:bg-bg-raised"
            >
              {versionOpen ? (
                <ChevronDown className="h-3 w-3 text-text-secondary" />
              ) : (
                <ChevronRight className="h-3 w-3 text-text-secondary" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Version History
              </span>
            </button>

            {versionOpen && (
              <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                {[...selectedAsset.versions]
                  .sort((a, b) => b.version - a.version)
                  .map((entry) => {
                    const isLatest = entry.version === selectedAsset.currentVersion;
                    const isActive = (viewingVersion ?? selectedAsset.currentVersion) === entry.version;
                    return (
                      <button
                        key={entry.version}
                        type="button"
                        onClick={() => onSelectVersion(isLatest ? null : entry.version)}
                        className={cn(
                          "flex w-full items-center justify-between rounded px-2 py-1 text-[11px] transition-colors",
                          isActive
                            ? "bg-bg-raised ring-1 ring-resolve-accent"
                            : "hover:bg-bg-raised",
                        )}
                      >
                        <span className="text-foreground">
                          v{entry.version}
                          {isLatest ? " (latest)" : ""}
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          {formatSavedAt(entry.savedAt)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
