import { Image as ImageIcon, Plus, RefreshCw } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { DesignAsset } from "../../../lib/workspace";

interface DesignAssetPanelProps {
  assets: DesignAsset[];
  selectedAssetId: string | null;
  loading: boolean;
  error: string | null;
  namespace: string;
  onRefresh: () => void;
  onCreateFromScript: () => void;
  onSelectAsset: (assetId: string) => void;
}

function kindLabel(kind: DesignAsset["kind"]): string {
  return kind === "character" ? "Character" : "Environment";
}

export function DesignAssetPanel({
  assets,
  selectedAssetId,
  loading,
  error,
  namespace,
  onRefresh,
  onCreateFromScript,
  onSelectAsset,
}: DesignAssetPanelProps) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border-subtle bg-bg-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Design Assets
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!namespace || loading}
            title="Refresh assets"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={onCreateFromScript}
            title="Create design from script"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!namespace && (
          <p className="px-1 py-3 text-[12px] text-text-secondary">
            This project is not linked to a Walrus namespace yet.
          </p>
        )}

        {namespace && loading && assets.length === 0 && (
          <p className="px-1 py-3 text-[12px] text-text-secondary">Loading design assets…</p>
        )}

        {namespace && error && (
          <p className="px-1 py-3 text-[12px] text-destructive-foreground">{error}</p>
        )}

        {namespace && assets.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-[12px] text-text-secondary">No design assets yet</p>
            <button
              type="button"
              onClick={onCreateFromScript}
              className="inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
            >
              <Plus className="h-3.5 w-3.5" />
              Create design
            </button>
          </div>
        )}

        {assets.length > 0 && (
          <div className="space-y-2">
            {assets.map((asset) => {
              const isSelected = selectedAssetId === asset.id;
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
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-text-secondary" />
                    <p className="truncate text-[12px] font-semibold text-foreground">
                      {asset.title}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-text-secondary">
                    {kindLabel(asset.kind)} · v{asset.currentVersion}
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
