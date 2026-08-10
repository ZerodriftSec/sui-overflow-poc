import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clapperboard, Loader2 } from "lucide-react";
import { useFilmAssets } from "../../../hooks/useFilmAssets";
import { useProjectAssets } from "../../../hooks/useProjectAssets";
import { useControlModeEditorSync } from "../../../hooks/useControlModeEditorSync";
import {
  persistWithControlModeWalrusPolicy,
  useControlModeWalrusSessionOptional,
} from "../../../hooks/useControlModeWalrusSession";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import { useWorkspaceSelection } from "../../../hooks/useWorkspaceSelection";
import type { FilmVideoGenerationRequest } from "../AgentChat";
import {
  generateFilmVideo,
  type FilmGenerationStatus,
} from "../../../lib/film-llm";
import {
  mergeFilmGenerationRequest,
  prepareStoryboardToVideoGeneration,
  resolveControlModeFilmContext,
  type ControlModeFilmContext,
} from "../../../lib/film-generation-context";
import { getProject, saveProject } from "../../../lib/project";
import { useSettings } from "../../../components/SettingsProvider";
import type { WalrusStorageContext } from "../../../lib/storage/walrus-storage";
import { showToast } from "../../../lib/toast";
import { getOpenRouterModelLabel } from "../../../lib/openrouter-models";
import {
  loadFilmVideoObjectUrl,
  saveFilmAsset,
  type FilmAsset,
  type FilmDocument,
  type SaveFilmAssetResult,
} from "../../../lib/workspace";
import { cn } from "../../../lib/utils";
import { downloadFilmVideoAsset } from "../../../lib/download-workspace-content";
import { InspectorPanel } from "../InspectorPanel";
import { ContentDownloadButton } from "../ContentDownloadButton";
import type { ConversationScope } from "../../../lib/chat-scope";
import { FilmAssetPanel } from "./FilmAssetPanel";

interface FilmPhaseViewProps {
  projectId: string;
  onOpenSettings?: () => void;
  embedded?: boolean;
  externalSelectedId?: string | null;
}

interface FilmNavigationState {
  triggerFilmContext?: boolean;
  storyboardId?: string;
  segmentIndex?: number;
}

