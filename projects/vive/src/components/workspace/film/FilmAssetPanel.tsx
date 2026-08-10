import { Clapperboard, Plus, RefreshCw } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { FilmAsset, FilmDocument } from "../../../lib/workspace";

interface FilmAssetPanelProps {
  assets: FilmAsset[];
  selectedAssetId: string | null;
  assetDocuments: Record<string, FilmDocument | undefined>;
  loading: boolean;
  error: string | null;
  walrusPathPrefix: string;
  onRefresh: () => void;
  onSelectAsset: (assetId: string) => void;
  onCreateClip?: () => void;
}

function statusLabel(status: FilmDocument["status"] | undefined): string {
  switch (status) {
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return "Draft";
  }
}

function statusClassName(status: FilmDocument["status"] | undefined): string {
  switch (status) {
    case "ready":
      return "text-green-500";
    case "generating":
      return "text-yellow-500";
    case "failed":
      return "text-destructive-foreground";
    default:
      return "text-text-secondary";
  }
}

export function FilmAssetPanel({
  assets,
  selectedAssetId,
  assetDocuments,
  loading,
  error,
  walrusPathPrefix,
  onRefresh,
  onSelectAsset,
  onCreateClip,
}: FilmAssetPanelProps) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Film Clips
        </span>
        <div className="flex items-center gap-1">
          {onCreateClip && (
            <button
              type="button"
              onClick={onCreateClip}
              disabled={!walrusPathPrefix}
              title="New clip"
              className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={!walrusPathPrefix || loading}
            title="Refresh clips"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!walrusPathPrefix && (
          <p className="px-1 py-3 text-[12px] text-text-secondary">
            This project is not linked to Walrus storage yet.
          </p>
        )}

        {walrusPathPrefix && loading && assets.length === 0 && (
          <p className="px-1 py-3 text-[12px] text-text-secondary">Loading film clips…</p>
        )}

        {walrusPathPrefix && error && (
          <p className="px-1 py-3 text-[12px] text-destructive-foreground">{error}</p>
        )}

        {walrusPathPrefix && assets.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <Clapperboard className="h-8 w-8 text-text-disabled" />
            <p className="text-[12px] text-text-secondary">No film clips yet</p>
            <p className="max-w-[200px] text-[11px] text-text-disabled">
              Generated clips will appear here for preview and editing.
            </p>
          </div>
        )}

        {assets.length > 0 && (
          <div className="space-y-2">
            {assets.map((asset) => {
              const isSelected = selectedAssetId === asset.id;
              const document = assetDocuments[asset.id];
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
                  <p className="mt-1 flex items-center gap-1.5 text-[10px]">
                    <span className={statusClassName(document?.status)}>
                      {statusLabel(document?.status)}
                    </span>
                    {document?.durationSec != null && (
                      <>
                        <span className="text-text-disabled">·</span>
                        <span className="text-text-secondary">
                          {document.durationSec}s
                        </span>
                      </>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
