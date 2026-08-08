import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useCurrentNetwork } from "@mysten/dapp-kit-react";
import { getProject } from "../../../lib/project";
import {
  listDesignAssetsForProject,
  listFilmAssetsForProject,
  listScriptAssetsForProject,
  listStoryboardAssetsForProject,
  loadDesignAssetDocument,
  loadDesignImageDataUrl,
  loadFilmAssetDocument,
  loadFilmVideoObjectUrl,
  loadScriptAssetContent,
  loadStoryboardAssetDocument,
  type DesignGeneratedImage,
  type WalrusNetwork,
} from "../../../lib/workspace";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import type { WorkflowStage } from "../../../lib/workflow";

interface StageAssetItem {
  id: string;
  label: string;
  detail?: string;
}

interface DesignPreviewItem {
  assetId: string;
  title: string;
  description: string;
  imageDataUrl: string | null;
  error?: string;
}

interface StoryboardSheetPreviewItem {
  segmentId: string;
  title: string;
  imageDataUrl: string | null;
  error?: string;
}

interface VideoPreviewItem {
  assetId: string;
  title: string;
  videoObjectUrl: string | null;
  error?: string;
}

interface AgentStageContentPreviewProps {
  projectId: string;
  stage: WorkflowStage;
  assetIds: string[];
  assetItems: StageAssetItem[];
  storyboardPlanAssetIds?: string[];
}

function isPreviewableStage(stage: WorkflowStage): boolean {
  return (
    stage === "script" ||
    stage === "characters" ||
    stage === "environments" ||
    stage === "storyboard_sheets" ||
    stage === "video_clips"
  );
}

