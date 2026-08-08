import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Film,
  Image,
  Loader2,
  Mountain,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import {
  ASSET_FOLDERS,
  DEFAULT_FOLDER_SORT,
  getAssetFolderDefinition,
  filterRefsByFolder,
  sortCatalogAssetRefs,
  type AssetFolderId,
  type FolderSortPreference,
} from "../../lib/asset-catalog";
import {
  ASSET_DRAG_MIME,
  serializeAssetDragPayload,
} from "../../lib/agent-context";
import { cn } from "../../lib/utils";
import { useProjectAssets } from "../../hooks/useProjectAssets";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { AssetFolderSortMenu } from "./AssetFolderSortMenu";

const SORT_STORAGE_KEY = (projectId: string) =>
  `asset-explorer-sort:${projectId}`;

function loadSortPreference(projectId: string): FolderSortPreference {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY(projectId));
    if (!raw) {
      return DEFAULT_FOLDER_SORT;
    }
    return JSON.parse(raw) as FolderSortPreference;
  } catch {
    return DEFAULT_FOLDER_SORT;
  }
}

function saveSortPreference(
  projectId: string,
  preference: FolderSortPreference,
): void {
  localStorage.setItem(SORT_STORAGE_KEY(projectId), JSON.stringify(preference));
}

const FOLDER_ICONS: Record<AssetFolderId, typeof FileText> = {
  scripts: ScrollText,
  character_prompts: FileText,
  character_sheets: Image,
  environment_prompts: FileText,
  environment_sheets: Mountain,
  storyboards: Clapperboard,
  videos: Film,
};

const LEFT_PANEL_FOLDER_IDS: AssetFolderId[] = [
  "scripts",
  "character_sheets",
  "environment_sheets",
  "storyboards",
  "videos",
];

const LEFT_PANEL_LABELS: Partial<Record<AssetFolderId, string>> = {
  character_sheets: "Characters",
  environment_sheets: "Environments",
  storyboards: "Storyboard",
  videos: "Video Clips",
};

interface AssetExplorerProps {
  projectId: string;
}

