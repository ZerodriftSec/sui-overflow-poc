import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AssetFolderId } from "../lib/asset-catalog";
import {
  DEFAULT_CONVERSATION_SCOPE,
  normalizeBehaviorModeForMediaMode,
  type BehaviorMode,
  type ConversationScope,
  type MediaMode,
} from "../lib/chat-scope";

export interface WorkspaceSelection {
  folderId: AssetFolderId | null;
  assetId: string | null;
  chatScope: ConversationScope;
  /** Bumped when the left panel should scroll to and highlight the selected asset. */
  assetRevealSignal: number;
}

interface WorkspaceSelectionContextValue {
  selection: WorkspaceSelection;
  selectFolder: (folderId: AssetFolderId) => void;
  selectAsset: (folderId: AssetFolderId, assetId: string) => void;
  revealAsset: (folderId: AssetFolderId, assetId: string) => void;
  setMediaMode: (mediaMode: MediaMode) => void;
  setBehaviorMode: (behaviorMode: BehaviorMode) => void;
  setSkillId: (skillId: string | null) => void;
  setChatScope: (scope: ConversationScope) => void;
  patchChatScope: (patch: Partial<ConversationScope>) => void;
  clearAssetSelection: () => void;
}

const WorkspaceSelectionContext =
  createContext<WorkspaceSelectionContextValue | null>(null);

interface WorkspaceSelectionProviderProps {
  children: ReactNode;
  initialFolderId?: AssetFolderId | null;
  initialAssetId?: string | null;
  initialChatScope?: ConversationScope;
}

export function WorkspaceSelectionProvider({
  children,
  initialFolderId = "scripts",
  initialAssetId = null,
  initialChatScope = DEFAULT_CONVERSATION_SCOPE,
}: WorkspaceSelectionProviderProps) {
  const [selection, setSelection] = useState<WorkspaceSelection>(() => ({
    folderId: initialFolderId,
    assetId: initialAssetId,
    chatScope: initialChatScope,
    assetRevealSignal: 0,
  }));

  const selectFolder = useCallback((folderId: AssetFolderId) => {
    setSelection((current) => ({
      ...current,
      folderId,
      assetId: null,
    }));
  }, []);

  const selectAsset = useCallback((folderId: AssetFolderId, assetId: string) => {
    setSelection((current) => ({
      ...current,
      folderId,
      assetId,
    }));
  }, []);

  const revealAsset = useCallback((folderId: AssetFolderId, assetId: string) => {
    setSelection((current) => ({
      ...current,
      folderId,
      assetId,
      assetRevealSignal: current.assetRevealSignal + 1,
    }));
  }, []);

  const setMediaMode = useCallback((mediaMode: MediaMode) => {
    setSelection((current) => ({
      ...current,
      chatScope: {
        ...current.chatScope,
        mediaMode,
        behaviorMode: normalizeBehaviorModeForMediaMode(
          mediaMode,
          current.chatScope.behaviorMode,
        ),
        skillId: null,
      },
    }));
  }, []);

  const setBehaviorMode = useCallback((behaviorMode: BehaviorMode) => {
    setSelection((current) => ({
      ...current,
      chatScope: {
        ...current.chatScope,
        behaviorMode: normalizeBehaviorModeForMediaMode(
          current.chatScope.mediaMode,
          behaviorMode,
        ),
      },
    }));
  }, []);

  const setSkillId = useCallback((skillId: string | null) => {
    setSelection((current) => ({
      ...current,
      chatScope: {
        ...current.chatScope,
        skillId,
      },
    }));
  }, []);

  const setChatScope = useCallback((scope: ConversationScope) => {
    setSelection((current) => ({
      ...current,
      chatScope: {
        ...scope,
        behaviorMode: normalizeBehaviorModeForMediaMode(
          scope.mediaMode,
          scope.behaviorMode,
        ),
      },
    }));
  }, []);

  const patchChatScope = useCallback((patch: Partial<ConversationScope>) => {
    setSelection((current) => {
      const nextScope = { ...current.chatScope, ...patch };
      return {
        ...current,
        chatScope: {
          ...nextScope,
          behaviorMode: normalizeBehaviorModeForMediaMode(
            nextScope.mediaMode,
            nextScope.behaviorMode,
          ),
        },
      };
    });
  }, []);

  const clearAssetSelection = useCallback(() => {
    setSelection((current) => ({
      ...current,
      assetId: null,
    }));
  }, []);

  const value = useMemo<WorkspaceSelectionContextValue>(
    () => ({
      selection,
      selectFolder,
      selectAsset,
      revealAsset,
      setMediaMode,
      setBehaviorMode,
      setSkillId,
      setChatScope,
      patchChatScope,
      clearAssetSelection,
    }),
    [
      clearAssetSelection,
      selectAsset,
      revealAsset,
      selectFolder,
      selection,
      setBehaviorMode,
      setChatScope,
      patchChatScope,
      setMediaMode,
      setSkillId,
    ],
  );

  return (
    <WorkspaceSelectionContext.Provider value={value}>
      {children}
    </WorkspaceSelectionContext.Provider>
  );
}

export function useWorkspaceSelection(): WorkspaceSelectionContextValue {
  const context = useContext(WorkspaceSelectionContext);
  if (!context) {
    throw new Error(
      "useWorkspaceSelection must be used within WorkspaceSelectionProvider",
    );
  }
  return context;
}
