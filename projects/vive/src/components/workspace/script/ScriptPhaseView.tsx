import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectAssets } from "../../../hooks/useProjectAssets";
import { useScriptAssets } from "../../../hooks/useScriptAssets";
import { useLoadScriptReference } from "../../../hooks/useLoadScriptReference";
import { useWorkspaceSelection } from "../../../hooks/useWorkspaceSelection";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import { approveScriptForDesign } from "../../../lib/project";
import {
  completeSaveToast,
  failSaveToast,
  showSavingToast,
  showToast,
} from "../../../lib/toast";
import { downloadScriptContent } from "../../../lib/download-workspace-content";
import {
  getLatestScriptAssetVersion,
  isScriptAssetPersisted,
  type ScriptAsset,
  type ScriptDraft,
} from "../../../lib/workspace";
import { InspectorPanel } from "../InspectorPanel";
import type { ConversationScope } from "../../../lib/chat-scope";
import type { ApplyContentOptions } from "../AgentChat";
import { useControlModeEditorSync } from "../../../hooks/useControlModeEditorSync";
import { ScriptAssetPanel } from "./ScriptAssetPanel";
import { ScriptEditor } from "./ScriptEditor";
import { SaveScriptDialog } from "./SaveScriptDialog";

type SaveDialogMode = "create" | "duplicate" | "rename";

interface ScriptPhaseViewProps {
  projectId: string;
  onOpenSettings?: () => void;
  embedded?: boolean;
  externalSelectedId?: string | null;
}

function copyTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "Untitled Script copy";
  return trimmed.endsWith(" copy") ? `${trimmed} 2` : `${trimmed} copy`;
}

