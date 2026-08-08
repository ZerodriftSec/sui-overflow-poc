import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DesignDocument, FilmDocument } from "../lib/workspace";

interface PreviewSignal {
  content: string;
  nonce: number;
}

interface DesignAssetPreviewSignal {
  assetId: string;
  document: DesignDocument;
  nonce: number;
}

interface FilmAssetPreviewSignal {
  assetId: string;
  document: FilmDocument;
  videoPreviewUrl?: string;
  generationStatus?: string | null;
  nonce: number;
}

interface ScriptAssetPreviewSignal {
  assetId: string;
  title: string;
  content: string;
  prompt?: string;
  generationModelId?: string;
  nonce: number;
}

interface ControlModeEditorSyncValue {
  previewSignal: PreviewSignal | null;
  setPreviewContent: (content: string) => void;
  clearPreview: () => void;
  scriptAssetPreviewSignal: ScriptAssetPreviewSignal | null;
  stageScriptAssetPreview: (
    assetId: string,
    title: string,
    content: string,
    prompt?: string,
    generationModelId?: string,
  ) => void;
  designAssetPreviewSignal: DesignAssetPreviewSignal | null;
  stageDesignAssetPreview: (assetId: string, document: DesignDocument) => void;
  isGeneratingDesignAsset: boolean;
  setIsGeneratingDesignAsset: (generating: boolean) => void;
  filmAssetPreviewSignal: FilmAssetPreviewSignal | null;
  stageFilmAssetPreview: (
    assetId: string,
    document: FilmDocument,
    options?: {
      videoPreviewUrl?: string;
      generationStatus?: string | null;
    },
  ) => void;
  isGeneratingFilmAsset: boolean;
  setIsGeneratingFilmAsset: (generating: boolean) => void;
  storyboardCardId: string | null;
  setStoryboardCardId: (cardId: string | null) => void;
}

const ControlModeEditorSyncContext =
  createContext<ControlModeEditorSyncValue | null>(null);

export function ControlModeEditorSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [previewSignal, setPreviewSignal] = useState<PreviewSignal | null>(null);
  const [scriptAssetPreviewSignal, setScriptAssetPreviewSignal] =
    useState<ScriptAssetPreviewSignal | null>(null);
  const [designAssetPreviewSignal, setDesignAssetPreviewSignal] =
    useState<DesignAssetPreviewSignal | null>(null);
  const [isGeneratingDesignAsset, setIsGeneratingDesignAsset] = useState(false);
  const [filmAssetPreviewSignal, setFilmAssetPreviewSignal] =
    useState<FilmAssetPreviewSignal | null>(null);
  const [isGeneratingFilmAsset, setIsGeneratingFilmAsset] = useState(false);
  const [storyboardCardId, setStoryboardCardId] = useState<string | null>(null);

  const setPreviewContent = useCallback((content: string) => {
    setPreviewSignal((current) => ({
      content,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }, []);

  const stageScriptAssetPreview = useCallback(
    (
      assetId: string,
      title: string,
      content: string,
      prompt?: string,
      generationModelId?: string,
    ) => {
      setScriptAssetPreviewSignal((current) => ({
        assetId,
        title,
        content,
        prompt,
        generationModelId,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    },
    [],
  );

  const clearPreview = useCallback(() => {
    setPreviewSignal(null);
  }, []);

  const stageDesignAssetPreview = useCallback(
    (assetId: string, document: DesignDocument) => {
      setDesignAssetPreviewSignal((current) => ({
        assetId,
        document,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    },
    [],
  );

  const stageFilmAssetPreview = useCallback(
    (
      assetId: string,
      document: FilmDocument,
      options?: {
        videoPreviewUrl?: string;
        generationStatus?: string | null;
      },
    ) => {
      setFilmAssetPreviewSignal((current) => ({
        assetId,
        document,
        videoPreviewUrl: options?.videoPreviewUrl,
        generationStatus: options?.generationStatus,
        nonce: (current?.nonce ?? 0) + 1,
      }));
    },
    [],
  );

  const value = useMemo<ControlModeEditorSyncValue>(
    () => ({
      previewSignal,
      setPreviewContent,
      clearPreview,
      scriptAssetPreviewSignal,
      stageScriptAssetPreview,
      designAssetPreviewSignal,
      stageDesignAssetPreview,
      isGeneratingDesignAsset,
      setIsGeneratingDesignAsset,
      filmAssetPreviewSignal,
      stageFilmAssetPreview,
      isGeneratingFilmAsset,
      setIsGeneratingFilmAsset,
      storyboardCardId,
      setStoryboardCardId,
    }),
    [
      clearPreview,
      designAssetPreviewSignal,
      filmAssetPreviewSignal,
      isGeneratingDesignAsset,
      isGeneratingFilmAsset,
      previewSignal,
      scriptAssetPreviewSignal,
      setPreviewContent,
      stageDesignAssetPreview,
      stageFilmAssetPreview,
      stageScriptAssetPreview,
      storyboardCardId,
    ],
  );

  return (
    <ControlModeEditorSyncContext.Provider value={value}>
      {children}
    </ControlModeEditorSyncContext.Provider>
  );
}

export function useControlModeEditorSync(): ControlModeEditorSyncValue {
  const context = useContext(ControlModeEditorSyncContext);
  if (!context) {
    throw new Error(
      "useControlModeEditorSync must be used within ControlModeEditorSyncProvider",
    );
  }
  return context;
}