export function AgentStageContentPreview({
  projectId,
  stage,
  assetIds,
  assetItems,
  storyboardPlanAssetIds = [],
}: AgentStageContentPreviewProps) {
  const walrusNetwork = useCurrentNetwork() as WalrusNetwork;
  const walrusStorage = useWalrusStorage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [designItems, setDesignItems] = useState<DesignPreviewItem[]>([]);
  const [storyboardSheetItems, setStoryboardSheetItems] = useState<
    StoryboardSheetPreviewItem[]
  >([]);
  const [videoItems, setVideoItems] = useState<VideoPreviewItem[]>([]);

  const videoObjectUrlsRef = useRef<string[]>([]);

  const assetIdsKey = assetIds.join(",");
  const storyboardPlanKey = storyboardPlanAssetIds.join(",");

  useEffect(() => {
    if (!isPreviewableStage(stage) || assetIds.length === 0) {
      setScriptContent(null);
      setDesignItems([]);
      setStoryboardSheetItems([]);
      setVideoItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    videoObjectUrlsRef.current = [];

    async function loadPreview(): Promise<void> {
      setLoading(true);
      setError(null);
      setScriptContent(null);
      setDesignItems([]);
      setStoryboardSheetItems([]);
      setVideoItems([]);

      const project = getProject(projectId);
      if (!project) {
        if (!cancelled) {
          setError("Project not found");
          setLoading(false);
        }
        return;
      }

      try {
        const ctx = await walrusStorage.getStorageContext();

        if (stage === "script") {
          const scriptAssets = await listScriptAssetsForProject(
            ctx,
            project,
            walrusNetwork,
          );
          const scriptById = new Map(scriptAssets.map((asset) => [asset.id, asset]));
          const scriptAsset = scriptById.get(assetIds[0]);
          if (!scriptAsset) {
            throw new Error("Script asset not found");
          }
          const content = await loadScriptAssetContent(ctx, project, scriptAsset);
          if (!cancelled) {
            setScriptContent(content);
          }
          return;
        }

        if (stage === "characters" || stage === "environments") {
          const designAssets = await listDesignAssetsForProject(
            ctx,
            project,
            walrusNetwork,
          );
          const designById = new Map(designAssets.map((asset) => [asset.id, asset]));
          const nextDesignItems: DesignPreviewItem[] = [];

          for (const assetId of assetIds) {
            const designAsset = designById.get(assetId);
            if (!designAsset) {
              nextDesignItems.push({
                assetId,
                title:
                  assetItems.find((item) => item.id === assetId)?.label ?? assetId,
                description: "",
                imageDataUrl: null,
                error: "Asset not found in project manifest",
              });
              continue;
            }

            try {
              const document = await loadDesignAssetDocument(
                ctx,
                project,
                designAsset,
              );
              const item = document.assets[0];
              let imageDataUrl: string | null = null;
              let itemError: string | undefined;

              if (item?.image) {
                try {
                  imageDataUrl = await loadDesignImageDataUrl(ctx, item.image);
                } catch (imageError) {
                  itemError =
                    imageError instanceof Error
                      ? imageError.message
                      : "Failed to load image";
                }
              } else {
                itemError = "No image data on asset";
              }

              nextDesignItems.push({
                assetId,
                title: item?.title ?? designAsset.title,
                description: item?.description ?? "",
                imageDataUrl,
                error: itemError,
              });
            } catch (assetError) {
              nextDesignItems.push({
                assetId,
                title:
                  assetItems.find((item) => item.id === assetId)?.label ??
                  designAsset.title,
                description: "",
                imageDataUrl: null,
                error:
                  assetError instanceof Error
                    ? assetError.message
                    : "Failed to load design asset",
              });
            }
          }

          if (!cancelled) {
            setDesignItems(nextDesignItems);
          }
          return;
        }

        if (stage === "storyboard_sheets") {
          const storyboardAssets = await listStoryboardAssetsForProject(
            ctx,
            project,
            walrusNetwork,
          );
          const storyboardById = new Map(
            storyboardAssets.map((asset) => [asset.id, asset]),
          );
          const sheetBySegmentId = new Map<
            string,
            {
              title: string;
              image: DesignGeneratedImage;
            }
          >();

          for (const storyboardAssetId of storyboardPlanAssetIds) {
            const storyboardAsset = storyboardById.get(storyboardAssetId);
            if (!storyboardAsset) {
              continue;
            }

            const document = await loadStoryboardAssetDocument(
              ctx,
              project,
              storyboardAsset,
            );
            for (const sheet of document.sheets ?? []) {
              sheetBySegmentId.set(sheet.segmentId, {
                title: sheet.segmentTitle,
                image: sheet.image,
              });
            }
          }

          const nextSheetItems: StoryboardSheetPreviewItem[] = [];
          for (const segmentId of assetIds) {
            const sheet = sheetBySegmentId.get(segmentId);
            if (!sheet) {
              nextSheetItems.push({
                segmentId,
                title:
                  assetItems.find((item) => item.id === segmentId)?.label ??
                  segmentId,
                imageDataUrl: null,
                error: "Storyboard sheet not found",
              });
              continue;
            }

            try {
              const imageDataUrl = await loadDesignImageDataUrl(ctx, sheet.image);
              nextSheetItems.push({
                segmentId,
                title: sheet.title,
                imageDataUrl,
              });
            } catch (sheetError) {
              nextSheetItems.push({
                segmentId,
                title: sheet.title,
                imageDataUrl: null,
                error:
                  sheetError instanceof Error
                    ? sheetError.message
                    : "Failed to load storyboard sheet image",
              });
            }
          }

          if (!cancelled) {
            setStoryboardSheetItems(nextSheetItems);
          }
          return;
        }

        if (stage === "video_clips") {
          const filmAssets = await listFilmAssetsForProject(
            ctx,
            project,
            walrusNetwork,
          );
          const filmById = new Map(filmAssets.map((asset) => [asset.id, asset]));
          const nextVideoItems: VideoPreviewItem[] = [];

          for (const assetId of assetIds) {
            const filmAsset = filmById.get(assetId);
            if (!filmAsset) {
              nextVideoItems.push({
                assetId,
                title:
                  assetItems.find((item) => item.id === assetId)?.label ?? assetId,
                videoObjectUrl: null,
                error: "Clip not found in project manifest",
              });
              continue;
            }

            try {
              const document = await loadFilmAssetDocument(ctx, project, filmAsset);
              if (!document.video) {
                nextVideoItems.push({
                  assetId,
                  title: filmAsset.title,
                  videoObjectUrl: null,
                  error: "Clip has no video data",
                });
                continue;
              }

              const videoObjectUrl = await loadFilmVideoObjectUrl(
                ctx,
                document.video,
              );
              videoObjectUrlsRef.current.push(videoObjectUrl);
              nextVideoItems.push({
                assetId,
                title: filmAsset.title,
                videoObjectUrl,
              });
            } catch (clipError) {
              nextVideoItems.push({
                assetId,
                title: filmAsset.title,
                videoObjectUrl: null,
                error:
                  clipError instanceof Error
                    ? clipError.message
                    : "Failed to load video clip",
              });
            }
          }

          if (!cancelled) {
            setVideoItems(nextVideoItems);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load stage content",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
      for (const url of videoObjectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      videoObjectUrlsRef.current = [];
    };
  }, [
    assetIds,
    assetIdsKey,
    assetItems,
    projectId,
    stage,
    storyboardPlanAssetIds,
    storyboardPlanKey,
    walrusNetwork,
    walrusStorage.getStorageContext,
    walrusStorage.projectAssetRefreshKey,
  ]);

  if (!isPreviewableStage(stage) || assetIds.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading content…
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-4 text-center text-[12px] text-destructive-foreground">
        {error}
      </p>
    );
  }

  if (stage === "script" && scriptContent) {
    return (
      <div className="max-h-[min(60vh,28rem)] overflow-auto rounded-md border border-border-subtle bg-bg-app">
        <pre className="whitespace-pre-wrap p-3 font-mono text-[12px] leading-relaxed text-foreground">
          {scriptContent}
        </pre>
      </div>
    );
  }

  if (designItems.length > 0) {
    return (
      <div className="grid max-h-[min(60vh,28rem)] grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">
        {designItems.map((item) => (
          <DesignPreviewCard key={item.assetId} item={item} />
        ))}
      </div>
    );
  }

  if (storyboardSheetItems.length > 0) {
    return (
      <div className="grid max-h-[min(60vh,28rem)] grid-cols-1 gap-3 overflow-auto">
        {storyboardSheetItems.map((item) => (
          <StoryboardSheetPreviewCard key={item.segmentId} item={item} />
        ))}
      </div>
    );
  }

  if (videoItems.length > 0) {
    return (
      <div className="space-y-3 overflow-auto">
        {videoItems.map((item) => (
          <VideoPreviewCard key={item.assetId} item={item} />
        ))}
      </div>
    );
  }

  return (
    <p className="py-4 text-center text-[12px] text-text-secondary">
      No preview available yet.
    </p>
  );
}

function DesignPreviewCard({ item }: { item: DesignPreviewItem }) {
  return (
    <article className="overflow-hidden rounded-md border border-border-subtle bg-bg-app">
      <div className="overflow-hidden bg-black">
        {item.imageDataUrl ? (
          <img
            src={item.imageDataUrl}
            alt={item.title}
            className="h-auto w-full object-contain"
          />
        ) : (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-text-secondary">
            <span>Image unavailable</span>
            {item.error ? <span className="text-destructive-foreground">{item.error}</span> : null}
          </div>
        )}
      </div>
      <div className="space-y-1 px-2.5 py-2">
        <p className="truncate text-[12px] font-medium text-foreground">{item.title}</p>
        {item.description ? (
          <p className="line-clamp-3 text-[11px] text-text-secondary">
            {item.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function StoryboardSheetPreviewCard({
  item,
}: {
  item: StoryboardSheetPreviewItem;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-border-subtle bg-bg-app">
      <div className="overflow-hidden bg-black">
        {item.imageDataUrl ? (
          <img
            src={item.imageDataUrl}
            alt={item.title}
            className="h-auto w-full object-contain"
          />
        ) : (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-text-secondary">
            <span>Image unavailable</span>
            {item.error ? <span className="text-destructive-foreground">{item.error}</span> : null}
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-medium text-foreground">{item.title}</p>
      </div>
    </article>
  );
}

function VideoPreviewCard({ item }: { item: VideoPreviewItem }) {
  return (
    <article className="overflow-hidden rounded-md border border-border-subtle bg-bg-app">
      <div className="overflow-hidden bg-black">
        {item.videoObjectUrl ? (
          <video
            src={item.videoObjectUrl}
            controls
            playsInline
            className="aspect-video w-full object-contain"
          />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-text-secondary">
            <span>Video unavailable</span>
            {item.error ? <span className="text-destructive-foreground">{item.error}</span> : null}
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-medium text-foreground">{item.title}</p>
      </div>
    </article>
  );
}
