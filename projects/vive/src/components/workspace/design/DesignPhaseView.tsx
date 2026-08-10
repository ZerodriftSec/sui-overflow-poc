import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useDesignAssets } from "../../../hooks/useDesignAssets";
import { useProjectAssets } from "../../../hooks/useProjectAssets";
import { useWorkspaceSelection } from "../../../hooks/useWorkspaceSelection";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import {
  getProject,
  type StoryboardSource,
} from "../../../lib/project";
import {
  listScriptAssetsForProject,
  loadDesignImageDataUrl,
  loadScriptAssetContent,
  type DesignAsset,
  type DesignDocument,
} from "../../../lib/workspace";
import type { AssetFolderId } from "../../../lib/asset-catalog";
import {
  completeSaveToast,
  failSaveToast,
  showSavingToast,
  showToast,
} from "../../../lib/toast";
import { useSettings } from "../../../components/SettingsProvider";
import {
  AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS,
  createPlaceholderDesignImage,
  generateDesignAssetsFromScript,
  isFallbackDesignImage,
  type DesignGenerationStatus,
} from "../../../lib/design-llm";
import {
  DEFAULT_DESIGN_ANALYSIS_MODEL,
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_IMAGE_GENERATION_SIZE,
  getOpenRouterModelLabel,
  OPENROUTER_IMAGE_MODELS,
  type ImageGenerationSize,
} from "../../../lib/openrouter-models";
import { cn } from "../../../lib/utils";
import { InspectorPanel } from "../InspectorPanel";
import type { ConversationScope } from "../../../lib/chat-scope";
import { ScriptEditorActionsMenu } from "../script/ScriptEditorActionsMenu";
import { ContentDownloadButton } from "../ContentDownloadButton";
import { DesignAssetPanel } from "./DesignAssetPanel";
import { ImageResolutionSelector } from "../ImageResolutionSelector";
import {
  designFolderForKind,
  promptTitleFromText,
  singleAssetDocument,
} from "../../../lib/control-mode-design";
import { useControlModeEditorSync } from "../../../hooks/useControlModeEditorSync";
import {
  downloadDesignImageAsset,
  downloadDesignTextAsset,
} from "../../../lib/download-workspace-content";

interface DesignPhaseViewProps {
  projectId: string;
  onOpenSettings?: () => void;
  embedded?: boolean;
  externalSelectedId?: string | null;
}

interface GenerationModalState {
  open: boolean;
  styleBrief: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
}

interface GenerationProgress {
  current: number;
  total: number;
  title: string;
}

function generationStatusLabel(
  status: DesignGenerationStatus,
  progress: GenerationProgress | null,
): string {
  switch (status) {
    case "analyzing":
      return "Preparing…";
    case "extracting-assets":
      return "Extracting assets from script…";
    case "generating-assets":
      return progress
        ? `Generating assets (${progress.current}/${progress.total}): ${progress.title}`
        : "Generating design assets…";
    case "saving":
      return "Saving design assets…";
    default:
      return "";
  }
}

function readNestedErrorMessage(value: unknown): string | null {
  if (value instanceof Error) {
    return value.message || null;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directKeys = ["message", "error", "detail", "details"] as const;
  for (const key of directKeys) {
    const message = readNestedErrorMessage(record[key]);
    if (message) return message;
  }

  return null;
}

function formatProviderError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to generate design assets";
  }

  const baseMessage = error.message?.trim() || "Failed to generate design assets";
  const record = error as unknown as Record<string, unknown>;

  const statusCode = record.statusCode;
  const statusText = record.statusText;
  const responseBody = record.responseBody;

  const nestedResponseMessage = readNestedErrorMessage(responseBody);
  if (nestedResponseMessage) {
    return nestedResponseMessage;
  }

  if (typeof responseBody === "string" && responseBody.trim().length > 0) {
    try {
      const parsed = JSON.parse(responseBody) as unknown;
      const parsedMessage = readNestedErrorMessage(parsed);
      if (parsedMessage) return parsedMessage;
      return responseBody;
    } catch {
      return responseBody;
    }
  }

  const nestedCauseMessage = readNestedErrorMessage(record.cause);
  if (nestedCauseMessage && nestedCauseMessage !== baseMessage) {
    return nestedCauseMessage;
  }

  const hasStatusCode = typeof statusCode === "number";
  const hasStatusText = typeof statusText === "string" && statusText.length > 0;
  if (hasStatusCode || hasStatusText) {
    return `${baseMessage}${hasStatusCode ? ` (${statusCode}` : " ("}${hasStatusText ? ` ${statusText}` : ""})`;
  }

  return baseMessage;
}