export function ScriptPhaseView({
  projectId,
  onOpenSettings,
  embedded = false,
  externalSelectedId = null,
}: ScriptPhaseViewProps) {
  const navigate = useNavigate();
  const { previewSignal, scriptAssetPreviewSignal } = useControlModeEditorSync();
  const { storageWriteBusy, getStorageContext } = useWalrusStorage();
  const workspaceSelection = useWorkspaceSelection();
  const projectAssets = useProjectAssets(projectId);
  const {
    assets,
    loading,
    saving,
    error,
    walrusPathPrefix,
    refresh,
    loadContent,
    loadDocument,
    createDraft,
    saveAsset,
  } = useScriptAssets(projectId, {
    // Control mode explorer already loads the shared catalog — avoid a second
    // list race that can leave this view empty while the sidebar shows scripts.
    autoLoad: !embedded,
    syncedAssets: projectAssets.catalog.scripts,
  });
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generationModelId, setGenerationModelId] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] =
    useState<SaveDialogMode>("create");
  const [newConversationSignal, setNewConversationSignal] = useState(0);
  const lastLoadedContentKeyRef = useRef<string | null>(null);
  const preloadedScriptAssetIdRef = useRef<string | null>(null);
  const applyAgentContentRef = useRef<
    (content: string, options?: ApplyContentOptions) => void
  >(() => {});
  const previewAgentContentRef = useRef<(content: string) => void>(() => {});

  const selectedAsset = useMemo((): ScriptAsset | null => {
    if (!selectedId) return null;
    const fromHook = assets.find((asset) => asset.id === selectedId);
    if (fromHook) return fromHook;
    const fromCatalog = projectAssets.catalog.scripts.find(
      (asset) => asset.id === selectedId,
    );
    if (fromCatalog) return fromCatalog;
    const fromRef = projectAssets.refs.find(
      (ref) => ref.id === selectedId && ref.folderId === "scripts",
    );
    if (!fromRef) return null;
    return {
      id: fromRef.id,
      title: fromRef.title,
      blobId: fromRef.contentBlobId,
      currentVersion: fromRef.currentVersion,
      updatedAt: fromRef.updatedAt,
      versions:
        fromRef.contentBlobId && fromRef.currentVersion
          ? [
              {
                version: fromRef.currentVersion,
                blobId: fromRef.contentBlobId,
                savedAt: fromRef.updatedAt,
              },
            ]
          : undefined,
    };
  }, [assets, projectAssets.catalog.scripts, projectAssets.refs, selectedId]);
  const isDraftActive = draft !== null && selectedId === draft.id;
  const latestVersionEntry = selectedAsset
    ? getLatestScriptAssetVersion(selectedAsset)
    : null;
  const latestVersion = latestVersionEntry?.version ?? null;
  const isHistoricalView =
    viewingVersion != null &&
    latestVersion != null &&
    viewingVersion !== latestVersion;
  const editorTitle = isDraftActive
    ? draft.title
    : (selectedAsset?.title ?? "Script Editor");
  const dirty = !isHistoricalView && content !== savedContent;
  const hasContent = content.trim().length > 0;

  const canDuplicate =
    !isHistoricalView && !contentLoading && hasContent && !loading;

  const openDesignDisabledReason = (() => {
    if (isDraftActive) return "Save this script before opening design";
    if (!selectedAsset) return "Select a saved script";
    if (isHistoricalView) return "Return to the latest version";
    if (dirty) return "Save your changes first";
    if (!latestVersionEntry?.blobId) return "Script must be saved to Walrus";
    return undefined;
  })();

  const canOpenDesign =
    !isDraftActive &&
    selectedAsset !== null &&
    !isHistoricalView &&
    !dirty &&
    !contentLoading &&
    Boolean(latestVersionEntry?.blobId);

  function warmStorageContext(): void {
    void getStorageContext();
  }

  function needsSaveAsDialog(): boolean {
    if (isDraftActive) return true;
    if (!selectedAsset) return false;
    return !isScriptAssetPersisted(selectedAsset);
  }

  function openSaveAsDialog(): void {
    warmStorageContext();
    setSaveDialogMode("create");
    setSaveDialogOpen(true);
  }

  useEffect(() => {
    // Control mode selection is driven by WorkspaceSelection, not local defaults.
    if (embedded) return;

    if (loading || assets.length === 0) return;

    if (!draft && (!selectedId || !assets.some((asset) => asset.id === selectedId))) {
      setSelectedId(assets[0].id);
    }
  }, [loading, assets, draft, selectedId, embedded]);

  useEffect(() => {
    if (isDraftActive) {
      lastLoadedContentKeyRef.current = null;
      return;
    }

    if (!selectedId) {
      lastLoadedContentKeyRef.current = null;
      setContent("");
      setSavedContent("");
      setGenerationPrompt("");
      setGenerationModelId("");
      setContentError(null);
      setViewingVersion(null);
      return;
    }

    if (!selectedAsset || selectedAsset.id !== selectedId) return;

    if (preloadedScriptAssetIdRef.current === selectedId) {
      preloadedScriptAssetIdRef.current = null;
      return;
    }

    const scopedAsset = selectedAsset;
    const loadKey = `${selectedId}:${viewingVersion ?? "latest"}:${selectedAsset.blobId ?? ""}:${selectedAsset.currentVersion ?? ""}`;
    if (lastLoadedContentKeyRef.current === loadKey) return;

    let cancelled = false;

    async function load() {
      setContentLoading(true);
      setContentError(null);
      try {
        const document = await loadDocument(
          scopedAsset,
          viewingVersion ?? undefined,
        );
        if (!cancelled) {
          lastLoadedContentKeyRef.current = loadKey;
          setContent(document.content);
          setSavedContent(document.content);
          setGenerationPrompt(document.prompt);
          setGenerationModelId(document.generationModelId);
        }
      } catch (err) {
        if (!cancelled) {
          setContent("");
          setSavedContent("");
          setGenerationPrompt("");
          setGenerationModelId("");
          setContentError(
            err instanceof Error ? err.message : "Failed to load script",
          );
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Depend on stable asset identity fields, not object identity.
  }, [
    selectedId,
    selectedAsset?.id,
    selectedAsset?.blobId,
    selectedAsset?.currentVersion,
    selectedAsset?.title,
    viewingVersion,
    isDraftActive,
    loadDocument,
  ]);

  function startBlankDraft(title?: string) {
    const nextDraft = createDraft(title);
    lastLoadedContentKeyRef.current = null;
    setDraft(nextDraft);
    setSelectedId(nextDraft.id);
    setViewingVersion(null);
    setContent("");
    setSavedContent("");
    setGenerationPrompt("");
    setGenerationModelId("");
    setContentError(null);
    setNewConversationSignal((signal) => signal + 1);
    if (embedded) {
      workspaceSelection.clearAssetSelection();
    }
  }

  function startDraftWithContent(
    nextContent: string,
    prompt?: string,
    modelId?: string,
  ) {
    const nextDraft = createDraft();
    lastLoadedContentKeyRef.current = null;
    setDraft(nextDraft);
    setSelectedId(nextDraft.id);
    setViewingVersion(null);
    setContent(nextContent);
    setSavedContent("");
    if (prompt !== undefined) {
      setGenerationPrompt(prompt);
    }
    if (modelId !== undefined) {
      setGenerationModelId(modelId);
    }
    setContentError(null);
    setNewConversationSignal((signal) => signal + 1);
    if (embedded) {
      workspaceSelection.clearAssetSelection();
    }
  }

  function beginCreateScript(title: string) {
    startBlankDraft(title);
  }

  function handleApplyAgentContent(
    nextContent: string,
    options?: ApplyContentOptions,
  ) {
    if (isHistoricalView || nextContent.trim().length === 0) {
      return;
    }

    const nextPrompt = options?.generationPrompt?.trim();
    const nextModelId = options?.generationModelId?.trim();
    if (nextPrompt) {
      setGenerationPrompt(nextPrompt);
    }
    if (nextModelId) {
      setGenerationModelId(nextModelId);
    }

    if (isDraftActive) {
      setContent(nextContent);
      return;
    }

    const { behaviorMode } = workspaceSelection.selection.chatScope;
    const hasSavedTarget =
      selectedId &&
      selectedAsset &&
      isScriptAssetPersisted(selectedAsset);

    if (hasSavedTarget && behaviorMode === "edit") {
      setContent(nextContent);
      performSave({
        id: selectedId,
        title: selectedAsset.title,
        content: nextContent,
        prompt: nextPrompt || generationPrompt,
        generationModelId: nextModelId || generationModelId,
        useProvidedTitle: true,
        onSuccess: () => {
          workspaceSelection.selectAsset("scripts", selectedId);
        },
      });
      return;
    }

    startDraftWithContent(nextContent, nextPrompt, nextModelId);
  }

  function handlePreviewAgentContent(nextContent: string) {
    if (isHistoricalView || nextContent.trim().length === 0) {
      return;
    }

    if (isDraftActive) {
      setContent(nextContent);
      return;
    }

    const { behaviorMode } = workspaceSelection.selection.chatScope;
    const hasSavedTarget =
      selectedId &&
      selectedAsset &&
      isScriptAssetPersisted(selectedAsset);

    if (hasSavedTarget && behaviorMode === "edit") {
      setContent(nextContent);
      return;
    }

    startDraftWithContent(nextContent);
  }

  applyAgentContentRef.current = handleApplyAgentContent;
  previewAgentContentRef.current = handlePreviewAgentContent;

  function handleCreate() {
    setSaveDialogMode("create");
    setSaveDialogOpen(true);
  }

  function handleSelectAsset(id: string) {
    setDraft(null);
    lastLoadedContentKeyRef.current = null;
    setSelectedId(id);
    setViewingVersion(null);
  }

  function handleSelectDraft() {
    if (!draft) return;
    setSelectedId(draft.id);
    setViewingVersion(null);
  }

  function handleSelectVersion(version: number | null) {
    lastLoadedContentKeyRef.current = null;
    setViewingVersion(version);
  }

  function handleViewLatest() {
    setViewingVersion(null);
  }

  async function handleRestoreVersion() {
    if (!selectedAsset) return;

    try {
      const latest = await loadContent(selectedAsset);
      setViewingVersion(null);
      setSavedContent(latest);
      setContentError(null);
    } catch (err) {
      setContentError(
        err instanceof Error ? err.message : "Failed to load latest version",
      );
    }
  }

  function handleSave() {
    if (saving || storageWriteBusy) return;

    if (needsSaveAsDialog()) {
      openSaveAsDialog();
      return;
    }

    warmStorageContext();

    const id = isDraftActive ? draft?.id : selectedAsset?.id;
    const title = isDraftActive ? draft?.title : selectedAsset?.title;
    if (!id || !title) return;

    performSave({ id, title, content, useProvidedTitle: isDraftActive });
  }

  function handleRename() {
    if (!selectedAsset || isDraftActive) return;
    setSaveDialogMode("rename");
    setSaveDialogOpen(true);
  }

  function handleDuplicate() {
    if (!canDuplicate) return;
    setSaveDialogMode("duplicate");
    setSaveDialogOpen(true);
  }

  function performSave(input: {
    id: string;
    title: string;
    content: string;
    prompt?: string;
    generationModelId?: string;
    useProvidedTitle?: boolean;
    treatAsDraft?: boolean;
    draftSnapshot?: ScriptDraft | null;
    onSuccess?: () => void;
  }) {
    const previousSavedContent = savedContent;
    const previousDraft = input.draftSnapshot ?? draft;
    const wasDraft = input.treatAsDraft ?? isDraftActive;
    const toastId = showSavingToast(input.title);
    const promptToSave =
      input.prompt !== undefined ? input.prompt : generationPrompt;
    const modelToSave =
      input.generationModelId !== undefined
        ? input.generationModelId
        : generationModelId;

    setSavedContent(input.content);
    setContentError(null);
    setSaveDialogOpen(false);
    setViewingVersion(null);

    if (wasDraft) {
      lastLoadedContentKeyRef.current = `${input.id}:latest`;
      setDraft(null);
      setSelectedId(input.id);
    }

    saveAsset(
      {
        id: input.id,
        title: input.title,
        content: input.content,
        prompt: promptToSave,
        generationModelId: modelToSave,
        useProvidedTitle: input.useProvidedTitle,
      },
      {
        onSuccess: (asset) => {
          completeSaveToast(toastId, asset.title);
          setSelectedId(asset.id);
          input.onSuccess?.();
        },
        onError: (err) => {
          setSavedContent(previousSavedContent);
          if (wasDraft && previousDraft) {
            setDraft(previousDraft);
            setSelectedId(previousDraft.id);
          }
          failSaveToast(toastId, err.message);
        },
      },
    );
  }

  function handleSaveDialogSubmit(title: string) {
    if (saveDialogMode === "create") {
      if (isDraftActive && draft) {
        performSave({
          id: draft.id,
          title,
          content,
          useProvidedTitle: true,
          treatAsDraft: true,
          draftSnapshot: draft,
          onSuccess: () => {
            workspaceSelection.revealAsset("scripts", draft.id);
          },
        });
        return;
      }

      if (
        selectedAsset &&
        !isDraftActive &&
        !isScriptAssetPersisted(selectedAsset)
      ) {
        performSave({
          id: selectedAsset.id,
          title,
          content,
          useProvidedTitle: true,
          onSuccess: () => {
            workspaceSelection.revealAsset("scripts", selectedAsset.id);
          },
        });
        return;
      }

      beginCreateScript(title);
      setSaveDialogOpen(false);
      return;
    }

    if (saveDialogMode === "rename") {
      if (!selectedAsset) return;
      performSave({
        id: selectedAsset.id,
        title,
        content,
        useProvidedTitle: true,
      });
      return;
    }

    const newId = crypto.randomUUID();
    performSave({
      id: newId,
      title,
      content,
      useProvidedTitle: true,
      onSuccess: () => {
        setDraft(null);
        setSelectedId(newId);
      },
    });
  }

  function navigateToDesign(scriptId: string, scriptTitle: string) {
    const asset = assets.find((item) => item.id === scriptId);
    const versionEntry = asset ? getLatestScriptAssetVersion(asset) : null;
    if (!versionEntry?.blobId) {
      showToast("error", "Could not approve script — missing version data");
      return;
    }

    const updated = approveScriptForDesign(projectId, {
      scriptId,
      scriptTitle,
      version: versionEntry.version,
      blobId: versionEntry.blobId,
    });

    if (!updated) {
      showToast("error", "Project not found");
      return;
    }

    navigate(`/app/projects/${projectId}/design`, {
      state: { triggerDesignGeneration: true },
    });
  }

  function handleOpenDesign() {
    if (!canOpenDesign || !selectedAsset || !latestVersionEntry?.blobId) {
      return;
    }

    navigateToDesign(selectedAsset.id, selectedAsset.title);
  }

  useEffect(() => {
    if (!embedded || externalSelectedId == null) return;
    if (externalSelectedId === selectedId) return;
    if (preloadedScriptAssetIdRef.current === externalSelectedId) {
      setSelectedId(externalSelectedId);
      return;
    }
    setDraft(null);
    lastLoadedContentKeyRef.current = null;
    setSelectedId(externalSelectedId);
    setViewingVersion(null);
  }, [embedded, externalSelectedId, selectedId]);

  const editorOpen =
    isDraftActive || selectedAsset !== null || content.trim().length > 0;

  function handleDownload() {
    if (!editorOpen || contentLoading || !hasContent) return;

    try {
      downloadScriptContent(editorTitle, content);
      showToast("success", "Download started");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to download script",
      );
    }
  }

  function handleDetachPrimary() {
    if (isHistoricalView || isDraftActive) return;
    startBlankDraft();
  }

  const canStartNewScript = !isDraftActive && !isHistoricalView;

  const loadScriptReference = useLoadScriptReference(projectId);

  const lastPreviewNonceRef = useRef(0);
  const lastScriptPreviewNonceRef = useRef(0);

  useEffect(() => {
    if (!embedded || !scriptAssetPreviewSignal || isHistoricalView) return;
    if (scriptAssetPreviewSignal.nonce === lastScriptPreviewNonceRef.current) {
      return;
    }
    lastScriptPreviewNonceRef.current = scriptAssetPreviewSignal.nonce;

    const { assetId, content, prompt, generationModelId: previewModelId } =
      scriptAssetPreviewSignal;
    preloadedScriptAssetIdRef.current = assetId;
    setDraft(null);
    lastLoadedContentKeyRef.current = `preview:${assetId}`;
    setSelectedId(assetId);
    setViewingVersion(null);
    setContent(content);
    setSavedContent("");
    if (prompt !== undefined) {
      setGenerationPrompt(prompt);
    }
    if (previewModelId !== undefined) {
      setGenerationModelId(previewModelId);
    }
    setContentLoading(false);
    setContentError(null);
  }, [embedded, isHistoricalView, scriptAssetPreviewSignal]);

  useEffect(() => {
    if (!embedded || !previewSignal || isHistoricalView) return;
    if (previewSignal.nonce === lastPreviewNonceRef.current) return;
    lastPreviewNonceRef.current = previewSignal.nonce;
    previewAgentContentRef.current(previewSignal.content);
  }, [embedded, isHistoricalView, previewSignal]);

  const saveDialogInitialTitle = (() => {
    if (saveDialogMode === "create") {
      if (isDraftActive && draft) {
        return draft.title;
      }
      if (selectedAsset && !isScriptAssetPersisted(selectedAsset)) {
        return selectedAsset.title;
      }
      return "";
    }
    if (saveDialogMode === "rename") {
      return selectedAsset?.title ?? "Untitled Script";
    }
    if (saveDialogMode === "duplicate") {
      if (isDraftActive && draft) {
        return copyTitle(draft.title);
      }
      if (selectedAsset) {
        return copyTitle(selectedAsset.title);
      }
      return "Untitled Script copy";
    }
    return "Untitled Script";
  })();

  const saveDialogHeading = (() => {
    switch (saveDialogMode) {
      case "create":
        return isDraftActive ||
          (selectedAsset && !isScriptAssetPersisted(selectedAsset))
          ? "Save script"
          : "New script";
      case "rename":
        return "Rename script";
      case "duplicate":
        return "Duplicate script";
      default:
        return "Save script as";
    }
  })();

  const saveDialogSubmitLabel =
    saveDialogMode === "create" &&
    !isDraftActive &&
    (!selectedAsset || isScriptAssetPersisted(selectedAsset))
      ? "Create"
      : "Save";

  const editorMenuItems = [
    {
      id: "new-script",
      label: "New script",
      disabled: !canStartNewScript,
      disabledReason: isDraftActive
        ? "Save or discard the current draft first"
        : isHistoricalView
          ? "Return to the latest version"
          : undefined,
      onSelect: handleDetachPrimary,
    },
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: !canDuplicate,
      disabledReason: "Add content to duplicate",
      onSelect: handleDuplicate,
    },
    {
      id: "rename",
      label: "Rename",
      disabled: isDraftActive || !selectedAsset || isHistoricalView,
      disabledReason: isDraftActive
        ? "Save the script first"
        : isHistoricalView
          ? "Return to the latest version"
          : "Select a saved script",
      onSelect: handleRename,
    },
  ];

  return (
    <>
      <SaveScriptDialog
        open={saveDialogOpen}
        heading={saveDialogHeading}
        initialTitle={saveDialogInitialTitle}
        submitLabel={saveDialogSubmitLabel}
        onClose={() => setSaveDialogOpen(false)}
        onSave={handleSaveDialogSubmit}
      />
      {!embedded ? (
        <ScriptAssetPanel
          assets={assets}
          draft={draft}
          selectedId={selectedId}
          selectedAsset={selectedAsset}
          viewingVersion={viewingVersion}
          loading={loading}
          error={error}
          namespace={walrusPathPrefix}
          onSelect={handleSelectAsset}
          onSelectDraft={handleSelectDraft}
          onSelectVersion={handleSelectVersion}
          onRefresh={refresh}
          onCreate={handleCreate}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ScriptEditor
          title={editorTitle}
          open={editorOpen}
          content={content}
          generationPrompt={generationPrompt}
          generationModelId={generationModelId}
          loading={contentLoading}
          saving={saving || storageWriteBusy}
          error={contentError}
          dirty={dirty}
          isDraft={isDraftActive}
          viewingVersion={viewingVersion}
          latestVersion={latestVersion}
          readOnly={isHistoricalView}
          menuItems={editorMenuItems}
          canDownload={editorOpen && !contentLoading && hasContent}
          canOpenDesign={!embedded && canOpenDesign}
          openDesignDisabledReason={openDesignDisabledReason}
          onChange={setContent}
          onSave={handleSave}
          onDownload={handleDownload}
          onOpenDesign={handleOpenDesign}
          onViewLatest={handleViewLatest}
          onRestoreVersion={() => void handleRestoreVersion()}
        />
      </div>
      {!embedded ? (
        <InspectorPanel
          scope={{
            mediaMode: "text",
            behaviorMode: "edit",
            skillId: "script",
          } satisfies ConversationScope}
          projectId={projectId}
          manualApplyOnly
          chatDisabled={isHistoricalView}
          chatDisabledReason={
            isHistoricalView
              ? "Exit version history to edit"
              : undefined
          }
          onOpenSettings={onOpenSettings}
          onApplyContent={isHistoricalView ? undefined : handleApplyAgentContent}
          onPreviewApply={isHistoricalView ? undefined : (content) => previewAgentContentRef.current(content)}
          loadScriptReference={loadScriptReference}
          newConversationSignal={newConversationSignal}
        />
      ) : null}
    </>
  );
}
