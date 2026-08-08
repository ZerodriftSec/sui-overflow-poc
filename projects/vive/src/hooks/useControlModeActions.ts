import { useCallback, useEffect, useRef } from "react";
import type {
  ApplyContentOptions,
  CharacterSheetGenerationRequest,
  FilmVideoGenerationRequest,
  ImageGenerationRequest,
  StoryboardImageGenerationRequest,
  StoryboardPlanGenerationRequest,
} from "../components/workspace/AgentChat";
import { useDesignAssets } from "./useDesignAssets";
import { useControlModeEditorSync } from "./useControlModeEditorSync";
import {
  runControlModePersist,
  useControlModeWalrusSession,
} from "./useControlModeWalrusSession";
import { useFilmAssets } from "./useFilmAssets";
import { useProjectAssets } from "./useProjectAssets";
import { useScriptAssets } from "./useScriptAssets";
import { useStoryboardAssets } from "./useStoryboardAssets";
import { useWalrusStorage } from "./useWalrusStorage";
import { useWorkspaceSelection } from "./useWorkspaceSelection";
import { storagePhaseForFolder, type AssetFolderId } from "../lib/asset-catalog";
import {
  designFolderForKind,
  promptTitleFromText,
  resolveDesignKind,
  singleAssetDocument,
} from "../lib/control-mode-design";
import {
  buildStoryboardDocument,
  nextStoryboardTitle,
  withPrompt,
} from "../lib/control-mode-storyboard";
import {
  createPlaceholderDesignImage,
  generateCharacterSheetImage,
  generateDesignImage,
  generateEnvironmentSheetImage,
  isFallbackDesignImage,
} from "../lib/design-llm";
import { generateFilmVideo } from "../lib/film-llm";
import {
  generateStoryboardContactSheets,
  isStoryboardToVideoSkill,
  loadProjectDesignAssets,
  mergeFilmGenerationRequest,
  prepareStoryboardToVideoGeneration,
  resolveControlModeFilmContext,
  type ControlModeFilmContext,
} from "../lib/film-generation-context";
import { getProject, saveProject, setActiveStoryboard, type StoryboardAsset } from "../lib/project";
import { generateStoryboardCardsWithLLM } from "../lib/storyboard-llm";
import { renumberStoryboardCards } from "../lib/storyboard";
import { useSettings } from "../components/SettingsProvider";
import {
  DEFAULT_STORYBOARD_OPENROUTER_MODEL,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  resolveAgentWorkflowModelId,
} from "../lib/openrouter-models";
import { showToast, showSavingToast, completeSaveToast, failSaveToast } from "../lib/toast";
import { enqueueBackgroundPersist } from "../lib/background-persist-queue";
import { extractScriptTitle } from "../lib/visual-beat-sheet";
import {
  getLatestScriptAssetVersion,
  isScriptAssetPersisted,
  listScriptAssetsForProject,
  loadScriptAssetContent,
  saveDesignAsset,
  saveFilmAsset,
  saveScriptAsset,
  saveStoryboardAsset,
  stagePendingDesignDocument,
  stagePendingScriptContent,
  clearPendingScriptContent,
  type DesignAsset,
  type DesignDocument,
  type FilmDocument,
  type SaveFilmAssetResult,
  type ScriptAsset,
} from "../lib/workspace";

interface UseControlModeActionsOptions {
  projectId: string;
  onOpenSettings?: () => void;
}