function statusLabel(status: FilmDocument["status"]): string {
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

function generationStatusLabel(status: FilmGenerationStatus): string {
  switch (status) {
    case "submitting":
      return "Submitting generation job…";
    case "generating":
      return "Generating video (this can take a few minutes)…";
    case "downloading":
      return "Downloading generated video…";
    case "done":
      return "Uploading video to Walrus…";
    default:
      return "Generating video…";
  }
}

export function FilmPhaseView({
  projectId,
  onOpenSettings,
  embedded = false,
  externalSelectedId = null,
}: FilmPhaseViewProps) {
  const { settings } = useSettings();
  const walrusStorage = useWalrusStorage();
  const controlModeWalrusSession = useControlModeWalrusSessionOptional();
  const workspaceSelection = useWorkspaceSelection();
  const {
    filmAssetPreviewSignal,
    isGeneratingFilmAsset,
  } = useControlModeEditorSync();
  const location = useLocation();
  const navigate = useNavigate();
  const project = getProject(projectId);
  const walrusPathPrefix = project?.walrusPathPrefix ?? "";
  const projectAssets = useProjectAssets(projectId);

  const { assets, loading, error, refresh, loadDocument, saveAsset, createDraft } =
    useFilmAssets(projectId, {
      // Control mode explorer already loads the shared catalog — avoid a second
      // list race that can leave this view empty while the sidebar shows clips.
      autoLoad: !embedded,
      syncedAssets: projectAssets.catalog.videos,
    });
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAssetIdRef = useRef<string | null>(null);
  const [assetDocuments, setAssetDocuments] = useState<Record<string, FilmDocument>>({});
  const assetDocumentsRef = useRef(assetDocuments);
  assetDocumentsRef.current = assetDocuments;
  const [contentLoading, setContentLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [filmContext, setFilmContext] = useState<ControlModeFilmContext | null>(null);
  const [filmContextLoading, setFilmContextLoading] = useState(false);
  const [filmContextError, setFilmContextError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const filmContextRef = useRef<ControlModeFilmContext | null>(null);
  filmContextRef.current = filmContext;

  const triggerFilmContextRef = useRef(
    (location.state as FilmNavigationState | null)?.triggerFilmContext === true,
  );
  const pendingStoryboardIdRef = useRef(
    (location.state as FilmNavigationState | null)?.storyboardId ?? null,
  );
  const pendingSegmentIndexRef = useRef(
    (location.state as FilmNavigationState | null)?.segmentIndex ?? 0,
  );
  const lastFilmPreviewNonceRef = useRef(0);
  const preloadedFilmAssetIdRef = useRef<string | null>(null);
  const lastLoadedDocumentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (triggerFilmContextRef.current) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (embedded) return;
    if (!triggerFilmContextRef.current) return;
    const storyboardId = pendingStoryboardIdRef.current;
    if (!storyboardId || !project) return;

    let cancelled = false;
    triggerFilmContextRef.current = false;
    const scopedStoryboardId = storyboardId;

    async function loadFilmContext() {
      setFilmContextLoading(true);
      setFilmContextError(null);
      try {
        if (!settings.openRouterApiKey.trim()) {
          throw new Error("Add your OpenRouter API key in settings first.");
        }

        const ctx = await walrusStorage.getStorageContext();
        const resolved = await resolveControlModeFilmContext({
          ctx,
          project: project!,
          storyboardId: scopedStoryboardId,
          segmentIndex: pendingSegmentIndexRef.current,
          settings,
          onStatus: (message) => {
            if (!cancelled) {
              setGenerationStatus(message);
            }
          },
        });

        if (cancelled) return;

        setFilmContext(resolved);
        setGenerationStatus(null);

        const draft = createDraft();
        setAssetDocuments((current) => ({
          ...current,
          [draft.id]: {
            prompt: resolved.prompt,
            durationSec: resolved.durationSec,
            status: "draft",
            sourceStoryboardId: resolved.sourceStoryboardId,
            sourceShotId: resolved.sourceShotId,
            updatedAt: new Date().toISOString(),
          },
        }));
        setSelectedAssetId(draft.id);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to prepare film generation";
        setFilmContextError(message);
        setGenerationStatus(null);
        showToast("error", message);
        if (message.includes("OpenRouter API key")) {
          onOpenSettings?.();
        }
      } finally {
        if (!cancelled) {
          setFilmContextLoading(false);
        }
      }
    }

    void loadFilmContext();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, projectId, settings, walrusStorage.getStorageContext]);

  const selectedAsset = useMemo((): FilmAsset | null => {
    if (!selectedAssetId) return null;
    const fromHook = assets.find((asset) => asset.id === selectedAssetId);
    if (fromHook) return fromHook;
    const fromCatalog = projectAssets.catalog.videos.find(
      (asset) => asset.id === selectedAssetId,
    );
    if (fromCatalog) return fromCatalog;
    const fromRef = projectAssets.refs.find(
      (ref) => ref.id === selectedAssetId && ref.folderId === "videos",
    );
    if (!fromRef) return null;
    return {
      id: fromRef.id,
      title: fromRef.title,
      blobId: fromRef.contentBlobId,
      currentVersion: fromRef.currentVersion,
      updatedAt: fromRef.updatedAt,
    };
  }, [
    assets,
    projectAssets.catalog.videos,
    projectAssets.refs,
    selectedAssetId,
  ]);

  selectedAssetIdRef.current = selectedAssetId;

  const selectedDocument = selectedAssetId
    ? assetDocuments[selectedAssetId] ?? null
    : null;

  useEffect(() => {
    if (!embedded || externalSelectedId == null) return;
    if (externalSelectedId === selectedAssetId) return;
    setSelectedAssetId(externalSelectedId);
  }, [embedded, externalSelectedId, selectedAssetId]);

  useEffect(() => {
    if (!embedded || !filmAssetPreviewSignal) return;
    if (filmAssetPreviewSignal.nonce === lastFilmPreviewNonceRef.current) {
      return;
    }
    lastFilmPreviewNonceRef.current = filmAssetPreviewSignal.nonce;

    const { assetId, document, videoPreviewUrl, generationStatus } =
      filmAssetPreviewSignal;
    preloadedFilmAssetIdRef.current = assetId;
    lastLoadedDocumentKeyRef.current = `${assetId}:preview`;
    setAssetDocuments((current) => ({
      ...current,
      [assetId]: document,
    }));
    setSelectedAssetId(assetId);
    setContentLoading(false);
    if (videoPreviewUrl) {
      setVideoUrl(videoPreviewUrl);
      setVideoLoading(false);
      setVideoError(null);
    }
    if (generationStatus !== undefined) {
      setGenerationStatus(generationStatus);
    }
  }, [embedded, filmAssetPreviewSignal]);

  useEffect(() => {
    // In control mode, an empty catalog during refresh must not wipe selection —
    // drafts and optimistic clips live in assetDocuments / explorer refs.
    if (assets.length === 0) {
      if (!embedded) {
        setSelectedAssetId(null);
      }
      return;
    }

    if (embedded) return;

    if (!selectedAssetId) {
      setSelectedAssetId(assets[0].id);
      return;
    }

    const inAssets = assets.some((asset) => asset.id === selectedAssetId);
    // Don't override a pending draft that exists in assetDocuments but hasn't
    // been persisted to Walrus yet (and therefore isn't in `assets`).
    if (!inAssets && !(selectedAssetId in assetDocuments)) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, assetDocuments, embedded, selectedAssetId]);

  useEffect(() => {
    if (!selectedAssetId) {
      lastLoadedDocumentKeyRef.current = null;
      return;
    }

    if (!selectedAsset || selectedAsset.id !== selectedAssetId) {
      return;
    }

    if (preloadedFilmAssetIdRef.current === selectedAsset.id) {
      preloadedFilmAssetIdRef.current = null;
      return;
    }

    const scopedAsset = selectedAsset;
    const loadKey = `${selectedAssetId}:${selectedAsset.blobId ?? ""}:${selectedAsset.currentVersion ?? ""}`;
    if (lastLoadedDocumentKeyRef.current === loadKey) {
      return;
    }

    // Optimistic / mid-save stubs have no blob yet; keep the preview document.
    if (!selectedAsset.blobId && assetDocumentsRef.current[selectedAsset.id]) {
      return;
    }

    let cancelled = false;

    async function loadAssetDocument() {
      const activeProject = getProject(projectId);
      if (!activeProject) {
        return;
      }

      const hasVisibleDocument = Boolean(assetDocumentsRef.current[scopedAsset.id]);
      if (!hasVisibleDocument) {
        setContentLoading(true);
      }
      try {
        const document = await loadDocument(scopedAsset);
        if (!cancelled) {
          if (preloadedFilmAssetIdRef.current === scopedAsset.id) {
            preloadedFilmAssetIdRef.current = null;
            return;
          }
          lastLoadedDocumentKeyRef.current = loadKey;
          setAssetDocuments((current) => ({
            ...current,
            [scopedAsset.id]: document,
          }));
        }
      } catch {
        // Mark this key as attempted so a failed RPC (e.g. 429) cannot
        // re-trigger an infinite load/retry loop via setAssetDocuments.
        if (!cancelled) {
          lastLoadedDocumentKeyRef.current = loadKey;
          if (!hasVisibleDocument) {
            setAssetDocuments((current) => ({
              ...current,
              [scopedAsset.id]: {
                prompt: "",
                status: "draft",
                updatedAt: new Date().toISOString(),
              },
            }));
          }
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    }

    void loadAssetDocument();

    return () => {
      cancelled = true;
    };
  }, [
    loadDocument,
    projectId,
    selectedAsset?.id,
    selectedAsset?.blobId,
    selectedAsset?.currentVersion,
    selectedAssetId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadVideo() {
      setVideoError(null);

      if (!selectedDocument?.video) {
        // If status is "ready" but the video field is absent, we're mid-save
        // and the video URL was already set directly from the generation bytes.
        // Don't clear it — wait until the saved document arrives with a proper
        // video reference.
        if (selectedDocument?.status !== "ready") {
          setVideoUrl((prev) => {
            if (prev?.startsWith("blob:")) {
              URL.revokeObjectURL(prev);
            }
            return null;
          });
          setVideoLoading(false);
        }
        return;
      }

      // Keep the current preview (e.g. object URL from generation) until the
      // Walrus blob URL is ready — avoids blanking the player after save.
      setVideoLoading(true);
      try {
        const ctx = await walrusStorage.getStorageContext();
        const objectUrl = await loadFilmVideoObjectUrl(ctx, selectedDocument.video);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setVideoUrl((prev) => {
          if (prev && prev.startsWith("blob:") && prev !== objectUrl) {
            URL.revokeObjectURL(prev);
          }
          return objectUrl;
        });
      } catch (err) {
        if (!cancelled) {
          setVideoError(
            err instanceof Error ? err.message : "Failed to load video preview",
          );
        }
      } finally {
        if (!cancelled) {
          setVideoLoading(false);
        }
      }
    }

    void loadVideo();

    return () => {
      cancelled = true;
    };
    // Intentionally depend on the document only — getStorageContext identity
    // changes often and must not restart video fetches.
  }, [selectedDocument]);

  useEffect(() => {
    return () => {
      setVideoUrl((prev) => {
        if (prev?.startsWith("blob:")) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, []);

  const persistGeneratedFilmAsset = useCallback(
    async (
      input: Parameters<typeof saveAsset>[0],
    ): Promise<SaveFilmAssetResult> => {
      const performSave = async (ctx: WalrusStorageContext): Promise<SaveFilmAssetResult> => {
        const activeProject = getProject(projectId);
        if (!activeProject) {
          throw new Error("Project not found");
        }

        const saved = await saveFilmAsset(ctx, activeProject, {
          ...input,
          knownFilmAssets: assetsRef.current,
        });

        saveProject({
          ...activeProject,
          manifestBlobId: saved.manifestBlobId,
          updatedAt: new Date().toISOString(),
        });

        return saved;
      };

      let result: SaveFilmAssetResult;
      if (controlModeWalrusSession?.isSessionActive()) {
        result = await performSave(await controlModeWalrusSession.getWriteContext());
        // Deferred writes flush on commitSession, which refreshes the catalog.
        return result;
      }

      if (controlModeWalrusSession) {
        result = await controlModeWalrusSession.runWithSession(async () =>
          performSave(await controlModeWalrusSession.getWriteContext()),
        );
        // commitSession already refreshed the shared project catalog.
        return result;
      }

      await persistWithControlModeWalrusPolicy(
        null,
        walrusStorage.getStorageContext,
        async (ctx) => {
          result = await performSave(ctx);
        },
      );
      walrusStorage.refreshProjectAssets();
      refresh();
      return result!;
    },
    [controlModeWalrusSession, projectId, refresh, walrusStorage],
  );

  const handleGenerateVideo = useCallback(
    async (request: FilmVideoGenerationRequest): Promise<string> => {
      const activeProject = getProject(projectId);
      if (!activeProject?.walrusPathPrefix) {
        throw new Error("Project is missing Walrus storage");
      }

      const draft = createDraft();

      const merged = mergeFilmGenerationRequest({
        requestPrompt: request.prompt,
        requestReferences: request.inputReferences,
        context: filmContextRef.current,
        generationSkillId: request.generationSkillId,
      });

      const prepared = prepareStoryboardToVideoGeneration({
        prompt: merged.prompt,
        inputReferences: merged.inputReferences,
        generationSkillId: request.generationSkillId,
        firstFrame: request.firstFrame,
        lastFrame: request.lastFrame,
        panelCount: filmContextRef.current?.storyboardPanelCount,
      });

      const existingDocument = assetDocuments[draft.id];
      const generatingDocument: FilmDocument = {
        ...existingDocument,
        prompt: prepared.prompt,
        generationModelId: request.videoModelId,
        durationSec: request.durationSec,
        status: "generating",
        sourceStoryboardId:
          merged.sourceStoryboardId ?? existingDocument?.sourceStoryboardId,
        sourceShotId: merged.sourceShotId ?? existingDocument?.sourceShotId,
        updatedAt: new Date().toISOString(),
      };

      setGenerationStatus(generationStatusLabel("submitting"));
      setAssetDocuments((current) => ({
        ...current,
        [draft.id]: generatingDocument,
      }));
      setSelectedAssetId(draft.id);
      workspaceSelection.revealAsset("videos", draft.id);
      walrusStorage.upsertOptimisticProjectAsset({
        id: draft.id,
        title: draft.title,
        folderId: "videos",
        storagePhase: "film",
        assetKind: "video",
        fileType: "video",
        createdAt: generatingDocument.updatedAt,
        updatedAt: generatingDocument.updatedAt,
        status: "saving",
      });

      try {
        const video = await generateFilmVideo({
          prompt: prepared.prompt,
          settings,
          videoModelId: request.videoModelId,
          duration: request.durationSec,
          inputReferences: prepared.inputReferences,
          firstFrame: prepared.firstFrame,
          lastFrame: prepared.lastFrame,
          aspectRatio: request.aspectRatio,
          resolution: request.resolution,
          generateAudio: request.generateAudio,
          onStatus: (status) => {
            setGenerationStatus(generationStatusLabel(status));
          },
        });

        // Show the video immediately from in-memory bytes — before Walrus save.
        const immediateBlob = new Blob([video.bytes.buffer.slice(0) as ArrayBuffer], { type: video.mimeType });
        const immediateUrl = URL.createObjectURL(immediateBlob);

        const readyDocument: FilmDocument = {
          ...generatingDocument,
          prompt: prepared.prompt,
          status: "ready",
          durationSec: request.durationSec,
          updatedAt: new Date().toISOString(),
        };

        setAssetDocuments((current) => ({
          ...current,
          [draft.id]: readyDocument,
        }));
        setSelectedAssetId(draft.id);
        // Set the URL directly — bypass the load effect so we don't hit Walrus.
        setVideoUrl(immediateUrl);
        setVideoLoading(false);
        setVideoError(null);
        setGenerationStatus("Saving to Walrus…");

        // Save to Walrus once when generation is done — UI is already showing the video.
        try {
          const result = await persistGeneratedFilmAsset({
            id: draft.id,
            title: draft.title,
            document: readyDocument,
            videoBytes: video.bytes,
            videoMimeType: video.mimeType,
          });

          setAssetDocuments((current) => ({
            ...current,
            [result.asset.id]: result.document,
          }));
          workspaceSelection.revealAsset("videos", result.asset.id);
        } finally {
          setGenerationStatus(null);
        }

        return `Generated "${draft.title}" successfully.`;
      } catch (err) {
        const failedDocument: FilmDocument = {
          ...generatingDocument,
          status: "failed",
          updatedAt: new Date().toISOString(),
        };

        setAssetDocuments((current) => ({
          ...current,
          [draft.id]: failedDocument,
        }));

        try {
          await persistGeneratedFilmAsset({
            id: draft.id,
            title: draft.title,
            document: failedDocument,
          });
        } catch {
          // Keep the surfaced generation error if persistence also fails.
        }

        setGenerationStatus(null);
        throw err;
      }
    },
    [assetDocuments, createDraft, embedded, persistGeneratedFilmAsset, projectId, settings, walrusStorage, workspaceSelection],
  );

  const handleSelectAsset = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
  }, []);

  const handleCreateClip = useCallback(() => {
    const draft = createDraft();
    setAssetDocuments((current) => ({
      ...current,
      [draft.id]: {
        prompt: "",
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
    }));
    setSelectedAssetId(draft.id);
  }, [createDraft]);

  const previewBusy =
    filmContextLoading ||
    generationStatus != null ||
    selectedDocument?.status === "generating" ||
    (embedded && isGeneratingFilmAsset);
  const hasSelectedClip =
    selectedAssetId != null ||
    selectedAsset != null ||
    selectedDocument != null ||
    videoUrl != null;
  const canDownload = Boolean(videoUrl) && !videoLoading && !previewBusy;

  async function handleDownload() {
    if (!canDownload || downloading) return;

    const title = selectedAsset?.title ?? "Film clip";
    setDownloading(true);
    try {
      await downloadFilmVideoAsset({
        title,
        video: selectedDocument?.video,
        videoObjectUrl: videoUrl,
        ctx: videoUrl ? undefined : await walrusStorage.getStorageContext(),
      });
      showToast("success", "Download started");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to download video",
      );
    } finally {
      setDownloading(false);
    }
  }

  const defaultFilmContextKey = filmContext
    ? `${filmContext.storyboardId}:${filmContext.segmentIndex}`
    : undefined;

  return (
    <>
      {!embedded ? (
        <FilmAssetPanel
        assets={assets}
        selectedAssetId={selectedAssetId}
        assetDocuments={assetDocuments}
        loading={loading}
        error={error}
        walrusPathPrefix={walrusPathPrefix}
        onRefresh={refresh}
        onSelectAsset={handleSelectAsset}
        onCreateClip={handleCreateClip}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-viewer">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-panel px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Clapperboard className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
            <p className="truncate text-[13px] font-semibold text-foreground">
              {selectedAsset?.title ?? "Film Preview"}
            </p>
            {selectedDocument && (
              <span
                className={cn(
                  "rounded-sm bg-bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  selectedDocument.status === "ready"
                    ? "text-green-500"
                    : selectedDocument.status === "failed"
                      ? "text-destructive-foreground"
                      : "text-text-secondary",
                )}
              >
                {statusLabel(selectedDocument.status)}
              </span>
            )}
          </div>
          <ContentDownloadButton
            disabled={!canDownload}
            downloading={downloading}
            onDownload={() => void handleDownload()}
          />
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto p-4">
          {!hasSelectedClip && !previewBusy && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Clapperboard className="h-10 w-10 text-text-disabled" />
              <p className="text-[13px] text-text-secondary">
                No clip selected yet.
              </p>
              <p className="max-w-sm text-[12px] text-text-disabled">
                Create a clip or use Generate in the agent panel with a prompt
                and optional reference image.
              </p>
            </div>
          )}

          {selectedAsset && contentLoading && (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading clip…
            </div>
          )}

          {(hasSelectedClip || previewBusy) && !contentLoading && (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {filmContextError && (
                <p className="rounded border border-destructive-foreground/30 bg-destructive-foreground/10 px-2 py-1 text-[12px] text-destructive-foreground">
                  {filmContextError}
                </p>
              )}
              <div className="overflow-hidden rounded border border-border-subtle bg-black">
                {previewBusy ? (
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 px-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-resolve-accent" />
                    <p className="text-[13px] text-text-secondary">
                      {filmContextLoading
                        ? generationStatus ?? "Preparing film generation…"
                        : generationStatus ?? "Generating video…"}
                    </p>
                  </div>
                ) : videoLoading ? (
                  <div className="flex aspect-video items-center justify-center text-[12px] text-text-secondary">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading video…
                  </div>
                ) : videoUrl ? (
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    playsInline
                    className="aspect-video w-full bg-black object-contain"
                  />
                ) : (
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 px-6 text-center">
                    <Clapperboard className="h-10 w-10 text-text-disabled" />
                    <p className="text-[13px] text-text-secondary">
                      {videoError ?? "No video generated for this clip yet."}
                    </p>
                  </div>
                )}
              </div>

              {selectedAsset && selectedDocument && (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Clip
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 text-[12px] text-foreground">
                        {selectedAsset.title}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Duration
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 text-[12px] text-foreground">
                        {selectedDocument.durationSec != null
                          ? `${selectedDocument.durationSec}s`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {(selectedDocument.generationModelId?.trim().length ?? 0) >
                    0 && (
                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Generation model
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground">
                        {getOpenRouterModelLabel(
                          selectedDocument.generationModelId ?? "",
                        )}
                      </p>
                    </div>
                  )}

                  {selectedDocument.prompt.trim().length > 0 && (
                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Generation prompt
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground whitespace-pre-wrap">
                        {selectedDocument.prompt}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {!embedded ? (
        <InspectorPanel
          scope={{
            mediaMode: "video",
            behaviorMode: "draft",
            skillId: null,
          } satisfies ConversationScope}
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          onGenerateVideo={handleGenerateVideo}
          defaultFilmPrompt={filmContext?.prompt}
          defaultFilmAttachments={filmContext?.attachments}
          defaultFilmDurationSec={filmContext?.durationSec}
          defaultFilmContextKey={defaultFilmContextKey}
        />
      ) : null}
    </>
  );
}
