import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  ArrowRight,
  GripVertical,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useStoryboardAssets } from "../../../hooks/useStoryboardAssets";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import { useWorkspaceSelection } from "../../../hooks/useWorkspaceSelection";
import {
  getActiveStoryboardId,
  getProject,
  setActiveStoryboard,
  type StoryboardCard,
  type StoryboardAsset,
  type StoryboardDocument,
  type StoryboardSheetEntry,
} from "../../../lib/project";
import {
  aspectRatioToNumber,
  buildCardSheetPanelMap,
} from "../../../lib/storyboard-sheet-layout";
import {
  buildStoryboardPrompt,
  renumberStoryboardCards,
} from "../../../lib/storyboard";
import {
  generateStoryboardCardsWithLLM,
  type StoryboardGenerationStatus,
} from "../../../lib/storyboard-llm";
import { generateBlocking2DForStoryboardCard } from "../../../lib/storyboard-blocking-llm";
import { parseStoryboardBlocking2DFromText } from "../../../lib/storyboard-blocking-2d";
import { generateSceneGraphForStoryboardCard } from "../../../lib/storyboard-scene-llm";
import { parseStoryboardSceneGraphFromText } from "../../../lib/storyboard-scene-graph";
import { useSettings } from "../../../components/SettingsProvider";
import {
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_IMAGE_GENERATION_SIZE,
  DEFAULT_STORYBOARD_OPENROUTER_MODEL,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
} from "../../../lib/openrouter-models";
import {
  generateStoryboardContactSheets,
  loadProjectDesignAssets,
} from "../../../lib/film-generation-context";
import {
  listScriptAssetsForProject,
  loadDesignImageDataUrl,
  loadScriptAssetContent,
} from "../../../lib/workspace";
import {
  completeSaveToast,
  failSaveToast,
  showSavingToast,
  showToast,
} from "../../../lib/toast";
import { cn } from "../../../lib/utils";
import { downloadStoryboardAsset } from "../../../lib/download-workspace-content";
import { InspectorPanel } from "../InspectorPanel";
import { ContentDownloadButton } from "../ContentDownloadButton";
import type { ConversationScope } from "../../../lib/chat-scope";
import { StoryboardAssetPanel } from "./StoryboardAssetPanel";
import { StoryboardBlocking2DPreview } from "./StoryboardBlocking2DPreview";
import { StoryboardSceneGraphPreview } from "./StoryboardSceneGraphPreview";
import { StoryboardSheetPanelCrop } from "./StoryboardSheetPanelCrop";
import { useControlModeEditorSync } from "../../../hooks/useControlModeEditorSync";

interface StoryboardPhaseViewProps {
  projectId: string;
  onOpenSettings?: () => void;
  embedded?: boolean;
  externalSelectedId?: string | null;
}

type CenterMode = "board" | "detail";

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function emptyCard(index: number): StoryboardCard {
  const card: StoryboardCard = {
    id: crypto.randomUUID(),
    sceneIndex: index,
    shotIndex: index + 1,
    title: `Shot ${index + 1}`,
    scriptSegment: "",
    storyPurpose: "",
    shotDescription: "",
    shotType: "MS",
    cameraAngle: "eye-level",
    cameraMovement: "",
    characterAction: "",
    visualSketch: "",
    sceneGraph: null,
    blocking2d: null,
    dialogue: "",
    voiceover: "",
    sfx: "",
    musicCue: "",
    continuity: "",
    estimatedDurationSec: 4,
    transitionOut: "cut",
    generationPrompt: "",
    negativePrompt:
      "No extra limbs, no warped faces, no text overlays, no logo watermarks",
    status: "draft",
  };
  return {
    ...card,
    generationPrompt: buildStoryboardPrompt(card),
  };
}

function withPrompt(card: StoryboardCard): StoryboardCard {
  return {
    ...card,
    generationPrompt: buildStoryboardPrompt(card),
  };
}

function buildStoryboardDocument(
  cards: StoryboardCard[],
  source: {
    scriptId: string;
    version: number;
    blobId: string;
  } | null,
  sheets: StoryboardSheetEntry[] = [],
): StoryboardDocument {
  return {
    ...(source
      ? {
          sourceScriptId: source.scriptId,
          sourceScriptVersion: source.version,
          sourceScriptBlobId: source.blobId,
        }
      : {}),
    updatedAt: new Date().toISOString(),
    cards: renumberStoryboardCards(cards.map(withPrompt)),
    ...(sheets.length > 0 ? { sheets } : {}),
  };
}

function resolveVersion(asset: StoryboardAsset, viewingVersion: number | null) {
  if (viewingVersion == null) {
    return asset.versions.find((entry) => entry.version === asset.currentVersion) ?? null;
  }
  return asset.versions.find((entry) => entry.version === viewingVersion) ?? null;
}

function nextStoryboardTitle(assets: StoryboardAsset[]): string {
  let index = assets.length + 1;
  while (assets.some((asset) => asset.title === `Storyboard ${index}`)) {
    index += 1;
  }
  return `Storyboard ${index}`;
}