export function useControlModeActions({
  projectId,
  onOpenSettings,
}: UseControlModeActionsOptions) {
  const { settings } = useSettings();
  const { selection, revealAsset, selectFolder } = useWorkspaceSelection();
  const {
    setPreviewContent,
    stageScriptAssetPreview,
    stageDesignAssetPreview,
    setIsGeneratingDesignAsset,
    stageFilmAssetPreview,
    setIsGeneratingFilmAsset,
    storyboardCardId,
  } = useControlModeEditorSync();
  const walrusStorage = useWalrusStorage();
  const controlModeWalrusSession = useControlModeWalrusSession();
  const projectAssets = useProjectAssets(projectId);
  const shareCatalog = { autoLoad: false as const };
  const scriptAssets = useScriptAssets(projectId, {
    ...shareCatalog,
    syncedAssets: projectAssets.catalog.scripts,
  });
  const designAssetsHook = useDesignAssets(projectId, {
    ...shareCatalog,
    syncedAssets: projectAssets.catalog.designAssets,
  });
  const storyboardAssets = useStoryboardAssets(projectId, {
    ...shareCatalog,
    syncedAssets: projectAssets.catalog.storyboards,
  });
  const filmAssets = useFilmAssets(projectId, {
    ...shareCatalog,
    syncedAssets: projectAssets.catalog.videos,
  });

  const project = getProject(projectId);
  const storyboardSource = project?.storyboardSource ?? null;
  const mountedRef = useRef(true);
  const stagedScriptRef = useRef<{ assetId: string; title: string } | null>(null);
  const designGenerationCountRef = useRef(0);
  const filmGenerationCountRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const beginDesignGeneration = useCallback(() => {
    designGenerationCountRef.current += 1;
    setIsGeneratingDesignAsset(true);
  }, [setIsGeneratingDesignAsset]);

  const endDesignGeneration = useCallback(() => {
    designGenerationCountRef.current = Math.max(
      0,
      designGenerationCountRef.current - 1,
    );
    if (designGenerationCountRef.current === 0) {
      setIsGeneratingDesignAsset(false);
    }
  }, [setIsGeneratingDesignAsset]);

  const beginFilmGeneration = useCallback(() => {
    filmGenerationCountRef.current += 1;
    setIsGeneratingFilmAsset(true);
  }, [setIsGeneratingFilmAsset]);

  const endFilmGeneration = useCallback(() => {
    filmGenerationCountRef.current = Math.max(0, filmGenerationCountRef.current - 1);
    if (filmGenerationCountRef.current === 0) {
      setIsGeneratingFilmAsset(false);
    }
  }, [setIsGeneratingFilmAsset]);

  const queueBackgroundPersist = useCallback(
    <T,>(input: {
      title: string;
      operation: () => Promise<T>;
      onSuccess?: (value: T) => void;
      onError?: (error: Error) => void;
      fallbackErrorMessage: string;
    }): void => {
      const toastId = showSavingToast(input.title);
      void enqueueBackgroundPersist(input.operation)
        .then((result) => {
          completeSaveToast(toastId, input.title);
          walrusStorage.refreshProjectAssets();
          input.onSuccess?.(result);
        })
        .catch((error) => {
          const resolved =
            error instanceof Error ? error : new Error(input.fallbackErrorMessage);
          failSaveToast(toastId, resolved.message);
          input.onError?.(resolved);
        });
    },
    [walrusStorage],
  );

  const persistGeneratedScript = useCallback(
    async (
      input: {
        id: string;
        title: string;
        content: string;
        prompt?: string;
        generationModelId?: string;
        useProvidedTitle?: boolean;
      },
      options?: {
        skipHookRefresh?: boolean;
        knownScriptAssets?: ScriptAsset[];
      },
    ) => {
      return runControlModePersist(controlModeWalrusSession, async (ctx) => {
        const activeProject = getProject(projectId);
        if (!activeProject) {
          throw new Error("Project not found");
        }

        return saveScriptAsset(ctx, activeProject, {
          ...input,
          knownScriptAssets: options?.knownScriptAssets ?? scriptAssets.assets,
        });
      }).then(({ asset, manifestBlobId }) => {
        const activeProject = getProject(projectId);
        if (activeProject) {
          saveProject({
            ...activeProject,
            manifestBlobId,
            updatedAt: new Date().toISOString(),
          });
        }

        if (!options?.skipHookRefresh && !controlModeWalrusSession.isSessionActive()) {
          scriptAssets.refresh();
        }
        return asset;
      });
    },
    [controlModeWalrusSession, projectId, scriptAssets],
  );

  const saveDesign = useCallback(
    (input: {
      id: string;
      title: string;
      kind: DesignAsset["kind"];
      primaryFileType?: "text" | "image";
      document: DesignDocument;
    }) =>
      new Promise<DesignAsset>((resolve, reject) => {
        designAssetsHook.saveAsset(input, {
          onSuccess: (asset) => resolve(asset),
          onError: (err) => reject(err),
        });
      }),
    [designAssetsHook],
  );

  const stageGeneratedDesignAsset = useCallback(
    (input: {
      assetId: string;
      title: string;
      kind: DesignAsset["kind"];
      document: DesignDocument;
      folderId: AssetFolderId;
    }) => {
      stagePendingDesignDocument(input.assetId, input.document);
      stageDesignAssetPreview(input.assetId, input.document);
      revealAsset(input.folderId, input.assetId);
      walrusStorage.upsertOptimisticProjectAsset({
        id: input.assetId,
        title: input.title,
        folderId: input.folderId,
        storagePhase: "design",
        assetKind: input.kind,
        fileType: "image",
        createdAt: input.document.updatedAt ?? new Date().toISOString(),
        updatedAt: input.document.updatedAt ?? new Date().toISOString(),
        status: "saving",
      });
    },
    [
      revealAsset,
      stageDesignAssetPreview,
      walrusStorage,
    ],
  );

  const resolveEditingPersistedScript = useCallback((): ScriptAsset | null => {
    const { behaviorMode } = selection.chatScope;
    if (behaviorMode !== "edit" || !selection.assetId) {
      return null;
    }

    const asset =
      scriptAssets.assets.find((item) => item.id === selection.assetId) ??
      projectAssets.getScriptAsset(selection.assetId);
    if (!asset || !isScriptAssetPersisted(asset)) {
      return null;
    }
    return asset;
  }, [
    projectAssets,
    scriptAssets.assets,
    selection.assetId,
    selection.chatScope,
  ]);

  const stageGeneratedScriptAsset = useCallback(
    (input: {
      assetId: string;
      title: string;
      content: string;
      prompt?: string;
      generationModelId?: string;
    }) => {
      stagePendingScriptContent(input.assetId, input.content);
      stageScriptAssetPreview(
        input.assetId,
        input.title,
        input.content,
        input.prompt,
        input.generationModelId,
      );
      revealAsset("scripts", input.assetId);
      walrusStorage.upsertOptimisticProjectAsset({
        id: input.assetId,
        title: input.title,
        folderId: "scripts",
        storagePhase: "script",
        assetKind: "script",
        fileType: "text",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saving",
      });
    },
    [revealAsset, stageScriptAssetPreview, walrusStorage],
  );

  const persistGeneratedDesignAsset = useCallback(
    async (
      input: {
        id: string;
        title: string;
        kind: DesignAsset["kind"];
        primaryFileType?: "text" | "image";
        document: DesignDocument;
      },
      options?: {
        skipHookRefresh?: boolean;
        knownDesignAssets?: DesignAsset[];
      },
    ) => {
      return runControlModePersist(controlModeWalrusSession, async (ctx) => {
        const activeProject = getProject(projectId);
        if (!activeProject) {
          throw new Error("Project not found");
        }

        return saveDesignAsset(ctx, activeProject, {
          ...input,
          knownDesignAssets: options?.knownDesignAssets ?? designAssetsHook.assets,
        });
      }).then(({ asset, manifestBlobId }) => {
        const activeProject = getProject(projectId);
        if (activeProject) {
          saveProject({
            ...activeProject,
            manifestBlobId,
            updatedAt: new Date().toISOString(),
          });
        }

        // Keep the in-memory document (with dataBase64) resolvable for viewing
        // after save — DesignPhaseView may remount/reselect before imageBlobId
        // fetch finishes. Matches useDesignAssets caching the pre-upload doc.
        stagePendingDesignDocument(input.id, input.document);

        if (!options?.skipHookRefresh && !controlModeWalrusSession.isSessionActive()) {
          designAssetsHook.refresh();
        }
        return asset;
      });
    },
    [controlModeWalrusSession, designAssetsHook, projectId],
  );

  const persistGeneratedStoryboard = useCallback(
    async (
      input: {
        id: string;
        title: string;
        document: Parameters<typeof storyboardAssets.saveAsset>[0]["document"];
        useProvidedTitle?: boolean;
      },
      options?: {
        skipHookRefresh?: boolean;
        knownStoryboardAssets?: StoryboardAsset[];
      },
    ) => {
      return runControlModePersist(controlModeWalrusSession, async (ctx) => {
        const activeProject = getProject(projectId);
        if (!activeProject) {
          throw new Error("Project not found");
        }

        return saveStoryboardAsset(ctx, activeProject, {
          ...input,
          knownStoryboardAssets:
            options?.knownStoryboardAssets ?? storyboardAssets.assets,
        });
      }).then(({ asset, manifestBlobId }) => {
        const activeProject = getProject(projectId);
        if (activeProject) {
          saveProject({
            ...activeProject,
            manifestBlobId,
            updatedAt: new Date().toISOString(),
          });
        }
        setActiveStoryboard(projectId, asset.id);

        if (!options?.skipHookRefresh && !controlModeWalrusSession.isSessionActive()) {
          storyboardAssets.refresh();
        }
        return asset;
      });
    },
    [controlModeWalrusSession, projectId, storyboardAssets],
  );

  const persistGeneratedFilmAsset = useCallback(
    async (
      input: Parameters<typeof filmAssets.saveAsset>[0],
      options?: {
        skipHookRefresh?: boolean;
      },
    ): Promise<SaveFilmAssetResult> => {
      return runControlModePersist(controlModeWalrusSession, async (ctx) => {
        const activeProject = getProject(projectId);
        if (!activeProject) {
          throw new Error("Project not found");
        }

        return saveFilmAsset(ctx, activeProject, {
          ...input,
          knownFilmAssets: filmAssets.assets,
        });
      }).then((saved) => {
        const activeProject = getProject(projectId);
        if (activeProject) {
          saveProject({
            ...activeProject,
            manifestBlobId: saved.manifestBlobId,
            updatedAt: new Date().toISOString(),
          });
        }

        if (!options?.skipHookRefresh && !controlModeWalrusSession.isSessionActive()) {
          filmAssets.refresh();
        }
        return saved;
      });
    },
    [controlModeWalrusSession, filmAssets, projectId],
  );

  const applyScriptContent = useCallback(
    async (content: string, options?: ApplyContentOptions) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const generationPrompt = options?.generationPrompt?.trim();
      const generationModelId = options?.generationModelId?.trim();
      const editingAsset = resolveEditingPersistedScript();
      const knownScriptAssets = scriptAssets.assets;

      if (editingAsset) {
        stagePendingScriptContent(editingAsset.id, trimmed);
        walrusStorage.upsertOptimisticProjectAsset({
          id: editingAsset.id,
          title: editingAsset.title,
          folderId: "scripts",
          storagePhase: "script",
          assetKind: "script",
          fileType: "text",
          createdAt: editingAsset.updatedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "saving",
        });
        queueBackgroundPersist({
          title: editingAsset.title,
          fallbackErrorMessage: "Failed to save script",
          operation: () =>
            persistGeneratedScript(
              {
                id: editingAsset.id,
                title: editingAsset.title,
                content: trimmed,
                ...(generationPrompt ? { prompt: generationPrompt } : {}),
                ...(generationModelId
                  ? { generationModelId }
                  : {}),
                useProvidedTitle: true,
              },
              {
                skipHookRefresh: !mountedRef.current,
                knownScriptAssets,
              },
            ),
          onSuccess: (saved) => {
            clearPendingScriptContent(editingAsset.id);
            if (mountedRef.current) {
              revealAsset("scripts", saved.id);
            }
          },
          onError: () => {
            clearPendingScriptContent(editingAsset.id);
            walrusStorage.removeOptimisticProjectAsset(editingAsset.id);
          },
        });
        return;
      }

      const staged = stagedScriptRef.current;
      const draftId = staged?.assetId ?? scriptAssets.createDraft().id;
      const title = extractScriptTitle("", trimmed) || staged?.title || "Untitled Script";
      stagedScriptRef.current = { assetId: draftId, title };

      stageGeneratedScriptAsset({
        assetId: draftId,
        title,
        content: trimmed,
        prompt: generationPrompt,
        generationModelId,
      });

      queueBackgroundPersist({
        title,
        fallbackErrorMessage: "Failed to save script",
        operation: () =>
          persistGeneratedScript(
            {
              id: draftId,
              title,
              content: trimmed,
              ...(generationPrompt ? { prompt: generationPrompt } : {}),
              ...(generationModelId ? { generationModelId } : {}),
              useProvidedTitle: true,
            },
            {
              skipHookRefresh: !mountedRef.current,
              knownScriptAssets,
            },
          ),
        onSuccess: (saved) => {
          clearPendingScriptContent(draftId);
          stagedScriptRef.current = null;
          if (mountedRef.current) {
            revealAsset("scripts", saved.id);
          }
        },
        onError: () => {
          clearPendingScriptContent(draftId);
          stagedScriptRef.current = null;
          walrusStorage.removeOptimisticProjectAsset(draftId);
        },
      });
    },
    [
      persistGeneratedScript,
      queueBackgroundPersist,
      resolveEditingPersistedScript,
      revealAsset,
      scriptAssets,
      stageGeneratedScriptAsset,
      walrusStorage,
    ],
  );

  const applyDesignPrompt = useCallback(
    async (content: string) => {
      const prompt = content.trim();
      if (!prompt) return;

      const { skillId, behaviorMode } = selection.chatScope;
      const shouldCreateNewFromSkill =
        behaviorMode === "draft" &&
        (skillId === "character" || skillId === "environment");

      const skillKind: DesignAsset["kind"] =
        skillId === "environment" ? "environment" : "character";
      const kind = shouldCreateNewFromSkill
        ? skillKind
        : resolveDesignKind({
            folderId: selection.folderId,
            skillId,
          });

      const assetId = selection.assetId;
      const existingAsset =
        assetId != null && !shouldCreateNewFromSkill
          ? designAssetsHook.assets.find((item) => item.id === assetId) ?? null
          : null;

      if (existingAsset) {
        const document = await designAssetsHook.loadDocument(existingAsset);
        const updatedDocument = {
          ...document,
          updatedAt: new Date().toISOString(),
          assets: document.assets.map((item, index) =>
            index === 0 ? { ...item, prompt } : item,
          ),
        };
        const saved = await saveDesign({
          id: existingAsset.id,
          title: existingAsset.title,
          kind: existingAsset.kind,
          primaryFileType: existingAsset.primaryFileType,
          document: updatedDocument,
        });
        revealAsset(designFolderForKind(saved.kind), saved.id);
        return;
      }

      const newAssetId = crypto.randomUUID();
      const itemId = crypto.randomUUID();
      const title = promptTitleFromText(prompt, kind);
      const document = singleAssetDocument(storyboardSource, "", {
        id: itemId,
        title,
        kind,
        description: "",
        prompt,
        image: createPlaceholderDesignImage(title, prompt.slice(0, 100)),
      });

      const saved = await saveDesign({
        id: newAssetId,
        title,
        kind,
        primaryFileType: "text",
        document,
      });
      revealAsset(designFolderForKind(saved.kind), saved.id);
    },
    [
      designAssetsHook,
      revealAsset,
      saveDesign,
      selection.assetId,
      selection.chatScope,
      selection.folderId,
      storyboardSource,
    ],
  );

  const applyStoryboardShotContent = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || !selection.assetId || !storyboardCardId) return;

      const asset =
        storyboardAssets.assets.find((item) => item.id === selection.assetId) ??
        null;
      if (!asset) return;

      const document = await storyboardAssets.loadDocument(asset);
      const nextCards = document.cards.map((card) =>
        card.id === storyboardCardId
          ? withPrompt({ ...card, shotDescription: trimmed })
          : card,
      );
      const source =
        document.sourceScriptId &&
        document.sourceScriptVersion != null &&
        document.sourceScriptBlobId
          ? {
              scriptId: document.sourceScriptId,
              version: document.sourceScriptVersion,
              blobId: document.sourceScriptBlobId,
            }
          : null;

      const nextDocument = buildStoryboardDocument(
        nextCards,
        source,
        document.sheets ?? [],
      );

      walrusStorage.upsertOptimisticProjectAsset({
        id: asset.id,
        title: asset.title,
        folderId: "storyboards",
        storagePhase: "storyboard",
        assetKind: "storyboard",
        fileType: "text",
        createdAt: asset.updatedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saving",
      });
      const knownStoryboardAssets = storyboardAssets.assets;
      queueBackgroundPersist({
        title: asset.title,
        fallbackErrorMessage: "Failed to save storyboard",
        operation: () =>
          persistGeneratedStoryboard(
            {
              id: asset.id,
              title: asset.title,
              document: nextDocument,
              useProvidedTitle: true,
            },
            {
              skipHookRefresh: !mountedRef.current,
              knownStoryboardAssets,
            },
          ),
        onSuccess: (saved) => {
          if (mountedRef.current) {
            revealAsset("storyboards", saved.id);
          }
        },
        onError: () => {
          walrusStorage.removeOptimisticProjectAsset(asset.id);
        },
      });
    },
    [
      persistGeneratedStoryboard,
      queueBackgroundPersist,
      revealAsset,
      selection.assetId,
      storyboardAssets,
      storyboardCardId,
      walrusStorage,
    ],
  );

  const applyContent = useCallback(
    async (content: string, options?: ApplyContentOptions) => {
      const { skillId, mediaMode } = selection.chatScope;
      let route: "storyboard" | "design" | "script" = "script";
      if (skillId === "script") {
        route = "script";
      } else if (skillId === "storyboard" || selection.folderId === "storyboards") {
        route = "storyboard";
      } else if (
        skillId === "character" ||
        skillId === "environment" ||
        skillId === "character-sheet" ||
        skillId === "environment-sheet" ||
        mediaMode === "image" ||
        storagePhaseForFolder(selection.folderId ?? "scripts") === "design"
      ) {
        route = "design";
      }
      if (route === "storyboard") {
        await applyStoryboardShotContent(content);
        return;
      }
      if (route === "design") {
        await applyDesignPrompt(content);
        return;
      }
      await applyScriptContent(content, options);
    },
    [
      applyDesignPrompt,
      applyScriptContent,
      applyStoryboardShotContent,
      selection.chatScope,
      selection.folderId,
    ],
  );

  const previewContent = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      if (resolveEditingPersistedScript()) {
        setPreviewContent(content);
        return;
      }

      if (!stagedScriptRef.current) {
        const draft = scriptAssets.createDraft();
        stagedScriptRef.current = { assetId: draft.id, title: draft.title };
      }

      const title =
        extractScriptTitle("", trimmed) || stagedScriptRef.current.title;
      stagedScriptRef.current.title = title;
      stageGeneratedScriptAsset({
        assetId: stagedScriptRef.current.assetId,
        title,
        content: trimmed,
      });
    },
    [
      resolveEditingPersistedScript,
      scriptAssets,
      setPreviewContent,
      stageGeneratedScriptAsset,
    ],
  );

  const generateCharacterSheet = useCallback(
    async (request: CharacterSheetGenerationRequest): Promise<string> => {
      if (!settings.openRouterApiKey.trim()) {
        throw new Error("Add your OpenRouter API key in settings first.");
      }

      const kind = request.kind;
      const folderId = designFolderForKind(kind);

      // Navigate to the design folder and show skeleton immediately.
      selectFolder(folderId);
      beginDesignGeneration();

      let stagedAssetId: string | null = null;
      try {
        let designPrompt = request.prompt.trim();
        let styleBrief = "";

        if (!designPrompt && selection.assetId) {
          const asset = designAssetsHook.assets.find(
            (item) => item.id === selection.assetId,
          );
          if (asset) {
            const document = await designAssetsHook.loadDocument(asset);
            styleBrief = document.styleBrief ?? "";
            designPrompt = document.assets[0]?.prompt.trim() ?? "";
          }
        }

        if (!designPrompt) {
          throw new Error(
            kind === "environment"
              ? "Enter an environment prompt or select an asset with a saved prompt."
              : "Enter a character prompt or select an asset with a saved prompt.",
          );
        }

        const title = promptTitleFromText(designPrompt, kind);
        const assetId = crypto.randomUUID();
        stagedAssetId = assetId;
        const generatingAt = new Date().toISOString();
        // Show the sidebar row immediately — mirrors the video generation
        // flow instead of waiting for the (slow) image call to finish.
        revealAsset(folderId, assetId);
        walrusStorage.upsertOptimisticProjectAsset({
          id: assetId,
          title,
          folderId,
          storagePhase: "design",
          assetKind: kind,
          fileType: "image",
          createdAt: generatingAt,
          updatedAt: generatingAt,
          status: "saving",
        });

        const { imagePrompt, image } =
          kind === "environment"
            ? await generateEnvironmentSheetImage({
                environmentPrompt: designPrompt,
                styleBrief,
                imageModelId: request.imageModelId,
                imageResolution: request.imageResolution,
                apiKey: settings.openRouterApiKey,
              })
            : await generateCharacterSheetImage({
                characterPrompt: designPrompt,
                styleBrief,
                imageModelId: request.imageModelId,
                imageResolution: request.imageResolution,
                apiKey: settings.openRouterApiKey,
              });

        if (isFallbackDesignImage(image)) {
          throw new Error(
            "Image model returned no image. Try a different image model.",
          );
        }

        const itemId = crypto.randomUUID();
        const document = singleAssetDocument(storyboardSource, styleBrief, {
          id: itemId,
          title,
          kind,
          description: "",
          prompt: imagePrompt,
          generationModelId: request.imageModelId,
          image,
        });
        const knownDesignAssets = designAssetsHook.assets;
        // Show the result immediately, then persist once when generation is done.
        stageGeneratedDesignAsset({ assetId, title, kind, document, folderId });
        queueBackgroundPersist({
          title,
          fallbackErrorMessage: "Failed to save generated design",
          operation: () =>
            persistGeneratedDesignAsset(
              {
                id: assetId,
                title,
                kind,
                primaryFileType: "image",
                document,
              },
              {
                skipHookRefresh: !mountedRef.current,
                knownDesignAssets,
              },
            ),
          onSuccess: (asset) => {
            if (mountedRef.current) {
              revealAsset(designFolderForKind(asset.kind), asset.id);
            }
          },
          onError: () => {
            walrusStorage.removeOptimisticProjectAsset(assetId);
          },
        });
        return `Generated ${kind === "environment" ? "environment sheet" : "character sheet"} for "${title}". Saving to Walrus in background.`;
      } catch (err) {
        if (stagedAssetId) {
          walrusStorage.removeOptimisticProjectAsset(stagedAssetId);
        }
        throw err;
      } finally {
        endDesignGeneration();
      }
    },
    [
      beginDesignGeneration,
      designAssetsHook,
      endDesignGeneration,
      persistGeneratedDesignAsset,
      queueBackgroundPersist,
      revealAsset,
      selectFolder,
      selection.assetId,
      settings,
      stageGeneratedDesignAsset,
      storyboardSource,
      walrusStorage,
    ],
  );

  const generateImage = useCallback(
    async (request: ImageGenerationRequest): Promise<string> => {
      if (!settings.openRouterApiKey.trim()) {
        throw new Error("Add your OpenRouter API key in settings first.");
      }

      const kind = resolveDesignKind({
        folderId: selection.folderId,
        skillId: selection.chatScope.skillId,
        assetKind: selection.assetId
          ? designAssetsHook.assets.find((item) => item.id === selection.assetId)
              ?.kind
          : undefined,
      });
      const folderId = designFolderForKind(kind);

      // Navigate to the design folder and show skeleton immediately.
      selectFolder(folderId);
      beginDesignGeneration();

      let stagedAssetId: string | null = null;
      try {
        let designPrompt = request.prompt.trim();
        let styleBrief = "";

        if (!designPrompt && selection.assetId) {
          const asset = designAssetsHook.assets.find(
            (item) => item.id === selection.assetId,
          );
          if (asset) {
            const document = await designAssetsHook.loadDocument(asset);
            styleBrief = document.styleBrief ?? "";
            designPrompt = document.assets[0]?.prompt.trim() ?? "";
          }
        }

        if (!designPrompt) {
          throw new Error(
            "Enter an image prompt or select an asset with a saved prompt.",
          );
        }

        const title = promptTitleFromText(designPrompt, kind);
        const assetId = crypto.randomUUID();
        stagedAssetId = assetId;
        const generatingAt = new Date().toISOString();
        // Show the sidebar row immediately — mirrors the video generation
        // flow instead of waiting for the (slow) image call to finish.
        revealAsset(folderId, assetId);
        walrusStorage.upsertOptimisticProjectAsset({
          id: assetId,
          title,
          folderId,
          storagePhase: "design",
          assetKind: kind,
          fileType: "image",
          createdAt: generatingAt,
          updatedAt: generatingAt,
          status: "saving",
        });

        const { imagePrompt, image } = await generateDesignImage({
          prompt: designPrompt,
          styleBrief,
          imageModelId: request.imageModelId,
          imageResolution: request.imageResolution,
          aspectRatio: request.aspectRatio,
          kind,
          apiKey: settings.openRouterApiKey,
        });

        if (isFallbackDesignImage(image)) {
          throw new Error(
            "Image model returned no image. Try a different image model.",
          );
        }

        const itemId = crypto.randomUUID();
        const document = singleAssetDocument(storyboardSource, styleBrief, {
          id: itemId,
          title,
          kind,
          description: "",
          prompt: imagePrompt,
          generationModelId: request.imageModelId,
          image,
        });
        const knownDesignAssets = designAssetsHook.assets;
        // Show the result immediately, then persist once when generation is done.
        stageGeneratedDesignAsset({ assetId, title, kind, document, folderId });
        queueBackgroundPersist({
          title,
          fallbackErrorMessage: "Failed to save generated image",
          operation: () =>
            persistGeneratedDesignAsset(
              {
                id: assetId,
                title,
                kind,
                primaryFileType: "image",
                document,
              },
              {
                skipHookRefresh: !mountedRef.current,
                knownDesignAssets,
              },
            ),
          onSuccess: (asset) => {
            if (mountedRef.current) {
              revealAsset(designFolderForKind(asset.kind), asset.id);
            }
          },
          onError: () => {
            walrusStorage.removeOptimisticProjectAsset(assetId);
          },
        });
        return `Generated image for "${title}". Saving to Walrus in background.`;
      } catch (err) {
        if (stagedAssetId) {
          walrusStorage.removeOptimisticProjectAsset(stagedAssetId);
        }
        throw err;
      } finally {
        endDesignGeneration();
      }
    },
    [
      beginDesignGeneration,
      designAssetsHook,
      endDesignGeneration,
      persistGeneratedDesignAsset,
      queueBackgroundPersist,
      revealAsset,
      selectFolder,
      selection.assetId,
      selection.chatScope.skillId,
      selection.folderId,
      settings,
      stageGeneratedDesignAsset,
      storyboardSource,
      walrusStorage,
    ],
  );

  const generateStoryboardPlan = useCallback(
    async (request: StoryboardPlanGenerationRequest): Promise<string> => {
      if (!settings.openRouterApiKey.trim()) {
        onOpenSettings?.();
        throw new Error("Add your OpenRouter API key in settings first.");
      }

      const reloadedProject = getProject(projectId);
      if (!reloadedProject) {
        throw new Error("Project not found.");
      }

      const ctx = await walrusStorage.getStorageContext();
      let scriptContent = request.scriptContent?.trim() ?? "";
      let source: {
        scriptId: string;
        version: number;
        blobId: string;
      } | null = null;
      let titleBase = "Storyboard";

      if (request.scriptAssetId) {
        const scriptAssetsList = await listScriptAssetsForProject(
          ctx,
          reloadedProject,
        );
        const sourceAsset = scriptAssetsList.find(
          (asset) => asset.id === request.scriptAssetId,
        );
        if (sourceAsset) {
          if (!scriptContent) {
            scriptContent = await loadScriptAssetContent(
              ctx,
              reloadedProject,
              sourceAsset,
            );
          }
          const latestVersion = getLatestScriptAssetVersion(sourceAsset);
          if (latestVersion?.blobId) {
            source = {
              scriptId: sourceAsset.id,
              version: latestVersion.version,
              blobId: latestVersion.blobId,
            };
          }
          titleBase = sourceAsset.title;
        }
      }

      if (!scriptContent) {
        const approved = reloadedProject.storyboardSource;
        if (!approved) {
          throw new Error(
            "Attach a script or approve one in the Script phase before planning storyboard shots.",
          );
        }

        const scriptAssetsList = await listScriptAssetsForProject(
          ctx,
          reloadedProject,
        );
        const sourceAsset = scriptAssetsList.find(
          (asset) => asset.id === approved.scriptId,
        );
        if (!sourceAsset) {
          throw new Error("Approved script source could not be loaded.");
        }

        scriptContent = await loadScriptAssetContent(
          ctx,
          reloadedProject,
          sourceAsset,
          approved.version,
        );
        source = {
          scriptId: approved.scriptId,
          version: approved.version,
          blobId: approved.blobId,
        };
        titleBase = approved.scriptTitle;
      } else if (!source && reloadedProject.storyboardSource) {
        const approved = reloadedProject.storyboardSource;
        source = {
          scriptId: approved.scriptId,
          version: approved.version,
          blobId: approved.blobId,
        };
      }

      if (request.userInstructions?.trim()) {
        scriptContent = `${scriptContent}\n\nAdditional planning instructions:\n${request.userInstructions.trim()}`;
      }

      const controller = new AbortController();
      const planningModelId = resolveAgentWorkflowModelId(
        request.modelId.trim() || DEFAULT_STORYBOARD_OPENROUTER_MODEL,
        DEFAULT_STORYBOARD_OPENROUTER_MODEL,
      );
      const result = await generateStoryboardCardsWithLLM(
        scriptContent,
        settings,
        planningModelId,
        () => {},
        controller.signal,
      );

      const generated = renumberStoryboardCards(result.cards.map(withPrompt));
      if (generated.length === 0) {
        throw new Error("Storyboard planning returned no shots.");
      }

      if (result.usedFallback) {
        showToast(
          "error",
          `LLM generation failed — used basic scene breakdown. ${result.error ?? ""}`.trim(),
        );
      }

      const resolvedTitle =
        titleBase !== "Storyboard"
          ? `${titleBase} — Storyboard`
          : nextStoryboardTitle(storyboardAssets.assets);
      const storyboardId = crypto.randomUUID();
      const document = buildStoryboardDocument(generated, source, []);
      const knownStoryboardAssets = storyboardAssets.assets;
      walrusStorage.upsertOptimisticProjectAsset({
        id: storyboardId,
        title: resolvedTitle,
        folderId: "storyboards",
        storagePhase: "storyboard",
        assetKind: "storyboard",
        fileType: "text",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saving",
      });
      if (mountedRef.current) {
        revealAsset("storyboards", storyboardId);
      }
      queueBackgroundPersist({
        title: resolvedTitle,
        fallbackErrorMessage: "Failed to save storyboard",
        operation: () =>
          persistGeneratedStoryboard(
            {
              id: storyboardId,
              title: resolvedTitle,
              document,
              useProvidedTitle: true,
            },
            {
              skipHookRefresh: !mountedRef.current,
              knownStoryboardAssets,
            },
          ),
        onSuccess: (saved) => {
          if (mountedRef.current) {
            revealAsset("storyboards", saved.id);
          }
        },
        onError: () => {
          walrusStorage.removeOptimisticProjectAsset(storyboardId);
        },
      });
      return `Planned storyboard "${resolvedTitle}" with ${generated.length} shot${generated.length === 1 ? "" : "s"}. Saving to Walrus in background.`;
    },
    [
      onOpenSettings,
      persistGeneratedStoryboard,
      projectId,
      queueBackgroundPersist,
      revealAsset,
      settings,
      storyboardAssets.assets,
      walrusStorage,
    ],
  );

  const generateStoryboardImage = useCallback(
    async (request: StoryboardImageGenerationRequest): Promise<string> => {
      if (!settings.openRouterApiKey.trim()) {
        onOpenSettings?.();
        throw new Error("Add your OpenRouter API key in settings first.");
      }

      const asset =
        storyboardAssets.assets.find(
          (item) => item.id === request.storyboardAssetId,
        ) ?? null;
      if (!asset) {
        throw new Error("Attached storyboard could not be found.");
      }

      const document = await storyboardAssets.loadDocument(asset);
      const currentCards = document.cards.map(withPrompt);
      if (currentCards.length === 0) {
        throw new Error("Add storyboard shots before generating contact sheet images.");
      }

      const reloadedProject = getProject(projectId);
      if (!reloadedProject) {
        throw new Error("Project not found.");
      }

      const ctx = await walrusStorage.getStorageContext();
      const designAssets = await loadProjectDesignAssets(ctx, reloadedProject);
      if (designAssets.length === 0) {
        throw new Error(
          "No design assets were found. Create character and environment sheets first.",
        );
      }

      const sheetEntries = await generateStoryboardContactSheets({
        cards: currentCards,
        designAssets,
        settings,
        imageModelId: request.imageModelId,
        imageSize: request.imageResolution,
        panelAspectRatio: DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
        onProgress: () => {},
      });

      const failedSheets = sheetEntries.filter(
        (sheet) => sheet.image.mimeType === "image/svg+xml",
      );
      if (failedSheets.length > 0) {
        throw new Error(
          failedSheets.length === sheetEntries.length
            ? "Storyboard image generation failed. Try a different image model or check your OpenRouter API key."
            : `Storyboard image generation failed for ${failedSheets.length} of ${sheetEntries.length} contact sheets. Try a different image model.`,
        );
      }

      const source =
        document.sourceScriptId &&
        document.sourceScriptVersion != null &&
        document.sourceScriptBlobId
          ? {
              scriptId: document.sourceScriptId,
              version: document.sourceScriptVersion,
              blobId: document.sourceScriptBlobId,
            }
          : null;

      const nextDocument = buildStoryboardDocument(currentCards, source, sheetEntries);
      const knownStoryboardAssets = storyboardAssets.assets;
      walrusStorage.upsertOptimisticProjectAsset({
        id: asset.id,
        title: asset.title,
        folderId: "storyboards",
        storagePhase: "storyboard",
        assetKind: "storyboard",
        fileType: "text",
        createdAt: asset.updatedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saving",
      });
      if (mountedRef.current) {
        revealAsset("storyboards", asset.id);
      }
      queueBackgroundPersist({
        title: asset.title,
        fallbackErrorMessage: "Failed to save storyboard images",
        operation: () =>
          persistGeneratedStoryboard(
            {
              id: asset.id,
              title: asset.title,
              document: nextDocument,
              useProvidedTitle: true,
            },
            {
              skipHookRefresh: !mountedRef.current,
              knownStoryboardAssets,
            },
          ),
        onSuccess: (saved) => {
          if (mountedRef.current) {
            revealAsset("storyboards", saved.id);
          }
        },
        onError: () => {
          walrusStorage.removeOptimisticProjectAsset(asset.id);
        },
      });
      return `Generated ${sheetEntries.length} storyboard contact sheet${sheetEntries.length === 1 ? "" : "s"} (${sheetEntries.reduce((sum, sheet) => sum + sheet.panelCount, 0)} panels total). Saving to Walrus in background.`;
    },
    [
      onOpenSettings,
      persistGeneratedStoryboard,
      projectId,
      queueBackgroundPersist,
      revealAsset,
      settings,
      storyboardAssets,
      walrusStorage,
    ],
  );

  const generateVideo = useCallback(
    async (request: FilmVideoGenerationRequest): Promise<string> => {
      const activeProject = getProject(projectId);
      if (!activeProject?.walrusPathPrefix) {
        throw new Error("Project is missing Walrus storage");
      }

      selectFolder("videos");
      beginFilmGeneration();

      const draft = filmAssets.createDraft();

      let filmContext: ControlModeFilmContext | null = null;
      if (request.storyboardAssetId) {
        const ctx = await walrusStorage.getStorageContext();
        filmContext = await resolveControlModeFilmContext({
          ctx,
          project: activeProject,
          storyboardId: request.storyboardAssetId,
          segmentIndex: 0,
          settings,
          storyboardReferenceOnly: isStoryboardToVideoSkill(
            request.generationSkillId,
          ),
        });
      }

      const merged = mergeFilmGenerationRequest({
        requestPrompt: request.prompt,
        requestReferences: request.inputReferences,
        context: filmContext,
        generationSkillId: request.generationSkillId,
      });

      const prepared = prepareStoryboardToVideoGeneration({
        prompt: merged.prompt,
        inputReferences: merged.inputReferences,
        generationSkillId: request.generationSkillId,
        firstFrame: request.firstFrame,
        lastFrame: request.lastFrame,
        panelCount: filmContext?.storyboardPanelCount,
      });

      const generatingDocument: FilmDocument = {
        prompt: prepared.prompt,
        generationModelId: request.videoModelId,
        durationSec: request.durationSec,
        status: "generating",
        sourceStoryboardId: merged.sourceStoryboardId,
        sourceShotId: merged.sourceShotId,
        updatedAt: new Date().toISOString(),
      };

      revealAsset("videos", draft.id);
      stageFilmAssetPreview(draft.id, generatingDocument, {
        generationStatus: "Generating video…",
      });
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
          onStatus: () => {},
        });

        const immediateBlob = new Blob(
          [video.bytes.buffer.slice(0) as ArrayBuffer],
          { type: video.mimeType },
        );
        const immediateUrl = URL.createObjectURL(immediateBlob);

        const readyDocument: FilmDocument = {
          ...generatingDocument,
          prompt: prepared.prompt,
          status: "ready",
          durationSec: request.durationSec,
          updatedAt: new Date().toISOString(),
        };

        stageFilmAssetPreview(draft.id, readyDocument, {
          videoPreviewUrl: immediateUrl,
          generationStatus: null,
        });

        queueBackgroundPersist({
          title: draft.title,
          fallbackErrorMessage: "Failed to save generated video",
          operation: () =>
            persistGeneratedFilmAsset(
              {
                id: draft.id,
                title: draft.title,
                document: readyDocument,
                videoBytes: video.bytes,
                videoMimeType: video.mimeType,
              },
              { skipHookRefresh: !mountedRef.current },
            ),
          onSuccess: (result) => {
            if (mountedRef.current) {
              stageFilmAssetPreview(result.asset.id, result.document);
              revealAsset("videos", result.asset.id);
            }
          },
          onError: () => {
            walrusStorage.removeOptimisticProjectAsset(draft.id);
          },
        });

        return `Generated "${draft.title}" successfully. Saving to Walrus in background.`;
      } catch (err) {
        const failedDocument: FilmDocument = {
          ...generatingDocument,
          status: "failed",
          updatedAt: new Date().toISOString(),
        };

        stageFilmAssetPreview(draft.id, failedDocument);

        queueBackgroundPersist({
          title: draft.title,
          fallbackErrorMessage: "Failed to persist failed video state",
          operation: () =>
            persistGeneratedFilmAsset(
              {
                id: draft.id,
                title: draft.title,
                document: failedDocument,
              },
              { skipHookRefresh: !mountedRef.current },
            ),
          onSuccess: (result) => {
            if (mountedRef.current) {
              stageFilmAssetPreview(result.asset.id, result.document);
              revealAsset("videos", result.asset.id);
            }
          },
          onError: () => {
            walrusStorage.removeOptimisticProjectAsset(draft.id);
          },
        });

        throw err;
      } finally {
        endFilmGeneration();
      }
    },
    [
      beginFilmGeneration,
      endFilmGeneration,
      filmAssets,
      persistGeneratedFilmAsset,
      projectId,
      queueBackgroundPersist,
      revealAsset,
      selectFolder,
      settings,
      stageFilmAssetPreview,
      walrusStorage,
    ],
  );

  return {
    applyContent,
    previewContent,
    generateCharacterSheet,
    generateImage,
    generateStoryboardPlan,
    generateStoryboardImage,
    generateVideo,
  };
}