function resolveDesignAssetFileType(input: {
  primaryFileType?: "text" | "image";
  prompt?: string;
  imageMimeType?: string;
}): "text" | "image" {
  if (input.primaryFileType) {
    return input.primaryFileType;
  }
  if (input.imageMimeType === "image/svg+xml" && (input.prompt?.trim().length ?? 0) > 0) {
    return "text";
  }
  return "image";
}

const DESIGN_FOLDER_IDS = new Set<AssetFolderId>([
  "character_prompts",
  "character_sheets",
  "environment_prompts",
  "environment_sheets",
]);

function designAssetFromCatalogRef(input: {
  id: string;
  title: string;
  assetKind: string;
  fileType: string;
  contentBlobId?: string;
  currentVersion?: number;
  updatedAt?: string;
}): DesignAsset {
  return {
    id: input.id,
    title: input.title,
    kind: input.assetKind === "environment" ? "environment" : "character",
    primaryFileType: input.fileType === "text" ? "text" : "image",
    blobId: input.contentBlobId,
    currentVersion: input.currentVersion,
    updatedAt: input.updatedAt,
  };
}

export function DesignPhaseView({
  projectId,
  onOpenSettings,
  embedded = false,
  externalSelectedId = null,
}: DesignPhaseViewProps) {
  const { settings } = useSettings();
  const workspaceSelection = useWorkspaceSelection();
  const {
    previewSignal,
    designAssetPreviewSignal,
    isGeneratingDesignAsset,
  } = useControlModeEditorSync();
  const walrusStorage = useWalrusStorage();
  const navigate = useNavigate();
  const location = useLocation();
  const projectAssets = useProjectAssets(projectId);
  const {
    assets,
    loading,
    saving,
    error,
    walrusPathPrefix,
    refresh,
    hasDocumentCached,
    loadDocument,
    saveAsset,
    saveAssetsBatch,
  } = useDesignAssets(projectId, {
    // Control mode explorer already loads the shared catalog — avoid a second
    // list race that can leave this view empty while the sidebar shows assets.
    autoLoad: !embedded,
    syncedAssets: projectAssets.catalog.designAssets,
  });

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DesignDocument | null>(null);
  const [selectedImageDataUrl, setSelectedImageDataUrl] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<DesignGenerationStatus>("idle");
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(
    null,
  );
  const [modalState, setModalState] = useState<GenerationModalState>({
    open: false,
    styleBrief: "",
    imageModelId: DEFAULT_DESIGN_IMAGE_MODEL,
    imageResolution: DEFAULT_IMAGE_GENERATION_SIZE,
  });
  const [showDescription, setShowDescription] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const applyAgentContentRef = useRef<(content: string) => void>(() => {});
  const previewAgentContentRef = useRef<(content: string) => void>(() => {});
  const selectedDocumentRef = useRef<DesignDocument | null>(null);
  const selectedAssetRef = useRef<DesignAsset | null>(null);
  const selectedAssetIdRef = useRef<string | null>(null);
  // When we pre-set selectedDocument before selectedAssetId resolves to an asset,
  // we store the asset ID here so the document-loading effect skips the loading flash.
  const preloadedAssetIdRef = useRef<string | null>(null);
  const lastLoadedDocumentKeyRef = useRef<string | null>(null);

  const project = getProject(projectId);
  const storyboardSource = project?.storyboardSource ?? null;
  const selectedAsset = useMemo((): DesignAsset | null => {
    if (!selectedAssetId) return null;
    const fromHook = assets.find((asset) => asset.id === selectedAssetId);
    if (fromHook) return fromHook;
    const fromCatalog = projectAssets.catalog.designAssets.find(
      (asset) => asset.id === selectedAssetId,
    );
    if (fromCatalog) return fromCatalog;
    const fromRef = projectAssets.refs.find(
      (ref) =>
        ref.id === selectedAssetId && DESIGN_FOLDER_IDS.has(ref.folderId),
    );
    if (!fromRef) return null;
    return designAssetFromCatalogRef(fromRef);
  }, [
    assets,
    projectAssets.catalog.designAssets,
    projectAssets.refs,
    selectedAssetId,
  ]);
  const selectedItem = selectedDocument?.assets[0] ?? null;

  selectedDocumentRef.current = selectedDocument;
  selectedAssetRef.current = selectedAsset;
  selectedAssetIdRef.current = selectedAssetId;
  const selectedFileType = useMemo(
    () =>
      resolveDesignAssetFileType({
        primaryFileType: selectedAsset?.primaryFileType,
        prompt: selectedItem?.prompt,
        imageMimeType: selectedItem?.image?.mimeType,
      }),
    [selectedAsset?.primaryFileType, selectedItem?.image?.mimeType, selectedItem?.prompt],
  );

  useEffect(() => {
    if (!embedded || externalSelectedId == null) return;
    if (externalSelectedId === selectedAssetId) return;
    setSelectedAssetId(externalSelectedId);
  }, [embedded, externalSelectedId, selectedAssetId]);

  const lastPreviewNonceRef = useRef(0);
  const lastDesignPreviewNonceRef = useRef(0);

  useEffect(() => {
    if (!embedded || !previewSignal) return;
    if (previewSignal.nonce === lastPreviewNonceRef.current) return;
    lastPreviewNonceRef.current = previewSignal.nonce;
    previewAgentContentRef.current(previewSignal.content);
  }, [embedded, previewSignal]);

  useEffect(() => {
    if (!embedded || !designAssetPreviewSignal) return;
    if (designAssetPreviewSignal.nonce === lastDesignPreviewNonceRef.current) {
      return;
    }
    lastDesignPreviewNonceRef.current = designAssetPreviewSignal.nonce;

    const { assetId, document } = designAssetPreviewSignal;
    const image = document.assets[0]?.image;
    preloadedAssetIdRef.current = assetId;
    lastLoadedDocumentKeyRef.current = `${assetId}:preview`;
    setSelectedAssetId(assetId);
    setSelectedDocument(document);
    setContentLoading(false);
    if (image?.dataBase64) {
      setSelectedImageDataUrl(
        `data:${image.mimeType};base64,${image.dataBase64}`,
      );
    } else {
      setSelectedImageDataUrl(null);
    }
  }, [designAssetPreviewSignal, embedded]);

  useEffect(() => {
    if (embedded) return;
    if (!selectedAssetId && assets.length > 0) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, embedded, selectedAssetId]);

  useEffect(() => {
    setShowDescription(false);
  }, [selectedAssetId]);

  useEffect(() => {
    if (!selectedAssetId) {
      lastLoadedDocumentKeyRef.current = null;
      setSelectedDocument(null);
      setSelectedImageDataUrl(null);
      return;
    }

    if (!selectedAsset || selectedAsset.id !== selectedAssetId) {
      return;
    }

    if (preloadedAssetIdRef.current === selectedAsset.id) {
      preloadedAssetIdRef.current = null;
      return;
    }

    // Optimistic / mid-generation stubs have no Walrus blob yet. Wait for
    // stageGeneratedDesignAsset (pending doc + preview signal) instead of
    // toasting a failed fetch for an asset that was never persisted.
    if (!selectedAsset.blobId && !hasDocumentCached(selectedAsset.id)) {
      // Drop any previously selected asset's document so the generating
      // skeleton shows for this new stub instead of a stale preview.
      if (
        selectedDocumentRef.current &&
        !lastLoadedDocumentKeyRef.current?.startsWith(`${selectedAsset.id}:`)
      ) {
        setSelectedDocument(null);
        setSelectedImageDataUrl(null);
      }
      return;
    }

    const scopedAsset = selectedAsset;
    const loadKey = `${selectedAssetId}:${selectedAsset.blobId ?? ""}:${selectedAsset.currentVersion ?? ""}`;
    if (lastLoadedDocumentKeyRef.current === loadKey) {
      return;
    }

    let cancelled = false;

    async function loadSelected() {
      // Keep the current preview visible while reloading after a background save —
      // avoids blanking the image when the catalog blobId lands.
      const cached = hasDocumentCached(scopedAsset.id);
      const hasVisibleDocument =
        selectedDocumentRef.current?.assets[0] != null &&
        lastLoadedDocumentKeyRef.current?.startsWith(`${scopedAsset.id}:`);
      if (!cached && !hasVisibleDocument) {
        setContentLoading(true);
      }
      try {
        const doc = await loadDocument(scopedAsset);
        if (!cancelled) {
          lastLoadedDocumentKeyRef.current = loadKey;
          setSelectedDocument(doc);
        }
      } catch {
        // Record the attempt so a failed RPC cannot restart this effect forever.
        if (!cancelled) {
          lastLoadedDocumentKeyRef.current = loadKey;
          // Don't toast for optimistic stubs that still have no persisted blob —
          // generation/save will stage the document shortly.
          if (scopedAsset.blobId) {
            setSelectedDocument(null);
            setSelectedImageDataUrl(null);
            showToast("error", "Failed to load design asset");
          }
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    void loadSelected();
    return () => {
      cancelled = true;
    };
  }, [
    selectedAssetId,
    selectedAsset?.id,
    selectedAsset?.blobId,
    selectedAsset?.currentVersion,
    hasDocumentCached,
    loadDocument,
  ]);

  useEffect(() => {
    const image = selectedDocument?.assets[0]?.image;
    if (!image) {
      setSelectedImageDataUrl(null);
      return;
    }
    if (image.dataBase64 && image.dataBase64.length > 0) {
      setSelectedImageDataUrl(`data:${image.mimeType};base64,${image.dataBase64}`);
      return;
    }
    if (!image.imageBlobId?.trim()) {
      setSelectedImageDataUrl(null);
      return;
    }
    const imageToLoad = image;

    let cancelled = false;
    async function loadImage() {
      try {
        const ctx = await walrusStorage.getStorageContext();
        const dataUrl = await loadDesignImageDataUrl(ctx, imageToLoad);
        if (!cancelled) setSelectedImageDataUrl(dataUrl);
      } catch (error) {
        if (!cancelled) {
          showToast(
            "error",
            error instanceof Error
              ? error.message
              : "Failed to load design image",
          );
        }
      }
    }

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [selectedDocument]);

  useEffect(() => {
    const trigger =
      (location.state as Record<string, unknown> | null)?.triggerDesignGeneration === true;
    if (!trigger) return;
    setModalState((current) => ({ ...current, open: true }));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  function openGenerator() {
    setModalState((current) => ({ ...current, open: true }));
  }

  function closeGenerator() {
    setModalState((current) => ({ ...current, open: false }));
  }

  async function loadApprovedScriptSource(source: StoryboardSource): Promise<string> {
    const activeProject = getProject(projectId);
    if (!activeProject) {
      throw new Error("Project not found");
    }
    const ctx = await walrusStorage.getStorageContext();
    const scriptAssets = await listScriptAssetsForProject(ctx, activeProject);
    const sourceAsset = scriptAssets.find((asset) => asset.id === source.scriptId);
    if (!sourceAsset) {
      throw new Error("Approved script source could not be loaded");
    }
    return loadScriptAssetContent(ctx, activeProject, sourceAsset);
  }

  async function saveGeneratedAsset(input: {
    id: string;
    title: string;
    kind: DesignAsset["kind"];
    primaryFileType?: "text" | "image";
    document: DesignDocument;
  }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      saveAsset(input, {
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      });
    });
  }

  async function handleGenerateFromScript() {
    if (!storyboardSource) {
      showToast("error", "Approve a script first to generate design assets.");
      return;
    }

    if (!settings.openRouterApiKey.trim()) {
      showToast("error", "Add your OpenRouter API key in settings first.");
      onOpenSettings?.();
      return;
    }

    setGenerationStatus("analyzing");
    setGenerationProgress(null);
    closeGenerator();

    try {
      const scriptContent = await loadApprovedScriptSource(storyboardSource);
      const generated = await generateDesignAssetsFromScript({
        scriptContent,
        styleBrief: modalState.styleBrief.trim(),
        settings,
        analysisModelId: DEFAULT_DESIGN_ANALYSIS_MODEL,
        imageModelId: modalState.imageModelId,
        imageResolution: modalState.imageResolution,
        maxEnvironmentAssets: AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS,
        onStatus: setGenerationStatus,
        onAssetProgress: (current, total, title, _phase) => {
          setGenerationProgress({ current, total, title });
        },
      });

      setGenerationStatus("saving");
      setGenerationProgress(null);

      const batchInputs = generated.map((generatedAsset) => {
        const assetId = crypto.randomUUID();
        return {
          id: assetId,
          title: generatedAsset.title,
          kind: generatedAsset.kind,
          primaryFileType: "image" as const,
          document: singleAssetDocument(storyboardSource, modalState.styleBrief, {
            id: assetId,
            title: generatedAsset.title,
            kind: generatedAsset.kind,
            description: generatedAsset.description,
            prompt: generatedAsset.imagePrompt,
            generationModelId:
              generatedAsset.generationModelId ?? modalState.imageModelId,
            image: generatedAsset.image,
          }),
        };
      });

      await saveAssetsBatch(batchInputs);

      const failedImages = generated.filter((asset) =>
        isFallbackDesignImage(asset.image),
      ).length;
      if (failedImages === generated.length) {
        throw new Error(
          `Image generation failed for all ${generated.length} design assets. Try a different image model (e.g. Gemini 2.5 Flash Image).`,
        );
      }
      if (failedImages > 0) {
        showToast(
          "error",
          `${failedImages} of ${generated.length} design images failed to generate. Saved placeholders for failed assets.`,
        );
      }

      setGenerationStatus("done");
      setGenerationProgress(null);
      showToast("success", "Design assets generated and stored to Walrus.");
    } catch (err) {
      setGenerationStatus("error");
      setGenerationProgress(null);
      showToast("error", formatProviderError(err));
    }
  }

  const openStoryboardDisabledReason = (() => {
    if (!storyboardSource) return "Approve a script in the Script phase first";
    if (assets.length === 0) return "Create at least one design asset first";
    return undefined;
  })();

  const canOpenStoryboard =
    Boolean(storyboardSource) && assets.length > 0;

  function handleOpenStoryboard() {
    if (!canOpenStoryboard) return;

    navigate(`/app/projects/${projectId}/storyboard`, {
      state: { triggerNewGeneration: true },
    });
  }

  async function handleSaveCurrent() {
    if (!selectedAsset || !selectedDocument) return;
    const toastId = showSavingToast(selectedAsset.title);
    try {
      await saveGeneratedAsset({
        id: selectedAsset.id,
        title: selectedAsset.title,
        kind: selectedAsset.kind,
        primaryFileType: selectedFileType,
        document: selectedDocument,
      });
      completeSaveToast(toastId, selectedAsset.title);
    } catch (err) {
      failSaveToast(
        toastId,
        err instanceof Error ? err.message : "Failed to save design asset",
      );
    }
  }

  function handleApplyAgentContent(content: string) {
    const prompt = content.trim();
    if (!prompt) return;

    const skillId = workspaceSelection.selection.chatScope.skillId;
    const behaviorMode = workspaceSelection.selection.chatScope.behaviorMode;
    const shouldCreateNewFromSkill =
      behaviorMode === "draft" &&
      (skillId === "character" || skillId === "environment");

    const skillKind: DesignAsset["kind"] =
      skillId === "environment" ? "environment" : "character";
    // When drafting via /character or /environment, always use the active skill's
    // kind — not whatever asset happens to still be selected in the center panel.
    const kind = shouldCreateNewFromSkill
      ? skillKind
      : (selectedAsset?.kind ?? skillKind);

    if (selectedAsset && selectedDocument && !shouldCreateNewFromSkill) {
      const updatedDocument: DesignDocument = {
        ...selectedDocument,
        updatedAt: new Date().toISOString(),
        assets: selectedDocument.assets.map((asset, index) =>
          index === 0 ? { ...asset, prompt } : asset,
        ),
      };
      const toastId = showSavingToast(selectedAsset.title);
      setSelectedDocument(updatedDocument);
      saveAsset(
        {
          id: selectedAsset.id,
          title: selectedAsset.title,
          kind: selectedAsset.kind,
          primaryFileType: selectedFileType,
          document: updatedDocument,
        },
        {
          onSuccess: (asset) => {
            completeSaveToast(toastId, asset.title);
          },
          onError: (err) => {
            failSaveToast(toastId, err.message);
          },
        },
      );
      return;
    }

    const assetId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const title = promptTitleFromText(prompt, kind);
    const placeholderImage = createPlaceholderDesignImage(title, prompt.slice(0, 100));
    const document = singleAssetDocument(storyboardSource, "", {
      id: itemId,
      title,
      kind,
      description: "",
      prompt,
      image: placeholderImage,
    });
    const toastId = showSavingToast(title);

    // Show in center panel immediately — before the Walrus save.
    preloadedAssetIdRef.current = assetId;
    setSelectedDocument(document);
    setSelectedAssetId(assetId);
    const targetFolder = designFolderForKind(kind);

    saveAsset(
      {
        id: assetId,
        title,
        kind,
        primaryFileType: "text",
        document,
      },
      {
        onSuccess: (asset) => {
          completeSaveToast(toastId, asset.title);
          workspaceSelection.revealAsset(targetFolder, asset.id);
        },
        onError: (err) => {
          failSaveToast(toastId, err.message);
        },
      },
    );
  }

  function handlePreviewAgentContent(content: string) {
    const preview = content.trim();
    if (!preview) return;

    const selectedSkill = workspaceSelection.selection.chatScope.skillId;
    const inferredKind: DesignAsset["kind"] =
      selectedSkill === "environment" ? "environment" : "character";

    if (!selectedDocument) {
      const itemId = crypto.randomUUID();
      const title = promptTitleFromText(preview, inferredKind);
      setSelectedDocument(
        singleAssetDocument(storyboardSource, "", {
          id: itemId,
          title,
          kind: inferredKind,
          description: "",
          prompt: preview,
          image: createPlaceholderDesignImage(title, preview.slice(0, 100)),
        }),
      );
      setSelectedImageDataUrl(null);
      return;
    }

    const nextValue =
      selectedFileType === "text" || selectedSkill === "character" || selectedSkill === "environment"
        ? preview
        : content;

    setSelectedDocument((current) =>
      current
        ? {
            ...current,
            assets: current.assets.map((asset, index) =>
              index === 0
                ? selectedFileType === "text"
                  ? { ...asset, prompt: nextValue }
                  : { ...asset, description: nextValue }
                : asset,
            ),
          }
        : current,
    );
  }

  applyAgentContentRef.current = handleApplyAgentContent;
  previewAgentContentRef.current = handlePreviewAgentContent;

  const canDownload =
    Boolean(selectedItem) &&
    !contentLoading &&
    (selectedFileType === "text"
      ? selectedItem!.prompt.trim().length > 0
      : Boolean(selectedImageDataUrl || selectedItem!.image));

  async function handleDownload() {
    if (!selectedItem || !canDownload || downloading) return;

    setDownloading(true);
    try {
      if (selectedFileType === "text") {
        downloadDesignTextAsset({
          title: selectedItem.title,
          prompt: selectedItem.prompt,
          description: selectedItem.description,
        });
      } else {
        const ctx = await walrusStorage.getStorageContext();
        await downloadDesignImageAsset({
          title: selectedItem.title,
          image: selectedItem.image,
          imageDataUrl: selectedImageDataUrl,
          ctx,
        });
      }
      showToast("success", "Download started");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to download design asset",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {!embedded ? (
        <DesignAssetPanel
          assets={assets}
          selectedAssetId={selectedAssetId}
          loading={loading}
          error={error}
          namespace={walrusPathPrefix}
          onRefresh={refresh}
          onCreateFromScript={openGenerator}
          onSelectAsset={setSelectedAssetId}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-app">
        <div className="flex h-9 items-center justify-between gap-2 border-b border-border-subtle bg-bg-panel px-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {selectedAsset?.title ?? selectedItem?.title ?? "Design Workspace"}
            </p>
            {storyboardSource && (
              <p className="truncate text-[10px] text-text-secondary">
                Source script: {storyboardSource.scriptTitle} · v{storyboardSource.version}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(generationStatus !== "idle" &&
              generationStatus !== "done" &&
              generationStatus !== "error") ||
            saving ? (
              <span className="inline-flex max-w-[280px] items-center gap-1 truncate text-[11px] text-text-secondary">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                {saving
                  ? "Saving…"
                  : generationStatusLabel(generationStatus, generationProgress)}
              </span>
            ) : null}
            {!embedded ? (
              <>
                <button
                  type="button"
                  onClick={openGenerator}
                  className="inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-bg-raised"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Create Design
                </button>

                <span className="mx-0.5 h-4 w-px bg-border-subtle" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleOpenStoryboard}
                  disabled={!canOpenStoryboard}
                  title={
                    canOpenStoryboard
                      ? "Continue to storyboard generation"
                      : openStoryboardDisabledReason
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors",
                    canOpenStoryboard
                      ? "bg-resolve-accent text-bg-app shadow-sm hover:opacity-90"
                      : "cursor-not-allowed bg-bg-raised text-text-disabled",
                  )}
                >
                  Create Storyboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}

            <ContentDownloadButton
              disabled={!canDownload}
              downloading={downloading}
              onDownload={() => void handleDownload()}
            />

            <button
              type="button"
              onClick={() => void handleSaveCurrent()}
              disabled={!selectedAsset || !selectedDocument}
              className="inline-flex items-center gap-1 rounded bg-resolve-accent px-2 py-1 text-[12px] font-medium text-bg-app transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-bg-viewer p-4">
          {!selectedDocument &&
            embedded &&
            isGeneratingDesignAsset && (
              <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4">
                <div className="aspect-square w-full max-w-lg self-center rounded-lg bg-bg-raised" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3 w-12 rounded bg-bg-raised" />
                    <div className="h-8 rounded bg-bg-raised" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3 w-10 rounded bg-bg-raised" />
                    <div className="h-8 rounded bg-bg-raised" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 w-14 rounded bg-bg-raised" />
                  <div className="h-24 rounded bg-bg-raised" />
                </div>
                <p className="text-center text-[12px] text-text-secondary">
                  Generating image…
                </p>
              </div>
            )}

          {!selectedAsset && !selectedDocument && !isGeneratingDesignAsset && (
            <div className="flex h-full items-center justify-center text-[13px] text-text-secondary">
              Create or select a design asset to start.
            </div>
          )}

          {selectedAsset && contentLoading && !isGeneratingDesignAsset && (
            <div className="flex h-full items-center justify-center gap-2 text-[13px] text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading asset…
            </div>
          )}

          {(selectedAsset || selectedDocument) && !contentLoading && selectedItem && (
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {selectedFileType === "image" ? (
                <>
                  <div className="overflow-hidden rounded border border-border-subtle bg-black">
                    {selectedImageDataUrl ? (
                      <img
                        src={selectedImageDataUrl}
                        alt={selectedItem.title}
                        className="h-auto w-full object-contain"
                      />
                    ) : (
                      <div className="flex min-h-[240px] items-center justify-center text-[12px] text-text-secondary">
                        Loading image…
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Title
                      <input
                        value={selectedItem.title}
                        onChange={(event) =>
                          setSelectedDocument((current) =>
                            current
                              ? {
                                  ...current,
                                  assets: current.assets.map((asset, index) =>
                                    index === 0
                                      ? { ...asset, title: event.target.value }
                                      : asset,
                                  ),
                                }
                              : current,
                          )
                        }
                        className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Kind
                      <input
                        value={selectedItem.kind}
                        readOnly
                        className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-text-secondary outline-none"
                      />
                    </label>
                  </div>

                  {(selectedItem.generationModelId?.trim().length ?? 0) > 0 && (
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Generation model
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground">
                        {getOpenRouterModelLabel(
                          selectedItem.generationModelId ?? "",
                        )}
                      </p>
                    </label>
                  )}

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-text-secondary">Image Prompt</span>
                      <ScriptEditorActionsMenu
                        items={[
                          {
                            id: "toggle-description",
                            label: showDescription
                              ? "Hide description"
                              : "Show description",
                            onSelect: () => setShowDescription((current) => !current),
                          },
                        ]}
                      />
                    </div>

                    {showDescription ? (
                      <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                        Description
                        <textarea
                          rows={3}
                          value={selectedItem.description}
                          onChange={(event) =>
                            setSelectedDocument((current) =>
                              current
                                ? {
                                    ...current,
                                    assets: current.assets.map((asset, index) =>
                                      index === 0
                                        ? { ...asset, description: event.target.value }
                                        : asset,
                                    ),
                                  }
                                : current,
                            )
                          }
                          className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                        />
                      </label>
                    ) : null}

                    <textarea
                      rows={6}
                      value={selectedItem.prompt}
                      onChange={(event) =>
                        setSelectedDocument((current) =>
                          current
                            ? {
                                ...current,
                                assets: current.assets.map((asset, index) =>
                                  index === 0
                                    ? { ...asset, prompt: event.target.value }
                                    : asset,
                                ),
                              }
                            : current,
                        )
                      }
                      className="rounded border border-border-subtle bg-bg-app px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-border-focus"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Title
                      <input
                        value={selectedItem.title}
                        onChange={(event) =>
                          setSelectedDocument((current) =>
                            current
                              ? {
                                  ...current,
                                  assets: current.assets.map((asset, index) =>
                                    index === 0
                                      ? { ...asset, title: event.target.value }
                                      : asset,
                                  ),
                                }
                              : current,
                          )
                        }
                        className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Kind
                      <input
                        value={selectedItem.kind}
                        readOnly
                        className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-text-secondary outline-none"
                      />
                    </label>
                  </div>

                  {(selectedItem.generationModelId?.trim().length ?? 0) > 0 && (
                    <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                      Generation model
                      <p className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 font-mono text-[11px] text-foreground">
                        {getOpenRouterModelLabel(
                          selectedItem.generationModelId ?? "",
                        )}
                      </p>
                    </label>
                  )}

                  <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                    Character / Environment Prompt
                    <textarea
                      rows={18}
                      value={selectedItem.prompt}
                      onChange={(event) =>
                        setSelectedDocument((current) =>
                          current
                            ? {
                                ...current,
                                assets: current.assets.map((asset, index) =>
                                  index === 0
                                    ? { ...asset, prompt: event.target.value }
                                    : asset,
                                ),
                              }
                            : current,
                        )
                      }
                      className="min-h-[420px] rounded border border-border-subtle bg-bg-app px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-border-focus"
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!embedded ? (
        <InspectorPanel
          scope={{
            mediaMode: selectedFileType === "text" ? "text" : "image",
            behaviorMode: "edit",
            skillId:
              selectedAsset?.kind === "environment"
                ? selectedFileType === "image"
                  ? "environment-sheet"
                  : "environment"
                : selectedFileType === "image"
                  ? "character-sheet"
                  : "character",
          } satisfies ConversationScope}
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          onApplyContent={
            (content) => applyAgentContentRef.current(content)
          }
          onPreviewApply={
            (content) => previewAgentContentRef.current(content)
          }
        />
      ) : null}

      {modalState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-lg border border-border-subtle bg-bg-panel p-4">
            <h2 className="text-sm font-semibold text-foreground">Create Design</h2>
            <p className="mt-1 text-[12px] text-text-secondary">
              The agent will read your beat sheet, extract recurring characters and one
              empty environment reference, write an image prompt for each asset, then
              generate images with your selected model.
            </p>

            <label className="mt-3 flex flex-col gap-1 text-[11px] text-text-secondary">
              Image model
              <select
                value={modalState.imageModelId}
                onChange={(event) =>
                  setModalState((current) => ({
                    ...current,
                    imageModelId: event.target.value,
                  }))
                }
                className="rounded border border-border-subtle bg-bg-app px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-border-focus"
              >
                {OPENROUTER_IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 flex flex-col gap-1 text-[11px] text-text-secondary">
              Image resolution
              <ImageResolutionSelector
                value={modalState.imageResolution}
                onChange={(imageResolution) =>
                  setModalState((current) => ({ ...current, imageResolution }))
                }
              />
            </label>

            <label className="mt-3 flex flex-col gap-1 text-[11px] text-text-secondary">
              Style brief
              <textarea
                rows={6}
                value={modalState.styleBrief}
                onChange={(event) =>
                  setModalState((current) => ({
                    ...current,
                    styleBrief: event.target.value,
                  }))
                }
                placeholder="Example: painterly anime with neon-cyberpunk lighting, soft bloom, expressive character sheets."
                className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
              />
            </label>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeGenerator}
                className="rounded border border-border-subtle px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateFromScript()}
                className="rounded bg-resolve-accent px-3 py-1.5 text-[12px] font-medium text-bg-app transition-colors hover:opacity-90"
              >
                Generate Assets
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