export function StoryboardPhaseView({
  projectId,
  onOpenSettings,
  embedded = false,
  externalSelectedId = null,
}: StoryboardPhaseViewProps) {
  const { settings } = useSettings();
  const walrusStorage = useWalrusStorage();
  const workspaceSelection = useWorkspaceSelection();
  const { setStoryboardCardId } = useControlModeEditorSync();
  const {
    assets,
    loading: assetsLoading,
    saving,
    error: assetsError,
    loadDocument,
    saveAsset,
  } = useStoryboardAssets(projectId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [storyboardTitle, setStoryboardTitle] = useState("Untitled Storyboard");
  const [cards, setCards] = useState<StoryboardCard[]>([]);
  const [savedCards, setSavedCards] = useState<StoryboardCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [centerMode, setCenterMode] = useState<CenterMode>("board");
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [initialSelectionSet, setInitialSelectionSet] = useState(false);
  // Persists the in-memory draft so it survives the user switching to a saved
  // storyboard and back.
  const draftCardsRef = useRef<StoryboardCard[]>([]);
  const draftTitleRef = useRef("Untitled Storyboard");
  const cardsRef = useRef<StoryboardCard[]>([]);
  const [generationStatus, setGenerationStatus] =
    useState<StoryboardGenerationStatus>("idle");
  const [generationModelId] = useState(DEFAULT_STORYBOARD_OPENROUTER_MODEL);
  const generationAbortRef = useRef<AbortController | null>(null);
  const blocking2dAbortRef = useRef<AbortController | null>(null);
  const sceneGraphAbortRef = useRef<AbortController | null>(null);
  const hasAutoGeneratedRef = useRef(false);
  const [blocking2dLoadingCardId, setBlocking2dLoadingCardId] = useState<string | null>(
    null,
  );
  const [blocking2dEditorText, setBlocking2dEditorText] = useState("");
  const [sceneGraphLoadingCardId, setSceneGraphLoadingCardId] = useState<string | null>(
    null,
  );
  const [sceneGraphEditorText, setSceneGraphEditorText] = useState("");
  const [sheets, setSheets] = useState<StoryboardSheetEntry[]>([]);
  const [savedSheets, setSavedSheets] = useState<StoryboardSheetEntry[]>([]);
  const [sheetGenerationProgress, setSheetGenerationProgress] = useState<{
    current: number;
    total: number;
    title: string;
  } | null>(null);
  const [sheetImageUrls, setSheetImageUrls] = useState<Record<string, string>>(
    {},
  );
  const [downloading, setDownloading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  // Capture the flag once at mount; cleared from history so back-navigation
  // doesn't re-trigger.
  const triggerNewGenerationRef = useRef(
    (location.state as Record<string, unknown> | null)?.triggerNewGeneration === true,
  );

  const project = getProject(projectId);
  const storyboardSource = project?.storyboardSource ?? null;
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  useEffect(() => {
    if (!embedded || externalSelectedId == null) return;
    if (externalSelectedId === selectedAssetId) return;
    setSelectedAssetId(externalSelectedId);
    setViewingVersion(null);
  }, [embedded, externalSelectedId, selectedAssetId]);

  useEffect(() => {
    if (!embedded) return;
    setStoryboardCardId(selectedCardId);
  }, [embedded, selectedCardId, setStoryboardCardId]);

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? null,
    [cards, selectedCardId],
  );
  cardsRef.current = cards;
  const cardSheetPanels = useMemo(
    () => buildCardSheetPanelMap(sheets, sheetImageUrls),
    [sheets, sheetImageUrls],
  );
  const selectedCardSheetPanel = selectedCard
    ? (cardSheetPanels.get(selectedCard.id) ?? null)
    : null;
  const dirty = useMemo(() => {
    if (!selectedAsset) return cards.length > 0;
    const titleDirty = storyboardTitle.trim() !== selectedAsset.title;
    const cardsDirty = JSON.stringify(cards) !== JSON.stringify(savedCards);
    const sheetsDirty = JSON.stringify(sheets) !== JSON.stringify(savedSheets);
    return titleDirty || cardsDirty || sheetsDirty;
  }, [cards, savedCards, savedSheets, selectedAsset, sheets, storyboardTitle]);
  const canSave =
    dirty && !saving && !loading && !contentLoading && viewingVersion == null;
  const canDownload =
    cards.length > 0 && !saving && !loading && !contentLoading;

  const openFilmDisabledReason = (() => {
    if (!storyboardSource) return "Approve a script in the Script phase first";
    if (selectedAssetId === null) return "Save this storyboard before opening film";
    if (viewingVersion != null) return "Return to the latest version";
    if (dirty) return "Save your changes first";
    if (cards.length === 0) return "Add storyboard shots first";
    return undefined;
  })();

  const canOpenFilm =
    Boolean(storyboardSource) &&
    selectedAssetId !== null &&
    viewingVersion == null &&
    !dirty &&
    cards.length > 0;

  function handleOpenFilm() {
    if (!canOpenFilm || !selectedAssetId) return;

    navigate(`/app/projects/${projectId}/film`, {
      state: {
        triggerFilmContext: true,
        storyboardId: selectedAssetId,
        segmentIndex: 0,
      },
    });
  }

  useEffect(() => {
    if (!selectedCard?.blocking2d) {
      setBlocking2dEditorText("");
      return;
    }
    setBlocking2dEditorText(JSON.stringify(selectedCard.blocking2d, null, 2));
  }, [selectedCard?.id, selectedCard?.blocking2d]);

  useEffect(() => {
    if (!selectedCard?.sceneGraph) {
      setSceneGraphEditorText("");
      return;
    }
    setSceneGraphEditorText(JSON.stringify(selectedCard.sceneGraph, null, 2));
  }, [selectedCard?.id, selectedCard?.sceneGraph]);

  useEffect(() => {
    if (assetsLoading || initialSelectionSet) return;
    const activeId = getActiveStoryboardId(projectId);
    if (!triggerNewGenerationRef.current) {
      setSelectedAssetId(activeId ?? assets[0]?.id ?? null);
    }
    setInitialSelectionSet(true);
  }, [assetsLoading, assets, projectId, initialSelectionSet]);

  useEffect(() => {
    if (!selectedAsset) {
      setContentLoading(false);
      if (draftCardsRef.current.length > 0) {
        setCards(draftCardsRef.current);
        setSavedCards([]);
        setStoryboardTitle(draftTitleRef.current);
      } else {
        setCards([]);
        setSavedCards([]);
        setStoryboardTitle("Untitled Storyboard");
      }
      setSheets([]);
      setSavedSheets([]);
      setSheetImageUrls({});
      setCenterMode("board");
      return;
    }

    const versionEntry = resolveVersion(selectedAsset, viewingVersion);
    if (!versionEntry) {
      setCards([]);
      setSavedCards([]);
      setSheets([]);
      setSavedSheets([]);
      setSheetImageUrls({});
      return;
    }

    const assetToLoad = selectedAsset;
    let cancelled = false;

    async function load() {
      setContentLoading(true);
      setError(null);
      try {
        const document = await loadDocument(
          assetToLoad,
          viewingVersion ?? undefined,
        );
        if (cancelled) return;

        const loadedCards = renumberStoryboardCards(
          document.cards.map(withPrompt),
        );
        setCards(loadedCards);
        setSavedCards(loadedCards);
        const loadedSheets = document.sheets ?? [];
        setSheets(loadedSheets);
        setSavedSheets(loadedSheets);
        setStoryboardTitle(assetToLoad.title);
        setCenterMode("board");
        setSelectedCardId((current) =>
          loadedCards.some((card) => card.id === current)
            ? current
            : (loadedCards[0]?.id ?? null),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load storyboard",
          );
          setCards([]);
          setSavedCards([]);
          setSheets([]);
          setSavedSheets([]);
          setSheetImageUrls({});
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedAsset, viewingVersion, loadDocument]);

  useEffect(() => {
    if (sheets.length === 0) {
      setSheetImageUrls({});
      return;
    }

    let cancelled = false;

    async function loadSheetImages() {
      const activeProject = getProject(projectId);
      if (!activeProject) {
        if (!cancelled) setSheetImageUrls({});
        return;
      }

      try {
        const ctx = await walrusStorage.getStorageContext();
        const nextUrls: Record<string, string> = {};

        await Promise.all(
          sheets.map(async (sheet) => {
            try {
              const dataUrl = await loadDesignImageDataUrl(ctx, sheet.image);
              nextUrls[sheet.segmentId] = dataUrl;
            } catch {
              // Skip sheets whose image cannot be loaded.
            }
          }),
        );

        if (!cancelled) {
          setSheetImageUrls(nextUrls);
        }
      } catch {
        if (!cancelled) {
          setSheetImageUrls({});
        }
      }
    }

    void loadSheetImages();
    return () => {
      cancelled = true;
    };
  }, [sheets, projectId, walrusStorage]);

  // Clear the navigation flag from history so back-navigation never re-triggers.
  useEffect(() => {
    if (triggerNewGenerationRef.current) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate when:
  //  a) "Create Storyboard" was clicked explicitly (triggerNewGeneration flag), OR
  //  b) A script is approved and there are no existing storyboard assets yet.
  // Always wait for assetsLoaded so we don't fire against the initial [] state.
  // In embedded control mode, storyboard creation is handled by the agent panel
  // (/storyboard skill) — auto-regenerate would duplicate LLM work and contact-sheet calls.
  useEffect(() => {
    if (embedded) return;
    if (assetsLoading || !initialSelectionSet) return;
    if (hasAutoGeneratedRef.current) return;
    if (!storyboardSource) return;

    const shouldGenerate =
      triggerNewGenerationRef.current || assets.length === 0;
    if (!shouldGenerate) return;

    hasAutoGeneratedRef.current = true;
    setSelectedAssetId(null);
    handleRegenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsLoading, initialSelectionSet, storyboardSource, assets.length]);

  // Keep the draft ref in sync while in draft mode so it survives asset switches.
  useEffect(() => {
    if (selectedAssetId === null) {
      draftCardsRef.current = cards;
      draftTitleRef.current = storyboardTitle;
    }
  }, [selectedAssetId, cards, storyboardTitle]);

  // Clean up any in-progress generation on unmount.
  useEffect(() => {
    return () => {
      generationAbortRef.current?.abort();
      blocking2dAbortRef.current?.abort();
      sceneGraphAbortRef.current?.abort();
    };
  }, []);

  function updateCards(nextCards: StoryboardCard[]) {
    const normalized = renumberStoryboardCards(nextCards.map(withPrompt));
    setCards(normalized);
  }

  function updateSelectedCard(
    updater: (card: StoryboardCard) => StoryboardCard,
  ): void {
    if (!selectedCard) return;
    const nextCards = cards.map((card) =>
      card.id === selectedCard.id ? withPrompt(updater(card)) : card,
    );
    updateCards(nextCards);
  }

  function addCard(): void {
    const card = emptyCard(cards.length);
    const nextCards = [...cards, card];
    updateCards(nextCards);
    setSelectedCardId(card.id);
    setCenterMode("detail");
  }

  function deleteSelectedCard(): void {
    if (!selectedCard) return;
    const nextCards = cards.filter((card) => card.id !== selectedCard.id);
    updateCards(nextCards);
    setSelectedCardId(nextCards[0]?.id ?? null);
    if (nextCards.length === 0) {
      setCenterMode("board");
    }
  }

  function selectAdjacentShot(direction: "prev" | "next") {
    if (!selectedCard) return;
    const index = cards.findIndex((card) => card.id === selectedCard.id);
    if (index < 0) return;
    const nextIndex = direction === "prev" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    setSelectedCardId(cards[nextIndex].id);
  }

  function handleRegenerate(): void {
    if (!storyboardSource) return;

    // Cancel any in-progress generation
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setLoading(true);
    setError(null);
    setGenerationStatus("analyzing");
    setSheets([]);
    setSheetImageUrls({});
    setSheetGenerationProgress(null);

    void (async () => {
      try {
        const reloadedProject = getProject(projectId);
        const source = reloadedProject?.storyboardSource;
        if (!source) {
          throw new Error("Approve a script first to regenerate from script");
        }

        const ctx = await walrusStorage.getStorageContext();
        const scriptAssets = await listScriptAssetsForProject(
          ctx,
          reloadedProject,
        );
        const sourceAsset = scriptAssets.find(
          (asset) => asset.id === source.scriptId,
        );
        if (!sourceAsset) {
          throw new Error("Approved script source could not be loaded");
        }

        const scriptContent = await loadScriptAssetContent(
          ctx,
          reloadedProject,
          sourceAsset,
          source.version,
        );

        if (!settings.openRouterApiKey.trim()) {
          onOpenSettings?.();
          throw new Error("Add your OpenRouter API key in settings first.");
        }

        const result = await generateStoryboardCardsWithLLM(
          scriptContent,
          settings,
          generationModelId,
          setGenerationStatus,
          controller.signal,
        );

        const generated = renumberStoryboardCards(result.cards.map(withPrompt));
        setCards(generated);
        setSelectedCardId(generated[0]?.id ?? null);

        if (result.usedFallback) {
          showToast(
            "error",
            `LLM generation failed — used basic scene breakdown. ${result.error ?? ""}`.trim(),
          );
        }

        if (generated.length === 0) {
          setGenerationStatus(result.usedFallback ? "fallback" : "done");
          return;
        }

        setGenerationStatus("generating-sheets");

        const designAssets = await loadProjectDesignAssets(ctx, reloadedProject);
        if (designAssets.length === 0) {
          showToast(
            "error",
            "Storyboard shots created, but no design assets were found for sheet images.",
          );
          setGenerationStatus(result.usedFallback ? "fallback" : "done");
          return;
        }

        const sheetEntries = await generateStoryboardContactSheets({
          cards: generated,
          designAssets,
          settings,
          imageModelId: DEFAULT_DESIGN_IMAGE_MODEL,
          imageSize: DEFAULT_IMAGE_GENERATION_SIZE,
          panelAspectRatio: DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
          signal: controller.signal,
          onProgress: (current, total, title) => {
            setSheetGenerationProgress({ current, total, title });
          },
        });

        setSheets(sheetEntries);
        showToast(
          "success",
          `Storyboard generated: ${generated.length} shots, ${sheetEntries.length} contact sheet${sheetEntries.length === 1 ? "" : "s"}${
            result.usedModelId ? ` (${result.usedModelId})` : ""
          }`,
        );
        setGenerationStatus(result.usedFallback ? "fallback" : "done");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setGenerationStatus("idle");
          // Let finally handle setLoading(false)
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to generate storyboard cards",
          );
          setGenerationStatus("error");
        }
      } finally {
        // Always reset loading so the UI never gets stuck in a spinning state.
        setLoading(false);
        setSheetGenerationProgress(null);
        generationAbortRef.current = null;
      }
    })();
  }

  function handleGenerateSceneGraph(): void {
    if (!selectedCard) return;

    sceneGraphAbortRef.current?.abort();
    const controller = new AbortController();
    sceneGraphAbortRef.current = controller;
    setSceneGraphLoadingCardId(selectedCard.id);

    void (async () => {
      try {
        const result = await generateSceneGraphForStoryboardCard(
          selectedCard,
          settings,
          generationModelId,
          controller.signal,
        );
        updateSelectedCard((card) => ({
          ...card,
          sceneGraph: result.sceneGraph,
        }));
        setSceneGraphEditorText(JSON.stringify(result.sceneGraph, null, 2));
        showToast(
          "success",
          `Scene graph generated${result.usedModelId ? ` (${result.usedModelId})` : ""}`,
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        showToast(
          "error",
          err instanceof Error ? err.message : "Failed to generate scene graph",
        );
      } finally {
        setSceneGraphLoadingCardId((current) =>
          current === selectedCard.id ? null : current,
        );
        sceneGraphAbortRef.current = null;
      }
    })();
  }

  function handleGenerateBlocking2D(): void {
    if (!selectedCard) return;

    blocking2dAbortRef.current?.abort();
    const controller = new AbortController();
    blocking2dAbortRef.current = controller;
    setBlocking2dLoadingCardId(selectedCard.id);

    void (async () => {
      try {
        const result = await generateBlocking2DForStoryboardCard(
          selectedCard,
          settings,
          generationModelId,
          controller.signal,
        );
        updateSelectedCard((card) => ({
          ...card,
          blocking2d: result.blocking2d,
        }));
        setBlocking2dEditorText(JSON.stringify(result.blocking2d, null, 2));
        showToast(
          "success",
          `2D blocking generated${result.usedModelId ? ` (${result.usedModelId})` : ""}`,
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        showToast(
          "error",
          err instanceof Error ? err.message : "Failed to generate 2D blocking",
        );
      } finally {
        setBlocking2dLoadingCardId((current) =>
          current === selectedCard.id ? null : current,
        );
        blocking2dAbortRef.current = null;
      }
    })();
  }

  function handleApplyBlocking2DFromEditor(): void {
    if (!selectedCard) return;
    const trimmed = blocking2dEditorText.trim();
    if (!trimmed) {
      updateSelectedCard((card) => ({
        ...card,
        blocking2d: null,
      }));
      showToast("success", "2D blocking cleared");
      return;
    }

    try {
      const parsed = parseStoryboardBlocking2DFromText(trimmed);
      updateSelectedCard((card) => ({
        ...card,
        blocking2d: parsed,
      }));
      showToast("success", "2D blocking updated");
    } catch {
      showToast("error", "Invalid 2D blocking JSON");
    }
  }

  function handleApplySceneGraphFromEditor(): void {
    if (!selectedCard) return;
    const trimmed = sceneGraphEditorText.trim();
    if (!trimmed) {
      updateSelectedCard((card) => ({
        ...card,
        sceneGraph: null,
      }));
      showToast("success", "Scene graph cleared");
      return;
    }

    try {
      const parsed = parseStoryboardSceneGraphFromText(trimmed);
      updateSelectedCard((card) => ({
        ...card,
        sceneGraph: parsed,
      }));
      showToast("success", "Scene graph updated");
    } catch {
      showToast("error", "Invalid scene graph JSON");
    }
  }

  function handleCreateStoryboardAsset() {
    draftCardsRef.current = [];
    draftTitleRef.current = nextStoryboardTitle(assets);
    setSelectedAssetId(null);
    setViewingVersion(null);
    setCards([]);
    setSavedCards([]);
    setSheets([]);
    setSavedSheets([]);
    setSelectedCardId(null);
    setStoryboardTitle(draftTitleRef.current);
    setCenterMode("board");
  }

  function handleSaveStoryboard() {
    const fallbackTitle = storyboardSource
      ? `${storyboardSource.scriptTitle} — Storyboard`
      : nextStoryboardTitle(assets);
    const resolvedTitle =
      storyboardTitle.trim() === "Untitled Storyboard"
        ? fallbackTitle
        : storyboardTitle.trim() || fallbackTitle;
    const storyboardId = selectedAsset?.id ?? crypto.randomUUID();
    const document = buildStoryboardDocument(
      cards,
      storyboardSource
        ? {
            scriptId: storyboardSource.scriptId,
            version: storyboardSource.version,
            blobId: storyboardSource.blobId,
          }
        : null,
      sheets,
    );
    const toastId = showSavingToast(resolvedTitle);

    saveAsset(
      {
        id: storyboardId,
        title: resolvedTitle,
        document,
        useProvidedTitle: true,
      },
      {
        onSuccess: (asset) => {
          draftCardsRef.current = [];
          draftTitleRef.current = "Untitled Storyboard";
          completeSaveToast(toastId, asset.title);
          setSelectedAssetId(asset.id);
          setViewingVersion(null);
          setSavedCards(cards);
          setSavedSheets(sheets);
          setStoryboardTitle(asset.title);
          workspaceSelection.revealAsset("storyboards", asset.id);
        },
        onError: (err) => {
          failSaveToast(toastId, err.message);
        },
      },
    );
  }

  async function handleDownload() {
    if (!canDownload || downloading) return;

    const resolvedTitle =
      storyboardTitle.trim() || selectedAsset?.title || "Storyboard";
    const document = buildStoryboardDocument(
      cards,
      storyboardSource
        ? {
            scriptId: storyboardSource.scriptId,
            version: storyboardSource.version,
            blobId: storyboardSource.blobId,
          }
        : null,
      sheets,
    );

    setDownloading(true);
    try {
      const ctx = await walrusStorage.getStorageContext();
      await downloadStoryboardAsset({
        title: resolvedTitle,
        document,
        sheetImageDataUrls: sheetImageUrls,
        ctx,
      });
      showToast("success", "Download started");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to download storyboard",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {!embedded ? (
        <StoryboardAssetPanel
        assets={assets}
        selectedAssetId={selectedAssetId}
        viewingVersion={viewingVersion}
        loading={assetsLoading}
        hasDraft={selectedAssetId === null && cards.length > 0}
        onSelectAsset={(id) => {
          setActiveStoryboard(projectId, id);
          setSelectedAssetId(id);
          setViewingVersion(null);
          setCenterMode("board");
        }}
        onSelectDraft={() => {
          setSelectedAssetId(null);
          setViewingVersion(null);
          setCenterMode("board");
        }}
        onSelectVersion={setViewingVersion}
        onCreateStoryboard={handleCreateStoryboardAsset}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-viewer">
        <div className="flex h-9 items-center justify-between border-b border-border-subtle bg-bg-panel px-3">
          {centerMode === "detail" && selectedCard ? (
            <button
              type="button"
              onClick={() => setCenterMode("board")}
              className="inline-flex items-center gap-1 rounded-sm px-1 py-1 text-[13px] font-semibold text-foreground transition-colors hover:bg-bg-raised"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to Board
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <Film className="h-3.5 w-3.5 text-text-secondary" />
              <input
                value={storyboardTitle}
                onChange={(event) => setStoryboardTitle(event.target.value)}
                className="w-[280px] max-w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-semibold text-foreground outline-none focus:border-border-focus focus:bg-bg-raised"
              />
              {viewingVersion != null && (
                <span className="rounded-sm bg-bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  Viewing v{viewingVersion}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSaveStoryboard}
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
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving…
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

            <ContentDownloadButton
              disabled={!canDownload}
              downloading={downloading}
              onDownload={() => void handleDownload()}
            />

            <span className="mx-0.5 h-4 w-px bg-border-subtle" aria-hidden="true" />

            {!embedded ? (
              <button
                type="button"
                onClick={handleOpenFilm}
                disabled={!canOpenFilm}
                title={
                  canOpenFilm
                    ? "Open film generation with storyboard and design references"
                    : openFilmDisabledReason
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors",
                  canOpenFilm
                    ? "bg-resolve-accent text-bg-app shadow-sm hover:opacity-90"
                    : "cursor-not-allowed bg-bg-raised text-text-disabled",
                )}
              >
                Film
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <div className="flex items-center gap-1.5">
              {loading && generationStatus !== "idle" && (
                <span className="text-[11px] text-text-secondary">
                  {generationStatus === "analyzing" && "Analyzing script…"}
                  {generationStatus === "generating" && "Generating shots…"}
                  {generationStatus === "parsing" && "Processing output…"}
                  {generationStatus === "generating-sheets" &&
                    (sheetGenerationProgress
                      ? `Rendering sheet ${sheetGenerationProgress.current}/${sheetGenerationProgress.total}: ${sheetGenerationProgress.title}`
                      : "Rendering storyboard contact sheets…")}
                </span>
              )}
              {!loading && generationStatus === "fallback" && (
                <span className="text-[11px] text-yellow-500">
                  Used basic breakdown
                </span>
              )}
              
            </div>
            <div className="flex items-center gap-1 border-l border-border-subtle pl-1.5">
              <button
                type="button"
                onClick={addCard}
                className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Shot
              </button>
              {centerMode === "detail" && selectedCard && (
                <button
                  type="button"
                  onClick={deleteSelectedCard}
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        <section className="min-h-0 flex-1 overflow-auto p-4">
          {(error || assetsError) && (
            <p className="mb-3 rounded border border-destructive-foreground/30 bg-destructive-foreground/10 px-2 py-1 text-[12px] text-destructive-foreground">
              {error ?? assetsError}
            </p>
          )}

          {centerMode === "board" ? (
            cards.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                {loading || contentLoading ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin text-text-secondary" />
                    <p className="font-mono text-[13px] text-text-secondary">
                      {generationStatus === "analyzing" && "Analyzing your script…"}
                      {generationStatus === "generating" && "Generating storyboard shots with AI…"}
                      {generationStatus === "parsing" && "Processing LLM output…"}
                      {generationStatus === "generating-sheets" &&
                        (sheetGenerationProgress
                          ? `Rendering contact sheet ${sheetGenerationProgress.current}/${sheetGenerationProgress.total}…`
                          : "Rendering storyboard contact sheets…")}
                      {(generationStatus === "idle" || generationStatus === "done" || generationStatus === "error" || generationStatus === "fallback") && "Generating storyboard…"}
                    </p>
                    <p className="text-[11px] text-text-disabled">
                      {generationStatus === "generating-sheets"
                        ? "Sheet images use your design references and may take a minute"
                        : "This may take 15–30 seconds for a full script"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-[13px] text-text-disabled">
                      Start by adding your first storyboard shot.
                    </p>
                    <button
                      type="button"
                      onClick={addCard}
                      className="inline-flex items-center gap-1 rounded border border-border-subtle px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-bg-raised"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add first shot
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card, index) => {
                  const selected = card.id === selectedCardId;
                  const sheetPanel = cardSheetPanels.get(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", card.id);
                        setDraggingCardId(card.id);
                      }}
                      onDragEnd={() => setDraggingCardId(null)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = event.dataTransfer.getData("text/plain");
                        const from = cards.findIndex((item) => item.id === sourceId);
                        const to = cards.findIndex((item) => item.id === card.id);
                        if (from < 0 || to < 0 || from === to) return;
                        updateCards(moveItem(cards, from, to));
                        setSelectedCardId(sourceId);
                        setDraggingCardId(null);
                      }}
                      onClick={() => {
                        if (selected) {
                          setCenterMode("detail");
                        } else {
                          setSelectedCardId(card.id);
                        }
                      }}
                      className={cn(
                        "rounded border bg-bg-panel text-left transition-colors",
                        selected
                          ? "border-resolve-accent ring-1 ring-resolve-accent"
                          : "border-border-subtle hover:bg-bg-raised",
                        draggingCardId === card.id && "opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between border-b border-border-subtle px-2 py-1">
                        <span className="text-[11px] font-semibold text-foreground">
                          Shot {index + 1}
                        </span>
                        <GripVertical className="h-3.5 w-3.5 text-text-disabled" />
                      </div>
                      <div
                        className="overflow-hidden bg-black"
                        style={{
                          aspectRatio: aspectRatioToNumber(
                            sheetPanel?.panelAspectRatio ?? "16:9",
                          ),
                        }}
                      >
                        {sheetPanel ? (
                          <StoryboardSheetPanelCrop
                            imageSrc={sheetPanel.imageDataUrl}
                            panelIndex={sheetPanel.panelIndex}
                            panelCount={sheetPanel.panelCount}
                            alt={card.title}
                            className="h-full w-full"
                            panelAspectRatio={sheetPanel.panelAspectRatio}
                          />
                        ) : card.visualSketch.startsWith("http") ? (
                          <img
                            src={card.visualSketch}
                            alt={card.title}
                            className="h-full w-full object-cover"
                          />
                        ) : card.sceneGraph ? (
                          <StoryboardSceneGraphPreview graph={card.sceneGraph} />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-text-disabled">
                            {card.shotDescription || "No visual reference yet"}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 px-2 py-2">
                        <p className="truncate text-[12px] font-medium text-foreground">
                          {card.title}
                        </p>
                        <p className="truncate text-[11px] text-text-secondary">
                          {card.scriptSegment || `Scene ${card.sceneIndex + 1}`}
                        </p>
                        <p className="truncate text-[11px] text-text-secondary">
                          {card.shotType} · {card.cameraMovement || "Static"} ·{" "}
                          {card.estimatedDurationSec}s
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : !selectedCard ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-center font-mono text-[12px] text-text-disabled">
                Select a shot to edit details
              </p>
            </div>
          ) : (
            <div className="min-h-full w-full space-y-4 px-1 py-1 md:px-3 md:py-2">
              <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 border-b border-border-subtle bg-bg-viewer px-1 py-2 md:-mx-3 md:px-3">
                <span className="text-[13px] font-semibold text-foreground">
                  Shot {selectedCard.shotIndex} Details
                </span>
                <button
                  type="button"
                  onClick={() => selectAdjacentShot("prev")}
                  className="rounded border border-border-subtle p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
                  title="Previous shot"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => selectAdjacentShot("next")}
                  className="rounded border border-border-subtle p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
                  title="Next shot"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {selectedCardSheetPanel ? (
                <div
                  className="overflow-hidden rounded border border-border-subtle bg-black"
                  style={{
                    aspectRatio: aspectRatioToNumber(
                      selectedCardSheetPanel.panelAspectRatio,
                    ),
                  }}
                >
                  <StoryboardSheetPanelCrop
                    imageSrc={selectedCardSheetPanel.imageDataUrl}
                    panelIndex={selectedCardSheetPanel.panelIndex}
                    panelCount={selectedCardSheetPanel.panelCount}
                    alt={selectedCard.title}
                    className="h-full w-full"
                    panelAspectRatio={selectedCardSheetPanel.panelAspectRatio}
                  />
                </div>
              ) : null}

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Title
                <input
                  value={selectedCard.title}
                  onChange={(event) =>
                    updateSelectedCard((card) => ({ ...card, title: event.target.value }))
                  }
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Shot Description
                <textarea
                  rows={5}
                  value={selectedCard.shotDescription}
                  onChange={(event) =>
                    updateSelectedCard((card) => ({
                      ...card,
                      shotDescription: event.target.value,
                    }))
                  }
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Script Segment
                <input
                  value={selectedCard.scriptSegment}
                  onChange={(event) =>
                    updateSelectedCard((card) => ({
                      ...card,
                      scriptSegment: event.target.value,
                    }))
                  }
                  placeholder="e.g. Scene 2 opening, post-argument reaction beat"
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Dialogue
                <textarea
                  rows={4}
                  value={selectedCard.dialogue}
                  onChange={(event) =>
                    updateSelectedCard((card) => ({
                      ...card,
                      dialogue: event.target.value,
                    }))
                  }
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  Shot Type
                  <select
                    value={selectedCard.shotType}
                    onChange={(event) =>
                      updateSelectedCard((card) => ({
                        ...card,
                        shotType: event.target.value as StoryboardCard["shotType"],
                      }))
                    }
                    className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                  >
                    {["ECU", "CU", "MCU", "MS", "WS", "EWS"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  Duration
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={selectedCard.estimatedDurationSec}
                    onChange={(event) =>
                      updateSelectedCard((card) => ({
                        ...card,
                        estimatedDurationSec: Math.max(
                          1,
                          Number.parseInt(event.target.value, 10) || 1,
                        ),
                      }))
                    }
                    className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Visual Reference URL
                <input
                  value={selectedCard.visualSketch}
                  onChange={(event) =>
                    updateSelectedCard((card) => ({
                      ...card,
                      visualSketch: event.target.value,
                    }))
                  }
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                />
              </label>

              <div className="space-y-2 rounded border border-border-subtle bg-bg-panel p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    2D Blocking (SVG)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateBlocking2D}
                      disabled={
                        blocking2dLoadingCardId === selectedCard.id ||
                        loading ||
                        contentLoading
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                        blocking2dLoadingCardId === selectedCard.id
                          ? "cursor-wait border-border-subtle text-text-secondary"
                          : "border-border-subtle text-foreground hover:bg-bg-raised",
                      )}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3 w-3",
                          blocking2dLoadingCardId === selectedCard.id && "animate-spin",
                        )}
                      />
                      Generate 2D Shot
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyBlocking2DFromEditor}
                      disabled={blocking2dLoadingCardId === selectedCard.id}
                      className="rounded border border-border-subtle px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply JSON
                    </button>
                  </div>
                </div>

                <div className="aspect-video overflow-hidden rounded border border-border-subtle bg-black">
                  {selectedCard.blocking2d ? (
                    <StoryboardBlocking2DPreview
                      layout={selectedCard.blocking2d}
                      editable
                      onLayoutChange={(nextLayout) => {
                        updateSelectedCard((card) => ({
                          ...card,
                          blocking2d: nextLayout,
                        }));
                        setBlocking2dEditorText(JSON.stringify(nextLayout, null, 2));
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-text-disabled">
                      Generate or paste a 2D blocking JSON to preview this shot.
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  2D Blocking JSON
                  <textarea
                    rows={10}
                    value={blocking2dEditorText}
                    onChange={(event) => setBlocking2dEditorText(event.target.value)}
                    placeholder='{"version":1,"summary":"...","backgroundColor":"#111827","boxes":[...]}'
                    className="font-mono rounded border border-border-subtle bg-bg-app px-2 py-1 text-[11px] text-foreground outline-none focus:border-border-focus"
                  />
                </label>
              </div>

              <div className="space-y-2 rounded border border-border-subtle bg-bg-panel p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    3D Scene Graph Previs
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateSceneGraph}
                      disabled={
                        sceneGraphLoadingCardId === selectedCard.id ||
                        loading ||
                        contentLoading
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                        sceneGraphLoadingCardId === selectedCard.id
                          ? "cursor-wait border-border-subtle text-text-secondary"
                          : "border-border-subtle text-foreground hover:bg-bg-raised",
                      )}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3 w-3",
                          sceneGraphLoadingCardId === selectedCard.id && "animate-spin",
                        )}
                      />
                      Generate Scene Graph
                    </button>
                    <button
                      type="button"
                      onClick={handleApplySceneGraphFromEditor}
                      disabled={sceneGraphLoadingCardId === selectedCard.id}
                      className="rounded border border-border-subtle px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-bg-raised disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply JSON
                    </button>
                  </div>
                </div>

                <div className="aspect-video overflow-hidden rounded border border-border-subtle bg-black">
                  {selectedCard.sceneGraph ? (
                    <StoryboardSceneGraphPreview
                      graph={selectedCard.sceneGraph}
                      editable
                      onGraphChange={(nextGraph) => {
                        updateSelectedCard((card) => ({
                          ...card,
                          sceneGraph: nextGraph,
                        }));
                        setSceneGraphEditorText(JSON.stringify(nextGraph, null, 2));
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-text-disabled">
                      Generate or paste a scene graph JSON to preview this shot.
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  Scene Graph JSON
                  <textarea
                    rows={12}
                    value={sceneGraphEditorText}
                    onChange={(event) => setSceneGraphEditorText(event.target.value)}
                    placeholder='{"version":1,"summary":"...","camera":{...},"lights":[...],"objects":[...]}'
                    className="font-mono rounded border border-border-subtle bg-bg-app px-2 py-1 text-[11px] text-foreground outline-none focus:border-border-focus"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  Sound Effects (SFX)
                  <textarea
                    rows={3}
                    value={selectedCard.sfx}
                    onChange={(event) =>
                      updateSelectedCard((card) => ({
                        ...card,
                        sfx: event.target.value,
                      }))
                    }
                    className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                  Music Cue
                  <textarea
                    rows={3}
                    value={selectedCard.musicCue}
                    onChange={(event) =>
                      updateSelectedCard((card) => ({
                        ...card,
                        musicCue: event.target.value,
                      }))
                    }
                    className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[12px] text-foreground outline-none focus:border-border-focus"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
                Prompt Preview
                <textarea
                  rows={6}
                  readOnly
                  value={selectedCard.generationPrompt}
                  className="rounded border border-border-subtle bg-bg-app px-2 py-1 text-[11px] text-text-secondary outline-none"
                />
              </label>
            </div>
          )}
        </section>
      </div>

      {!embedded ? (
        <InspectorPanel
          scope={{
            mediaMode: "text",
            behaviorMode: "edit",
            skillId: "storyboard",
          } satisfies ConversationScope}
          projectId={projectId}
          onOpenSettings={onOpenSettings}
          onApplyContent={
            selectedCard
              ? (content) =>
                  updateSelectedCard((card) => ({
                    ...card,
                    shotDescription: content,
                  }))
              : undefined
          }
        />
      ) : null}
    </>
  );
}