export function AssetExplorer({ projectId }: AssetExplorerProps) {
  const {
    refs,
    loading,
    error,
    walrusPathPrefix,
    explorerFolders,
    refresh,
  } =
    useProjectAssets(projectId);
  const { selection, selectFolder, selectAsset } = useWorkspaceSelection();
  const [expandedFolders, setExpandedFolders] = useState<Set<AssetFolderId>>(
    () => new Set(["scripts"]),
  );
  const [sortPreference, setSortPreference] = useState<FolderSortPreference>(
    () => loadSortPreference(projectId),
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [revealedAssetKey, setRevealedAssetKey] = useState<string | null>(null);
  const assetDragStartedRef = useRef(false);
  const assetButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const revealAttemptRef = useRef(0);

  const folderAssets = useMemo(() => {
    const map = new Map<AssetFolderId, typeof refs>();
    for (const folder of ASSET_FOLDERS) {
      const items = sortCatalogAssetRefs(
        filterRefsByFolder(refs, folder.id),
        sortPreference,
      );
      map.set(folder.id, items);
    }
    return map;
  }, [refs, sortPreference]);

  useEffect(() => {
    setSortPreference(loadSortPreference(projectId));
    setSortMenuOpen(false);
  }, [projectId]);

  function updateSortPreference(preference: FolderSortPreference) {
    setSortPreference(preference);
    saveSortPreference(projectId, preference);
  }

  useEffect(() => {
    const { assetId, folderId, assetRevealSignal } = selection;
    if (assetRevealSignal === 0 || !assetId || !folderId) {
      return;
    }

    setExpandedFolders((current) => {
      if (current.has(folderId)) {
        return current;
      }
      const next = new Set(current);
      next.add(folderId);
      return next;
    });

    const revealKey = `${folderId}:${assetId}`;
    setRevealedAssetKey(revealKey);
    revealAttemptRef.current += 1;
    const attemptId = revealAttemptRef.current;

    const scrollToAsset = (): boolean => {
      const element = assetButtonRefs.current.get(assetId);
      if (!element) {
        return false;
      }
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return true;
    };

    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    let highlightTimeoutId: number | undefined;

    if (!scrollToAsset()) {
      intervalId = window.setInterval(() => {
        if (attemptId !== revealAttemptRef.current) {
          return;
        }
        if (scrollToAsset() && intervalId != null) {
          window.clearInterval(intervalId);
        }
      }, 50);
      timeoutId = window.setTimeout(() => {
        if (intervalId != null) {
          window.clearInterval(intervalId);
        }
      }, 3000);
    }

    highlightTimeoutId = window.setTimeout(() => {
      if (attemptId === revealAttemptRef.current) {
        setRevealedAssetKey((current) => (current === revealKey ? null : current));
      }
    }, 2800);

    return () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      if (highlightTimeoutId != null) {
        window.clearTimeout(highlightTimeoutId);
      }
    };
  }, [refs, selection.assetId, selection.assetRevealSignal, selection.folderId]);

  function toggleFolder(folderId: AssetFolderId) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  return (
    <aside className="flex min-h-0 w-[260px] min-w-[260px] flex-none flex-col self-stretch overflow-hidden border-r border-border-subtle bg-bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Assets
        </span>
        <div className="flex items-center gap-0.5">
          <AssetFolderSortMenu
            open={sortMenuOpen}
            preference={sortPreference}
            onOpenChange={setSortMenuOpen}
            onChange={updateSortPreference}
          />
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh assets"
            className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {walrusPathPrefix ? (
        <p className="truncate border-b border-border-subtle px-3 py-1.5 font-mono text-[9px] text-text-secondary">
          {walrusPathPrefix}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error ? (
          <p className="px-3 py-2 text-[11px] text-destructive-foreground">
            {error}
          </p>
        ) : null}

        {explorerFolders
          .map((folderMeta) => ({
            folder: getAssetFolderDefinition(folderMeta.folderId),
            label: folderMeta.label,
          }))
          .filter(({ folder }) => LEFT_PANEL_FOLDER_IDS.includes(folder.id))
          .map(({ folder, label }) => {
          const Icon = FOLDER_ICONS[folder.id];
          const items = folderAssets.get(folder.id) ?? [];
          const isExpanded = expandedFolders.has(folder.id);
          const isActiveFolder = selection.folderId === folder.id;
          const displayLabel =
            label || LEFT_PANEL_LABELS[folder.id] || folder.label;

          return (
            <div key={folder.id}>
              <div
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1.5 transition-colors",
                  isActiveFolder && !selection.assetId
                    ? "bg-bg-raised text-foreground"
                    : "text-text-secondary",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.id)}
                  className="flex h-4 w-4 items-center justify-center"
                  aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isExpanded) {
                      toggleFolder(folder.id);
                    }
                    selectFolder(folder.id);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                    {displayLabel}
                  </span>
                  <span className="text-[10px] tabular-nums text-text-secondary">
                    {items.length}
                  </span>
                </button>
              </div>

              {isExpanded ? (
                <div className="pb-1 pl-6 pr-2">
                  {items.length === 0 ? (
                    <p className="px-2 py-1 text-[10px] text-text-secondary">
                      No assets yet
                    </p>
                  ) : (
                    items.map((item) => {
                      const isSelected =
                        selection.assetId === item.id &&
                        selection.folderId === folder.id;
                      const revealKey = `${folder.id}:${item.id}`;
                      const isRevealed = revealedAssetKey === revealKey;

                      return (
                        <button
                          key={item.id}
                          ref={(element) => {
                            if (element) {
                              assetButtonRefs.current.set(item.id, element);
                            } else {
                              assetButtonRefs.current.delete(item.id);
                            }
                          }}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            assetDragStartedRef.current = true;
                            event.dataTransfer.setData(
                              ASSET_DRAG_MIME,
                              serializeAssetDragPayload({
                                id: item.id,
                                title: item.title,
                                folderId: folder.id,
                                fileType: item.fileType,
                              }),
                            );
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onDragEnd={() => {
                            window.setTimeout(() => {
                              assetDragStartedRef.current = false;
                            }, 0);
                          }}
                          onClick={() => {
                            if (assetDragStartedRef.current) {
                              assetDragStartedRef.current = false;
                              return;
                            }
                            selectAsset(folder.id, item.id);
                          }}
                          className={cn(
                            "flex w-full cursor-grab items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors active:cursor-grabbing",
                            isSelected
                              ? "bg-bg-raised ring-1 ring-resolve-accent"
                              : "hover:bg-bg-raised/70",
                            isRevealed && "animate-asset-reveal ring-2 ring-resolve-accent",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                            {item.title}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          );
          })}

        {loading && refs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-[11px] text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading assets…
          </div>
        ) : null}
      </div>
    </aside>
  );
}
