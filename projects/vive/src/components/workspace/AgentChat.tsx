import { useEffect, useRef, useState } from "react";
import { streamText, type ImagePart, type ModelMessage, type TextPart } from "ai";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import {
  ArrowUp,
  Clapperboard,
  Clock,
  Copy,
  Check,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { createAgentModel } from "../../lib/agent";
import {
  normalizeScriptAgentOutput,
  parseAgentResponse,
} from "../../lib/agent-response";
import {
  buildComposerSystemPrompt,
  normalizeDesignPromptOutput,
  shouldAutoApplyDesignPromptOutput,
  shouldAutoApplyOutput,
} from "../../lib/chat-prompt-policy";
import {
  composerPlaceholder,
  getChatCapabilities,
  type ConversationScope,
} from "../../lib/chat-scope";
import {
  filterSkillsByQuery,
  getBuiltinSkill,
  isSkillCompatibleWithScope,
  parseSlashCommand,
  resolveScopePatchForSkill,
  scopeWithSkill,
  skillsForSlashMenu,
  type ChatSkillDefinition,
} from "../../lib/chat-skills";
import { useSkills } from "../../components/SkillsProvider";
import {
  MAX_ATTACHED_REFERENCES,
  ASSET_DRAG_MIME,
  parseAssetDragPayload,
  type AssetDragPayload,
  findAttachedStoryboardReference,
  type AttachedReferenceMeta,
  type ContextReference,
} from "../../lib/agent-context";
import {
  conversationTitleFromMessage,
  type StoredChatMessage,
} from "../../lib/agent-conversation";
import {
  loadStoredChatImageBytes,
  loadStoredChatImageDataUrl,
} from "../../lib/chat-image-storage";
import {
  filesToChatImageAttachments,
  filesToChatMediaAttachments,
  fileToChatImageAttachment,
  dataUrlToChatImageAttachment,
  isAcceptedImageFile,
  isAcceptedVideoFile,
  isVideoChatAttachment,
  MAX_CHAT_IMAGE_ATTACHMENTS,
  retargetVideoFrameAttachment,
  revokeChatImageAttachment,
  revokeChatImageAttachments,
  userMessagePreviewText,
  videoFileToFrameAttachment,
  videoDataUrlToFrameAttachment,
  type ChatImageAttachment,
  type VideoFramePosition,
} from "../../lib/chat-image-attachment";
import type { AssetReferenceLookup, LoadedAssetReference } from "../../lib/asset-reference";
import {
  appendImageMentionLegend,
  expandImageMentionTokens,
  resolveReferencedImageIndex,
} from "../../lib/chat-image-mention";
import type { FilmVideoReferenceKind } from "../../lib/film-llm";
import {
  isStoryboardToVideoSkill,
  STORYBOARD_TO_VIDEO_SKILL_ID,
} from "../../lib/film-generation-context";
import {
  clampVideoDurationSecForModel,
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_IMAGE_GENERATION_SIZE,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  DEFAULT_VIDEO_DURATION_SEC,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  OPENROUTER_IMAGE_MODELS,
  OPENROUTER_MODELS,
  OPENROUTER_VIDEO_MODELS,
  resolveVideoInputMode,
  supportsOpenRouterVideoReferenceInput,
  type ImageGenerationSize,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "../../lib/openrouter-models";
import { isStorageConfigured } from "../../lib/settings";
import { useSettings } from "../SettingsProvider";
import type { WalrusStorageContext } from "../../lib/storage/walrus-storage";
import { cn } from "../../lib/utils";
import { useAgentConversations } from "../../hooks/useAgentConversations";
import { useControlModeWalrusSessionOptional } from "../../hooks/useControlModeWalrusSession";
import { useWalrusStorage } from "../../hooks/useWalrusStorage";
import { ChatContextChips } from "./ChatContextChips";
import { ChatAttachedImage } from "./ChatAttachedImage";
import { ChatImagePreviews } from "./ChatImagePreviews";
import { ChatImageMentionInput } from "./ChatImageMentionInput";
import { ConversationHistoryMenu } from "./ConversationHistoryMenu";
import { FilmVideoGenerationPanel } from "./film/FilmVideoGenerationPanel";
import { ModelDropdown } from "./ModelDropdown";
import { ComposerTextarea } from "./composer/ComposerTextarea";
import { ImageResolutionSelector } from "./ImageResolutionSelector";
import { SlashSkillMenu } from "./composer/SlashSkillMenu";

const INPUT_MIN_HEIGHT = 72;
const INPUT_MAX_HEIGHT = 240;
const IMAGE_OUTPUT_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
type ImageOutputAspectRatio = (typeof IMAGE_OUTPUT_ASPECT_RATIOS)[number];

export type LoadedScriptReference = LoadedAssetReference;

export interface FilmVideoGenerationRequest {
  prompt: string;
  inputReferences: Array<{
    name: string;
    mimeType: string;
    bytes: Uint8Array;
    kind?: FilmVideoReferenceKind;
  }>;
  firstFrame?: { mimeType: string; bytes: Uint8Array };
  lastFrame?: { mimeType: string; bytes: Uint8Array };
  storyboardAssetId?: string;
  generationSkillId?: string | null;
  videoModelId: string;
  durationSec: number;
  aspectRatio: VideoAspectRatioSetting;
  resolution: VideoResolution;
  generateAudio: boolean;
}

export interface CharacterSheetGenerationRequest {
  prompt: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
  kind: "character" | "environment";
}

export interface ImageGenerationRequest {
  prompt: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
  aspectRatio: string;
}

export interface StoryboardImageGenerationRequest {
  storyboardAssetId: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
}

export interface StoryboardPlanGenerationRequest {
  scriptContent?: string;
  scriptAssetId?: string;
  modelId: string;
  userInstructions?: string;
}


export interface ApplyContentOptions {
  /** User brief / chat request that produced this artifact. */
  generationPrompt?: string;
  /** OpenRouter model id used to generate this artifact. */
  generationModelId?: string;
}

interface AgentChatProps {
  projectId: string;
  scope: ConversationScope;
  onSkillChange?: (skillId: string | null) => void;
  onPatchChatScope?: (patch: Partial<ConversationScope>) => void;
  /** When true, streaming only previews in the editor — persistence waits until generation completes. */
  manualApplyOnly?: boolean;
  behaviorModeControl?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  onOpenSettings?: () => void;
  onApply?: (
    content: string,
    options?: ApplyContentOptions,
  ) => void | Promise<void>;
  onPreviewApply?: (content: string) => void;
  onApplyDesignPrompt?: (
    content: string,
    kind: "character" | "environment",
  ) => void;
  loadAssetReference?: (
    id: string,
    lookup?: AssetReferenceLookup,
  ) => Promise<LoadedAssetReference | null>;
  /** @deprecated Use loadAssetReference */
  loadScriptReference?: (
    id: string,
    lookup?: AssetReferenceLookup,
  ) => Promise<LoadedAssetReference | null>;
  onNewConversation?: () => void;
  newConversationSignal?: number;
  onGenerateVideo?: (request: FilmVideoGenerationRequest) => Promise<string>;
  onGenerateCharacterSheet?: (
    request: CharacterSheetGenerationRequest,
  ) => Promise<string>;
  onGenerateImage?: (request: ImageGenerationRequest) => Promise<string>;
  onGenerateStoryboardImage?: (
    request: StoryboardImageGenerationRequest,
  ) => Promise<string>;
  onGenerateStoryboardPlan?: (
    request: StoryboardPlanGenerationRequest,
  ) => Promise<string>;
  defaultFilmPrompt?: string;
  defaultFilmAttachments?: ChatImageAttachment[];
  defaultFilmDurationSec?: number;
  defaultFilmContextKey?: string;
}

async function buildUserModelContent(
  ctx: WalrusStorageContext,
  message: StoredChatMessage,
): Promise<string | Array<TextPart | ImagePart>> {
  const images = message.attachedImages ?? [];
  if (images.length === 0) {
    return message.content;
  }

  const text = appendImageMentionLegend(
    message.content.trim() ||
      (images.length === 1 ? "See the attached image." : "See the attached images."),
    images,
  );

  const imageParts: ImagePart[] = [];
  for (const image of images) {
    const dataUrl = await loadStoredChatImageDataUrl(ctx, image);
    if (!dataUrl) continue;
    const mimeMatch = dataUrl.match(/^data:([^;]+);/);
    imageParts.push({
      type: "image",
      image: dataUrl,
      mediaType: mimeMatch?.[1] ?? image.mimeType,
    });
  }

  return [{ type: "text", text }, ...imageParts];
}

function dragContainsMedia(event: React.DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function AgentChat({
  projectId,
  scope,
  onSkillChange,
  onPatchChatScope,
  manualApplyOnly = false,
  behaviorModeControl,
  disabled = false,
  disabledReason,
  onOpenSettings,
  onApply,
  onPreviewApply,
  onApplyDesignPrompt,
  loadAssetReference: loadAssetReferenceProp,
  loadScriptReference: loadScriptReferenceProp,
  onNewConversation,
  newConversationSignal,
  onGenerateVideo,
  onGenerateCharacterSheet,
  onGenerateImage,
  onGenerateStoryboardImage,
  onGenerateStoryboardPlan,
  defaultFilmPrompt,
  defaultFilmAttachments,
  defaultFilmDurationSec,
  defaultFilmContextKey,
}: AgentChatProps) {
  const loadAssetReference = loadAssetReferenceProp ?? loadScriptReferenceProp;
  const account = useCurrentAccount();
  const { settings } = useSettings();
  const { allSkills } = useSkills();
  const walrusStorage = useWalrusStorage();
  const controlModeWalrusSession = useControlModeWalrusSessionOptional();
  const capabilities = getChatCapabilities(scope);
  const isVideoMode = scope.mediaMode === "video";
  const isImageMode = scope.mediaMode === "image";
  const isStoryboardToVideo = isStoryboardToVideoSkill(scope.skillId);
  const showVideoParameters = isVideoMode;
  const canGenerateVideo = capabilities.supportsVideoGeneration;
  const canGenerateCharacterSheet =
    capabilities.supportsCharacterSheetGeneration &&
    Boolean(onGenerateCharacterSheet);
  const canGenerateStoryboardImage =
    capabilities.supportsStoryboardImageGeneration &&
    Boolean(onGenerateStoryboardImage);
  const canGenerateStoryboardPlan =
    capabilities.supportsStoryboardPlanGeneration &&
    Boolean(onGenerateStoryboardPlan);
  // Route to the image generation handler whenever capabilities say so.
  // Generation from the agent panel is handled by useControlModeActions.
  const canGenerateImage = capabilities.supportsImageGeneration;
  const designSheetKind: "character" | "environment" =
    scope.skillId === "environment-sheet" ? "environment" : "character";
  const designSheetLabel =
    designSheetKind === "environment" ? "environment sheet" : "character sheet";
  const defaultPhaseModel = DEFAULT_OPENROUTER_MODEL;

  const [modelId, setModelId] = useState(defaultPhaseModel);
  const [imageModelId, setImageModelId] = useState(DEFAULT_DESIGN_IMAGE_MODEL);
  const [imageResolution, setImageResolution] =
    useState<ImageGenerationSize>(DEFAULT_IMAGE_GENERATION_SIZE);
  const [imageAspectRatio, setImageAspectRatio] =
    useState<ImageOutputAspectRatio>("1:1");
  const [videoModelId, setVideoModelId] = useState(DEFAULT_VIDEO_MODEL);
  const [videoDurationSec, setVideoDurationSec] = useState(
    DEFAULT_VIDEO_DURATION_SEC,
  );
  const [videoAspectRatio, setVideoAspectRatio] =
    useState<VideoAspectRatioSetting>(DEFAULT_VIDEO_ASPECT_RATIO_SETTING);
  const [videoResolution, setVideoResolution] = useState<VideoResolution>(
    DEFAULT_VIDEO_RESOLUTION,
  );
  const [videoGenerateAudio, setVideoGenerateAudio] = useState(false);
  const [firstFrame, setFirstFrame] = useState<ChatImageAttachment | null>(
    null,
  );
  const [lastFrame, setLastFrame] = useState<ChatImageAttachment | null>(null);

  const [input, setInput] = useState("");
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [selectedSkillLabel, setSelectedSkillLabel] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [attachedReferences, setAttachedReferences] = useState<
    AttachedReferenceMeta[]
  >([]);
  const [attachedImages, setAttachedImages] = useState<ChatImageAttachment[]>(
    [],
  );
  const [dragOver, setDragOver] = useState(false);
  const [inFlightGenerations, setInFlightGenerations] = useState(0);
  const supportsImageAttachments = capabilities.supportsImageAttachments;
  const supportsVideoReferenceAttachments =
    showVideoParameters &&
    !isStoryboardToVideo &&
    supportsOpenRouterVideoReferenceInput(videoModelId);
  const activeModelId = isVideoMode
    ? videoModelId
    : isImageMode
      ? imageModelId
      : modelId;
  const activeModels = isVideoMode
    ? OPENROUTER_VIDEO_MODELS
    : isImageMode
      ? OPENROUTER_IMAGE_MODELS
      : OPENROUTER_MODELS;

  const availableSkills = skillsForSlashMenu(
    allSkills,
    scope.mediaMode,
    scope.behaviorMode,
  );
  const filteredSlashSkills = slashMenuOpen
    ? filterSkillsByQuery(availableSkills, slashQuery)
    : [];

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachedReferencesRef = useRef(attachedReferences);
  const attachedImagesRef = useRef(attachedImages);
  const firstFrameRef = useRef(firstFrame);
  const lastFrameRef = useRef(lastFrame);
  const loadAssetReferenceRef = useRef(loadAssetReference);
  const onPreviewApplyRef = useRef(onPreviewApply);
  const lastPreviewScriptRef = useRef<string | null>(null);
  const lastPreviewPromptRef = useRef<string | null>(null);
  const loadPromisesRef = useRef<
    Map<string, Promise<LoadedAssetReference | null>>
  >(new Map());
  const newConversationSignalRef = useRef(newConversationSignal ?? 0);

  attachedReferencesRef.current = attachedReferences;
  attachedImagesRef.current = attachedImages;
  firstFrameRef.current = firstFrame;
  lastFrameRef.current = lastFrame;
  loadAssetReferenceRef.current = loadAssetReference;
  onPreviewApplyRef.current = onPreviewApply;

  const contextTitle =
    attachedReferences.find((reference) => reference.status === "ready")
      ?.title ?? null;

  const {
    conversations,
    activeConversation,
    messages,
    loading: conversationsLoading,
    error: conversationsError,
    setMessages,
    setModelId: setConversationModelId,
    createConversation,
    selectConversation,
    persistConversation,
    refresh: refreshConversations,
  } = useAgentConversations({
    projectId,
    scope,
    contextTitle,
    modelId: activeModelId,
    enabled: Boolean(projectId),
  });

  const configured = isStorageConfigured(settings, account?.address);
  const supportsAssetDrop = capabilities.supportsAssetDrop;
  const inputDisabled =
    disabled ||
    !configured ||
    streaming;
  const activeTitle = activeConversation?.title ?? "New conversation";

  const placeholder = composerPlaceholder(scope, {
    disabled,
    disabledReason,
    configured,
  });

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (!scope.skillId) {
      setSelectedSkillLabel(null);
      return;
    }
    const skill = allSkills.find((item) => item.id === scope.skillId);
    setSelectedSkillLabel(skill?.label ?? null);
  }, [allSkills, scope.skillId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, INPUT_MIN_HEIGHT),
      INPUT_MAX_HEIGHT,
    );
    textarea.style.height = `${nextHeight}px`;
  }, [input, attachedReferences.length, attachedImages.length, firstFrame, lastFrame, selectedSkillLabel]);

  useEffect(() => {
    return () => {
      revokeChatImageAttachments(attachedImagesRef.current);
      if (firstFrameRef.current) {
        revokeChatImageAttachment(firstFrameRef.current);
      }
      if (lastFrameRef.current) {
        revokeChatImageAttachment(lastFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeConversation?.modelId) return;
    const storedModelId = activeConversation.modelId;
    if (isVideoMode) {
      const isAllowed = OPENROUTER_VIDEO_MODELS.some(
        (model) => model.id === storedModelId,
      );
      if (isAllowed) setVideoModelId(storedModelId);
      return;
    }
    if (isImageMode) {
      const isAllowed = OPENROUTER_IMAGE_MODELS.some(
        (model) => model.id === storedModelId,
      );
      if (isAllowed) setImageModelId(storedModelId);
      return;
    }
    const isAllowed = OPENROUTER_MODELS.some((model) => model.id === storedModelId);
    setModelId(isAllowed ? storedModelId : defaultPhaseModel);
  }, [
    activeConversation?.id,
    activeConversation?.modelId,
    defaultPhaseModel,
    isImageMode,
    isVideoMode,
    scope.mediaMode,
    scope.behaviorMode,
    scope.skillId,
  ]);

  function expandPromptForSend(
    prompt: string,
    images: ChatImageAttachment[],
  ): string {
    return expandImageMentionTokens(prompt, images);
  }

  function orderImagesByMentionReference(
    prompt: string,
    images: ChatImageAttachment[],
  ): ChatImageAttachment[] {
    const referenceIndex = resolveReferencedImageIndex(prompt, images);
    if (referenceIndex <= 0) {
      return images;
    }

    return [
      images[referenceIndex]!,
      ...images.filter((_, index) => index !== referenceIndex),
    ];
  }

  function clearFilmGenerationAssets() {
    clearAttachedImages();
    if (firstFrameRef.current) {
      revokeChatImageAttachment(firstFrameRef.current);
    }
    if (lastFrameRef.current) {
      revokeChatImageAttachment(lastFrameRef.current);
    }
    setFirstFrame(null);
    setLastFrame(null);
  }

  function hasFilmInputReferences(): boolean {
    if (attachedImagesRef.current.length > 0) {
      return true;
    }
    return findAttachedStoryboardReference(attachedReferencesRef.current) != null;
  }

  function resolveFilmVideoInputMode() {
    return resolveVideoInputMode({
      hasInputReferences: hasFilmInputReferences(),
      hasFrameImages: Boolean(firstFrameRef.current || lastFrameRef.current),
    });
  }

  function resolvePromptKind(skillId: string | null = scope.skillId): "character" | "environment" {
    return skillId === "environment" ? "environment" : "character";
  }

  function resolveSkillForSend(
    parsedSkillId: string | null,
  ): {
    sendScope: ConversationScope;
    error: string | null;
    scopePatch: Partial<ConversationScope> | null;
  } {
    if (!parsedSkillId) {
      return { sendScope: scope, error: null, scopePatch: null };
    }

    let sendScope = scopeWithSkill(scope, parsedSkillId);
    let scopePatch: Partial<ConversationScope> | null = null;

    if (parsedSkillId === "storyboard") {
      sendScope = {
        ...sendScope,
        mediaMode: "text",
        behaviorMode: "draft",
      };
      scopePatch = {
        mediaMode: "text",
        behaviorMode: "draft",
        skillId: "storyboard",
      };
    }

    if (parsedSkillId === "storyboard-image") {
      sendScope = {
        ...sendScope,
        mediaMode: "image",
        behaviorMode:
          sendScope.behaviorMode === "edit" ? "edit" : "draft",
      };
      scopePatch = {
        mediaMode: "image",
        behaviorMode:
          sendScope.behaviorMode === "edit" ? "edit" : "draft",
        skillId: "storyboard-image",
      };
    }

    if (parsedSkillId === STORYBOARD_TO_VIDEO_SKILL_ID) {
      sendScope = {
        ...sendScope,
        mediaMode: "video",
        behaviorMode:
          sendScope.behaviorMode === "agent" ? "agent" : "draft",
        skillId: STORYBOARD_TO_VIDEO_SKILL_ID,
      };
      scopePatch = {
        mediaMode: "video",
        behaviorMode:
          sendScope.behaviorMode === "agent" ? "agent" : "draft",
        skillId: STORYBOARD_TO_VIDEO_SKILL_ID,
      };
    }

    const skill =
      allSkills.find((item) => item.id === parsedSkillId) ??
      getBuiltinSkill(parsedSkillId);

    if (skill && !skill.builtin && !scopePatch) {
      const patch = resolveScopePatchForSkill(skill, sendScope);
      sendScope = { ...sendScope, ...patch };
      scopePatch = patch;
    }

    if (skill && !isSkillCompatibleWithScope(skill, sendScope)) {
      const mediaModes = skill.mediaModes.join(" or ");
      const behaviorModes = skill.behaviorModes.join(" or ");
      return {
        sendScope,
        error: `${skill.slashCommand} requires ${mediaModes} mode with ${behaviorModes} behavior.`,
        scopePatch: null,
      };
    }

    return { sendScope, error: null, scopePatch };
  }

  function clampFilmVideoDuration(
    durationSec: number,
    modelId = videoModelId,
  ): number {
    return clampVideoDurationSecForModel(
      durationSec,
      modelId,
      resolveFilmVideoInputMode(),
    );
  }

  function handleModelChange(nextModelId: string) {
    if (isVideoMode) {
      setVideoModelId(nextModelId);
      setVideoDurationSec((current) => clampFilmVideoDuration(current, nextModelId));
      setConversationModelId(nextModelId);
      return;
    }

    if (isImageMode) {
      setImageModelId(nextModelId);
      setConversationModelId(nextModelId);
      return;
    }

    setModelId(nextModelId);
    setConversationModelId(nextModelId);
  }

  function clearAttachedImages() {
    revokeChatImageAttachments(attachedImagesRef.current);
    setAttachedImages([]);
  }

  function startNewConversation(notifyParent = true) {
    loadPromisesRef.current.clear();
    setAttachedReferences([]);
    clearFilmGenerationAssets();
    setError(null);
    if (notifyParent) {
      onNewConversation?.();
    }
    createConversation();
  }

  function handleNewConversation() {
    startNewConversation();
  }

  useEffect(() => {
    if (newConversationSignal === undefined) return;
    if (newConversationSignal <= newConversationSignalRef.current) return;
    newConversationSignalRef.current = newConversationSignal;
    startNewConversation(false);
  }, [newConversationSignal, createConversation]);

  useEffect(() => {
    if (!showVideoParameters || !defaultFilmContextKey) return;

    setInput(defaultFilmPrompt ?? "");
    clearFilmGenerationAssets();
    if (defaultFilmAttachments && defaultFilmAttachments.length > 0) {
      setAttachedImages(defaultFilmAttachments);
    }
    if (typeof defaultFilmDurationSec === "number") {
      setVideoDurationSec(defaultFilmDurationSec);
    }
  }, [
    defaultFilmAttachments,
    defaultFilmContextKey,
    defaultFilmDurationSec,
    defaultFilmPrompt,
    showVideoParameters,
  ]);

  useEffect(() => {
    if (!showVideoParameters) return;
    setVideoDurationSec((current) => clampFilmVideoDuration(current));
  }, [
    attachedImages.length,
    attachedReferences,
    firstFrame,
    lastFrame,
    videoModelId,
    showVideoParameters,
  ]);

  function handleSelectConversation(id: string) {
    loadPromisesRef.current.clear();
    setAttachedReferences([]);
    clearFilmGenerationAssets();
    setError(null);
    void selectConversation(id);
  }

  function handleRemoveAttachedImage(id: string) {
    setAttachedImages((current) => {
      const next = current.filter((attachment) => attachment.id !== id);
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) {
        revokeChatImageAttachments([removed]);
      }
      return next;
    });
  }

  async function handleAddFrameFile(file: File, slot: "first" | "last") {
    if (inputDisabled) return;

    try {
      let attachment: ChatImageAttachment;
      if (isAcceptedVideoFile(file)) {
        attachment = await videoFileToFrameAttachment(file, "first");
      } else if (isAcceptedImageFile(file)) {
        attachment = await fileToChatImageAttachment(file);
      } else {
        throw new Error("Only image or video files can be used as frames");
      }

      applyFrameAttachment(slot, attachment);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add frame image",
      );
    }
  }

  async function handleAddFrameAsset(
    payload: AssetDragPayload,
    slot: "first" | "last",
  ) {
    if (inputDisabled) return;

    try {
      const loaded = await loadReferenceContent(payload.id, {
        folderId: payload.folderId,
        fileType: payload.fileType,
      });
      if (!loaded) {
        throw new Error(`Failed to load "${payload.title}" for keyframe`);
      }

      const title = loaded.title || payload.title;
      let attachment: ChatImageAttachment | null = null;

      if (loaded.videoDataUrl) {
        attachment = await videoDataUrlToFrameAttachment(
          title,
          loaded.videoDataUrl,
          "first",
        );
      } else if (loaded.imageDataUrl) {
        attachment = dataUrlToChatImageAttachment(title, loaded.imageDataUrl);
      }

      if (!attachment) {
        throw new Error(
          `"${title}" has no image or video that can be used as a keyframe`,
        );
      }

      applyFrameAttachment(slot, attachment);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add frame from asset",
      );
    }
  }

  function applyFrameAttachment(
    slot: "first" | "last",
    attachment: ChatImageAttachment,
  ) {
    if (slot === "first") {
      if (firstFrameRef.current) {
        revokeChatImageAttachment(firstFrameRef.current);
      }
      setFirstFrame(attachment);
      return;
    }

    if (lastFrameRef.current) {
      revokeChatImageAttachment(lastFrameRef.current);
    }
    setLastFrame(attachment);
  }

  async function handleFrameVideoPositionChange(
    slot: "first" | "last",
    position: VideoFramePosition,
  ) {
    if (inputDisabled) return;

    const current =
      slot === "first" ? firstFrameRef.current : lastFrameRef.current;
    if (!current?.videoFrameSource) return;
    if (current.videoFrameSource.position === position) return;

    try {
      const next = await retargetVideoFrameAttachment(current, position);
      if (slot === "first") {
        setFirstFrame(next);
        return;
      }
      setLastFrame(next);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to switch video frame",
      );
    }
  }

  function handleSwapFrames() {
    const currentFirst = firstFrameRef.current;
    const currentLast = lastFrameRef.current;
    setFirstFrame(currentLast);
    setLastFrame(currentFirst);
  }

  async function resolveAttachmentBytes(
    attachment: ChatImageAttachment,
  ): Promise<{ name: string; mimeType: string; bytes: Uint8Array }> {
    const ctx = await walrusStorage.getStorageContext();
    const loaded = await loadStoredChatImageBytes(ctx, {
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
    });
    if (!loaded) {
      throw new Error(
        `Failed to load attached ${
          isVideoChatAttachment(attachment) ? "video" : "image"
        } "${attachment.name}"`,
      );
    }
    return {
      name: attachment.name,
      mimeType: loaded.mimeType,
      bytes: loaded.bytes,
    };
  }

  async function handleAddImageFiles(files: File[]) {
    if (!supportsImageAttachments || inputDisabled || files.length === 0) {
      return;
    }

    const remainingSlots =
      MAX_CHAT_IMAGE_ATTACHMENTS - attachedImagesRef.current.length;
    if (remainingSlots <= 0) {
      setError(
        `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} reference files.`,
      );
      return;
    }

    try {
      const nextAttachments = supportsVideoReferenceAttachments
        ? await filesToChatMediaAttachments(files.slice(0, remainingSlots), {
            allowVideo: true,
          })
        : await filesToChatImageAttachments(files.slice(0, remainingSlots));
      if (nextAttachments.length === 0) {
        setError(
          supportsVideoReferenceAttachments
            ? "Only image or video files can be attached."
            : "Only image files can be attached.",
        );
        return;
      }

      setError(null);
      setAttachedImages((current) => [...current, ...nextAttachments]);

      if (files.length > remainingSlots) {
        setError(
          `Only ${MAX_CHAT_IMAGE_ATTACHMENTS} reference files can be attached at once.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach media");
    }
  }

  function handleRemoveAttached(id: string) {
    for (const key of [...loadPromisesRef.current.keys()]) {
      if (key === id || key.startsWith(`${id}:`)) {
        loadPromisesRef.current.delete(key);
      }
    }
    setAttachedReferences((current) =>
      current.filter((reference) => reference.id !== id),
    );
  }

  function isReferenceStillAttached(id: string): boolean {
    return attachedReferencesRef.current.some((reference) => reference.id === id);
  }

  function updateAttachedReference(
    id: string,
    update: Partial<AttachedReferenceMeta>,
  ) {
    setAttachedReferences((current) =>
      current.map((reference) =>
        reference.id === id ? { ...reference, ...update } : reference,
      ),
    );
  }

  async function loadReferenceContent(
    id: string,
    lookup: AssetReferenceLookup = {},
  ): Promise<LoadedAssetReference | null> {
    const cacheKey = `${id}:${lookup.folderId ?? ""}:${lookup.fileType ?? ""}`;
    const existing = loadPromisesRef.current.get(cacheKey);
    if (existing) return existing;

    const loader = loadAssetReferenceRef.current;
    if (!loader) return null;

    const promise = loader(id, lookup);
    loadPromisesRef.current.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      if (loadPromisesRef.current.get(cacheKey) === promise) {
        loadPromisesRef.current.delete(cacheKey);
      }
    }
  }

  async function resolveAttachedReferences(): Promise<ContextReference[]> {
    const loader = loadAssetReferenceRef.current;
    const metas = attachedReferencesRef.current.filter(
      (reference) => reference.status !== "error",
    );
    if (!loader || metas.length === 0) return [];

    const resolved: ContextReference[] = [];

    await Promise.all(
      metas.map(async (meta) => {
        if (meta.content) {
          resolved.push({
            id: meta.id,
            title: meta.title,
            content: meta.content,
            kind: "attached",
          });
          return;
        }

        const loaded = await loadReferenceContent(meta.id, {
          folderId: meta.folderId,
          fileType: meta.fileType,
        });
        if (!loaded) return;

        if (isReferenceStillAttached(meta.id)) {
          updateAttachedReference(meta.id, {
            title: loaded.title,
            status: "ready",
            content: loaded.content,
          });
        }

        resolved.push({
          id: loaded.id,
          title: loaded.title,
          content: loaded.content,
          kind: "attached",
        });
      }),
    );

    return resolved;
  }

  function handleAttachAsset(payload: AssetDragPayload) {
    const loader = loadAssetReferenceRef.current;
    if (!loader) return;

    const { id, title, folderId, fileType } = payload;

    const existing = attachedReferencesRef.current.find(
      (reference) => reference.id === id,
    );
    if (existing) {
      if (existing.status === "error") {
        handleRemoveAttached(id);
      } else {
        return;
      }
    }

    if (
      folderId === "videos" &&
      supportsVideoReferenceAttachments &&
      supportsImageAttachments &&
      attachedImagesRef.current.length < MAX_CHAT_IMAGE_ATTACHMENTS
    ) {
      void (async () => {
        const loaded = await loadReferenceContent(id, { folderId, fileType });
        if (!loaded?.videoDataUrl) {
          attachTextReference(id, title, folderId, fileType);
          return;
        }

        if (attachedImagesRef.current.length >= MAX_CHAT_IMAGE_ATTACHMENTS) {
          setError(
            `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} reference files at once.`,
          );
          return;
        }

        setError(null);
        setAttachedImages((current) => [
          ...current,
          dataUrlToChatImageAttachment(loaded.title || title, loaded.videoDataUrl!),
        ]);
      })();
      return;
    }

    if (
      folderId === "storyboards" &&
      isStoryboardToVideoSkill(scope.skillId) &&
      supportsImageAttachments &&
      attachedImagesRef.current.length < MAX_CHAT_IMAGE_ATTACHMENTS
    ) {
      void (async () => {
        const loaded = await loadReferenceContent(id, { folderId, fileType });
        if (!loaded?.imageDataUrl) {
          attachTextReference(id, title, folderId, fileType);
          return;
        }

        const imageDataUrl = loaded.imageDataUrl;
        setError(null);
        setAttachedImages((current) => [
          ...current,
          dataUrlToChatImageAttachment(loaded.title || title, imageDataUrl),
        ]);
        attachTextReference(id, title, folderId, fileType);
      })();
      return;
    }

    if (
      fileType === "image" &&
      supportsImageAttachments &&
      folderId !== "storyboards" &&
      attachedImagesRef.current.length < MAX_CHAT_IMAGE_ATTACHMENTS
    ) {
      void (async () => {
        const loaded = await loadReferenceContent(id, { folderId, fileType });
        if (!loaded?.imageDataUrl) {
          attachTextReference(id, title, folderId, fileType);
          return;
        }

        if (attachedImagesRef.current.length >= MAX_CHAT_IMAGE_ATTACHMENTS) {
          setError(
            `You can attach up to ${MAX_CHAT_IMAGE_ATTACHMENTS} images at once.`,
          );
          return;
        }

        setError(null);
        setAttachedImages((current) => [
          ...current,
          dataUrlToChatImageAttachment(loaded.title || title, loaded.imageDataUrl!),
        ]);
      })();
      return;
    }

    attachTextReference(id, title, folderId, fileType);
  }

  function attachTextReference(
    id: string,
    title: string,
    folderId: AssetDragPayload["folderId"],
    fileType: AssetDragPayload["fileType"],
  ) {
    const loader = loadAssetReferenceRef.current;
    if (!loader) return;

    if (attachedReferencesRef.current.length >= MAX_ATTACHED_REFERENCES) {
      setError(
        `You can attach up to ${MAX_ATTACHED_REFERENCES} reference assets.`,
      );
      return;
    }

    setError(null);
    setAttachedReferences((current) => [
      ...current,
      { id, title, folderId, fileType, status: "loading" },
    ]);

    void (async () => {
      const loaded = await loadReferenceContent(id, { folderId, fileType });
      if (!isReferenceStillAttached(id)) return;

      if (!loaded) {
        updateAttachedReference(id, { status: "error" });
        setError(`Failed to load "${title}" for context.`);
        return;
      }

      updateAttachedReference(id, {
        title: loaded.title || title,
        status: "ready",
        content: loaded.content,
      });
    })();
  }

  function beginInFlightGeneration(): void {
    setInFlightGenerations((count) => count + 1);
  }

  function endInFlightGeneration(): void {
    setInFlightGenerations((count) => Math.max(0, count - 1));
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-keyframe-drop]")
    ) {
      setDragOver(false);
      return;
    }

    const isAssetDrag = event.dataTransfer.types.includes(ASSET_DRAG_MIME);
    const canDropAsset =
      isAssetDrag &&
      supportsAssetDrop &&
      Boolean(loadAssetReference) &&
      !disabled &&
      configured &&
      !streaming;
    const canDropImages =
      supportsImageAttachments && !inputDisabled && dragContainsMedia(event);

    if (!canDropAsset && !canDropImages) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);

    if (supportsImageAttachments && !inputDisabled) {
      const mediaFiles = Array.from(event.dataTransfer.files);
      if (mediaFiles.length > 0) {
        void handleAddImageFiles(mediaFiles);
        return;
      }
    }

    const raw = event.dataTransfer.getData(ASSET_DRAG_MIME);
    const payload = parseAssetDragPayload(raw);
    if (!payload) return;

    if (
      !supportsAssetDrop ||
      !loadAssetReference ||
      disabled ||
      !configured ||
      streaming
    ) {
      return;
    }

    handleAttachAsset(payload);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLElement>) {
    if (!supportsImageAttachments || inputDisabled) return;

    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) return;

    event.preventDefault();
    void handleAddImageFiles(imageFiles);
  }

  async function handleGenerateVideoSend(
    trimmed: string,
    pendingImages: ChatImageAttachment[],
    generationSkillId: string | null = scope.skillId,
  ) {
    if (!onGenerateVideo) {
      setError("Video generation is not available in this view.");
      return;
    }

    const storyboardToVideo = isStoryboardToVideoSkill(generationSkillId);
    const attachedStoryboard = findAttachedStoryboardReference(
      attachedReferencesRef.current,
    );
    const hasAttachedStoryboard = attachedStoryboard?.status === "ready";

    if (
      !trimmed &&
      !hasAttachedStoryboard &&
      pendingImages.length === 0
    ) {
      setError(
        storyboardToVideo
          ? "Attach a storyboard contact sheet as a reference image."
          : supportsVideoReferenceAttachments
            ? "Enter a prompt, or attach image/video references."
            : "Enter a prompt or drag a storyboard into chat as reference.",
      );
      return;
    }

    const pendingVideoAttachments = pendingImages.filter(isVideoChatAttachment);
    if (
      pendingVideoAttachments.length > 0 &&
      !supportsOpenRouterVideoReferenceInput(videoModelId)
    ) {
      setError(
        `Model "${videoModelId}" does not support video references. Switch to Seedance 2.0 (or Fast), or remove video attachments.`,
      );
      return;
    }

    setError(null);
    setInput("");
    lastPreviewScriptRef.current = null;
    lastPreviewPromptRef.current = null;

    const expandedPrompt = expandPromptForSend(trimmed, pendingImages);
    const pendingFirstFrame = storyboardToVideo ? null : firstFrameRef.current;
    const pendingLastFrame = storyboardToVideo ? null : lastFrameRef.current;
    const pendingImageOnlyCount = pendingImages.length - pendingVideoAttachments.length;

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed
        ? userMessagePreviewText(expandedPrompt, pendingImageOnlyCount, {
            videoCount: pendingVideoAttachments.length,
          })
        : `Generate video from "${attachedStoryboard!.title}"`,
      attachedImages:
        pendingImages.length > 0
          ? pendingImages.map((attachment) => ({
              name: attachment.name,
              mimeType: attachment.mimeType,
              dataUrl: attachment.dataUrl,
            }))
          : undefined,
    };
    const assistantId = crypto.randomUUID();
    clearFilmGenerationAssets();
    beginInFlightGeneration();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "Submitting video generation…",
      },
    ]);

    try {
      const inputReferences = await Promise.all(
        pendingImages.map(async (attachment) => {
          const resolved = await resolveAttachmentBytes(attachment);
          if (storyboardToVideo) {
            return { ...resolved, kind: "storyboard" as const };
          }
          if (isVideoChatAttachment(attachment)) {
            return { ...resolved, kind: "video" as const };
          }
          return resolved;
        }),
      );

      const resolvedFirstFrame = pendingFirstFrame
        ? await resolveAttachmentBytes(pendingFirstFrame)
        : undefined;
      const resolvedLastFrame = pendingLastFrame
        ? await resolveAttachmentBytes(pendingLastFrame)
        : undefined;

      const resultMessage = await onGenerateVideo({
        prompt: expandedPrompt,
        inputReferences,
        storyboardAssetId: hasAttachedStoryboard
          ? attachedStoryboard.id
          : undefined,
        generationSkillId,
        firstFrame: resolvedFirstFrame
          ? {
              mimeType: resolvedFirstFrame.mimeType,
              bytes: resolvedFirstFrame.bytes,
            }
          : undefined,
        lastFrame: resolvedLastFrame
          ? {
              mimeType: resolvedLastFrame.mimeType,
              bytes: resolvedLastFrame.bytes,
            }
          : undefined,
        videoModelId,
        durationSec: videoDurationSec,
        aspectRatio: videoAspectRatio,
        resolution: videoResolution,
        generateAudio: videoGenerateAudio,
      });

      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: resultMessage }
            : message,
        );
        void persistConversation(updated, {
          modelId: videoModelId,
          silent: true,
        });
        return updated;
      });
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  err instanceof Error
                    ? `Video generation failed: ${err.message}`
                    : "Video generation failed.",
              }
            : message,
        ),
      );
      setError(err instanceof Error ? err.message : "Video generation failed");
    } finally {
      endInFlightGeneration();
    }
  }

  async function handleGenerateCharacterSheetSend(trimmed: string) {
    if (!onGenerateCharacterSheet) {
      setError(`${designSheetLabel[0].toUpperCase()}${designSheetLabel.slice(1)} generation is not available in this view.`);
      return;
    }

    const attachedContext = await resolveAttachedReferences();
    const promptFromReferences = attachedContext
      .map((reference) => reference.content.trim())
      .filter(Boolean)
      .join("\n\n");
    const effectivePrompt = trimmed || promptFromReferences;

    if (!effectivePrompt) {
      setError(
        designSheetKind === "environment"
          ? "Enter an environment prompt, drag an environment prompt asset into chat, or select an asset with a saved prompt."
          : "Enter a character prompt, drag a character prompt asset into chat, or select an asset with a saved prompt.",
      );
      return;
    }

    setError(null);
    setInput("");
    lastPreviewScriptRef.current = null;
    lastPreviewPromptRef.current = null;

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: effectivePrompt,
    };
    const assistantId = crypto.randomUUID();
    clearAttachedImages();
    beginInFlightGeneration();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: `Generating ${designSheetLabel}…`,
      },
    ]);

    try {
      const resultMessage = await onGenerateCharacterSheet({
        prompt: effectivePrompt,
        imageModelId,
        imageResolution,
        kind: designSheetKind,
      });

      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: resultMessage }
            : message,
        );
        void persistConversation(updated, {
          modelId: imageModelId,
          silent: true,
        });
        return updated;
      });
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  err instanceof Error
                    ? `${designSheetLabel[0].toUpperCase()}${designSheetLabel.slice(1)} generation failed: ${err.message}`
                    : `${designSheetLabel[0].toUpperCase()}${designSheetLabel.slice(1)} generation failed.`,
              }
            : message,
        ),
      );
      setError(
        err instanceof Error
          ? err.message
          : `${designSheetLabel[0].toUpperCase()}${designSheetLabel.slice(1)} generation failed`,
      );
    } finally {
      endInFlightGeneration();
    }
  }

  async function handleGenerateStoryboardImageSend() {
    if (!onGenerateStoryboardImage) {
      setError("Storyboard image generation is not available in this view.");
      return;
    }

    const attachedStoryboard = findAttachedStoryboardReference(
      attachedReferencesRef.current,
    );
    if (!attachedStoryboard || attachedStoryboard.status !== "ready") {
      setError("Drag a storyboard from the asset panel into chat first.");
      return;
    }

    setError(null);
    setInput("");
    lastPreviewScriptRef.current = null;
    lastPreviewPromptRef.current = null;

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: `Generate storyboard contact sheets for "${attachedStoryboard.title}"`,
    };
    const assistantId = crypto.randomUUID();
    clearAttachedImages();
    beginInFlightGeneration();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "Generating storyboard contact sheets…",
      },
    ]);

    try {
      const resultMessage = await onGenerateStoryboardImage({
        storyboardAssetId: attachedStoryboard.id,
        imageModelId,
        imageResolution,
      });

      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: resultMessage }
            : message,
        );
        void persistConversation(updated, {
          modelId: imageModelId,
          silent: true,
        });
        return updated;
      });
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  err instanceof Error
                    ? `Storyboard image generation failed: ${err.message}`
                    : "Storyboard image generation failed.",
              }
            : message,
        ),
      );
      setError(
        err instanceof Error
          ? err.message
          : "Storyboard image generation failed",
      );
    } finally {
      endInFlightGeneration();
    }
  }

  async function handleGenerateStoryboardPlanSend(trimmed: string) {
    if (!onGenerateStoryboardPlan) {
      setError("Storyboard planning is not available in this view.");
      return;
    }

    const attachedContext = await resolveAttachedReferences();
    const scriptReferences = attachedContext.filter(
      (reference) => reference.content.trim().length > 0,
    );
    const scriptFromReferences = scriptReferences
      .map((reference) => reference.content.trim())
      .join("\n\n");
    const attachedScriptMeta = attachedReferencesRef.current.find(
      (reference) =>
        reference.status === "ready" &&
        (reference.folderId === "scripts" || reference.fileType === "text"),
    );

    setError(null);
    setInput("");
    lastPreviewScriptRef.current = null;
    lastPreviewPromptRef.current = null;

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content:
        trimmed ||
        (scriptFromReferences
          ? `Plan storyboard shots from "${scriptReferences[0]?.title ?? "attached script"}"`
          : "Plan storyboard shots from approved script"),
    };
    const assistantId = crypto.randomUUID();
    clearAttachedImages();
    beginInFlightGeneration();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "Planning storyboard shots…",
      },
    ]);

    try {
      const resultMessage = await onGenerateStoryboardPlan({
        scriptContent: scriptFromReferences || undefined,
        scriptAssetId: attachedScriptMeta?.id,
        modelId,
        userInstructions: trimmed || undefined,
      });

      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: resultMessage }
            : message,
        );
        void persistConversation(updated, {
          modelId,
          silent: true,
        });
        return updated;
      });
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  err instanceof Error
                    ? `Storyboard planning failed: ${err.message}`
                    : "Storyboard planning failed.",
              }
            : message,
        ),
      );
      setError(
        err instanceof Error ? err.message : "Storyboard planning failed",
      );
    } finally {
      endInFlightGeneration();
    }
  }

  async function handleGenerateImageSend(
    trimmed: string,
    sendScope: ConversationScope,
  ) {
    if (!onGenerateImage) {
      setError("Image generation is not available in this view.");
      return;
    }

    const attachedContext = await resolveAttachedReferences();
    const promptFromReferences = attachedContext
      .map((reference) => reference.content.trim())
      .filter(Boolean)
      .join("\n\n");
    const basePrompt = trimmed || promptFromReferences;
    const activeSkill =
      sendScope.skillId != null
        ? allSkills.find((item) => item.id === sendScope.skillId) ?? null
        : null;
    const skillPrompt = activeSkill?.systemPromptTemplate?.trim() ?? "";
    const effectivePrompt = skillPrompt
      ? [
          "Follow these skill instructions while expanding the user's idea into an image prompt:",
          skillPrompt,
          "",
          "User request:",
          basePrompt,
        ].join("\n")
      : basePrompt;

    if (!basePrompt) {
      setError("Enter an image prompt or attach a reference asset with a saved prompt.");
      return;
    }

    setError(null);
    setInput("");
    lastPreviewScriptRef.current = null;
    lastPreviewPromptRef.current = null;

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: basePrompt,
    };
    const assistantId = crypto.randomUUID();
    clearAttachedImages();
    beginInFlightGeneration();
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant" as const,
        content: "Generating image…",
      },
    ]);

    try {
      const resultMessage = await onGenerateImage({
        prompt: effectivePrompt,
        imageModelId,
        imageResolution,
        aspectRatio: imageAspectRatio,
      });

      setMessages((current) => {
        const updated = current.map((message) =>
          message.id === assistantId
            ? { ...message, content: resultMessage }
            : message,
        );
        void persistConversation(updated, {
          modelId: imageModelId,
          silent: true,
        });
        return updated;
      });
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content:
                  err instanceof Error
                    ? `Image generation failed: ${err.message}`
                    : "Image generation failed.",
              }
            : message,
        ),
      );
      setError(
        err instanceof Error ? err.message : "Image generation failed",
      );
    } finally {
      endInFlightGeneration();
    }
  }

  async function handleSend() {
    const parsedSlash = parseSlashCommand(input);
    const { sendScope, error: skillError, scopePatch } = resolveSkillForSend(
      parsedSlash.skillId,
    );
    if (skillError) {
      setError(skillError);
      return;
    }
    if (scopePatch) {
      onPatchChatScope?.(scopePatch);
    }
    if (parsedSlash.skillId) {
      onSkillChange?.(parsedSlash.skillId);
    }

    const sendCapabilities = getChatCapabilities(sendScope);
    const sendCanGenerateVideo = sendCapabilities.supportsVideoGeneration;
    const sendCanGenerateCharacterSheet =
      sendCapabilities.supportsCharacterSheetGeneration &&
      Boolean(onGenerateCharacterSheet);
    const sendCanGenerateStoryboardImage =
      sendCapabilities.supportsStoryboardImageGeneration &&
      Boolean(onGenerateStoryboardImage);
    const sendCanGenerateStoryboardPlan =
      sendCapabilities.supportsStoryboardPlanGeneration &&
      Boolean(onGenerateStoryboardPlan);
    const sendCanGenerateImage = sendCapabilities.supportsImageGeneration;

    const trimmed = parsedSlash.userText.trim() || input.trim();
    const pendingImages = attachedImagesRef.current;
    const hasAttachedContext = attachedReferencesRef.current.some(
      (reference) => reference.status !== "error",
    );
    const attachedStoryboard = findAttachedStoryboardReference(
      attachedReferencesRef.current,
    );
    const canSendVideoWithAttachedStoryboard =
      sendCanGenerateVideo && attachedStoryboard?.status === "ready";
    const canSendWithAttachedContextOnly =
      (sendCanGenerateCharacterSheet ||
        sendCanGenerateImage ||
        sendCanGenerateStoryboardPlan) &&
      hasAttachedContext;
    if (
      (!trimmed &&
        pendingImages.length === 0 &&
        !canSendWithAttachedContextOnly &&
        !sendCanGenerateStoryboardImage &&
        !sendCanGenerateStoryboardPlan &&
        !canSendVideoWithAttachedStoryboard) ||
      inputDisabled
    ) {
      return;
    }

    const loadingReferences = attachedReferencesRef.current.filter(
      (reference) => reference.status === "loading",
    );
    if (loadingReferences.length > 0) {
      setError("Wait for reference assets to finish loading.");
      return;
    }

    if (sendCanGenerateVideo) {
      void handleGenerateVideoSend(trimmed, pendingImages, sendScope.skillId);
      return;
    }

    if (sendCanGenerateCharacterSheet) {
      void handleGenerateCharacterSheetSend(trimmed);
      return;
    }

    if (sendCanGenerateStoryboardImage) {
      void handleGenerateStoryboardImageSend();
      return;
    }

    if (sendCanGenerateStoryboardPlan) {
      void handleGenerateStoryboardPlanSend(trimmed);
      return;
    }

    if (sendCanGenerateImage) {
      void handleGenerateImageSend(trimmed, sendScope);
      return;
    }

    async function runWithBatchedWalrusWrites<T>(
      operation: () => Promise<T>,
    ): Promise<T> {
      if (!controlModeWalrusSession) {
        return operation();
      }
      return controlModeWalrusSession.runWithSession(operation);
    }

    await runWithBatchedWalrusWrites(async () => {
    setError(null);
    setInput("");

    const expandedPrompt = expandPromptForSend(
      sendScope.mediaMode === "image"
        ? `${trimmed}\n\nOutput settings:\n- Aspect ratio: ${imageAspectRatio}\n- Resolution: ${imageResolution}`
        : trimmed,
      pendingImages,
    );
    const orderedImages = orderImagesByMentionReference(trimmed, pendingImages);

    const userMessage: StoredChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessagePreviewText(expandedPrompt, orderedImages.length),
      attachedImages:
        orderedImages.length > 0
          ? orderedImages.map((attachment) => ({
              name: attachment.name,
              dataUrl: attachment.dataUrl,
            }))
          : undefined,
    };
    clearAttachedImages();
    const assistantId = crypto.randomUUID();
    const isFirstUserMessage =
      messages.filter((message) => message.role === "user").length === 0;
    const nextTitle = isFirstUserMessage
      ? conversationTitleFromMessage(userMessage.content || "Image message")
      : undefined;

    const nextMessages = [
      ...messages,
      userMessage,
      { id: assistantId, role: "assistant" as const, content: "" },
    ];
    setMessages(nextMessages);
    setStreaming(true);

    const conversationId = activeConversation?.id;
    if (!conversationId) {
      setStreaming(false);
      setError("Start a conversation before sending a message.");
      return;
    }

    try {
      const ctx = await walrusStorage.getStorageContext();
      const model = createAgentModel(settings, activeModelId);
      const history: ModelMessage[] = await Promise.all(
        messages.map(async (m) =>
          m.role === "assistant"
            ? {
                role: "assistant" as const,
                content: m.rawContent ?? m.content,
              }
            : {
                role: "user" as const,
                content: await buildUserModelContent(ctx, m),
              },
        ),
      );

      const attachedContext = await resolveAttachedReferences();
      const system = buildComposerSystemPrompt(sendScope, attachedContext);

      const result = streamText({
        model,
        system,
        messages: [
          ...history,
          { role: "user", content: await buildUserModelContent(ctx, userMessage) },
        ],
      });

      let accumulated = "";
      let latestMessages = nextMessages;
      for await (const delta of result.textStream) {
        accumulated += delta;
        const parsed = parseAgentResponse(accumulated);
        if (
          shouldAutoApplyOutput(sendScope) &&
          parsed.script &&
          onPreviewApplyRef.current
        ) {
          const normalizedScript = normalizeScriptAgentOutput(parsed.script);
          if (normalizedScript !== lastPreviewScriptRef.current) {
            lastPreviewScriptRef.current = normalizedScript;
            onPreviewApplyRef.current(normalizedScript);
          }
        } else if (
          shouldAutoApplyDesignPromptOutput(sendScope) &&
          parsed.prompt &&
          onPreviewApplyRef.current
        ) {
          const normalizedPrompt = normalizeDesignPromptOutput(parsed.prompt);
          if (normalizedPrompt !== lastPreviewPromptRef.current) {
            lastPreviewPromptRef.current = normalizedPrompt;
            onPreviewApplyRef.current(normalizedPrompt);
          }
        }
        latestMessages = latestMessages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: parsed.thought,
                rawContent: accumulated,
                scriptOutput: parsed.scriptComplete
                  ? (parsed.script ?? undefined)
                  : undefined,
                promptOutput: parsed.promptComplete
                  ? (parsed.prompt ?? undefined)
                  : undefined,
              }
            : m,
        );
        setMessages(latestMessages);
      }

      const finalParsed = parseAgentResponse(accumulated);
      latestMessages = latestMessages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: finalParsed.thought,
              rawContent: accumulated,
              scriptOutput: finalParsed.hasScriptOutput
                ? (finalParsed.script ?? undefined)
                : undefined,
              promptOutput: finalParsed.hasPromptOutput
                ? (finalParsed.prompt ?? undefined)
                : undefined,
            }
          : m,
      );
      setMessages(latestMessages);

      const willAutoApplyScript =
        shouldAutoApplyOutput(sendScope) &&
        finalParsed.scriptComplete &&
        Boolean(finalParsed.script) &&
        Boolean(onApply);

      if (willAutoApplyScript && finalParsed.script && onApply) {
        await Promise.resolve(
          onApply(normalizeScriptAgentOutput(finalParsed.script), {
            generationPrompt: trimmed,
            generationModelId: activeModelId,
          }),
        );
      } else if (
        !manualApplyOnly &&
        shouldAutoApplyDesignPromptOutput(sendScope) &&
        finalParsed.hasPromptOutput &&
        finalParsed.prompt &&
        (onApplyDesignPrompt || onApply)
      ) {
        const normalizedPrompt = normalizeDesignPromptOutput(finalParsed.prompt);
        if (onApplyDesignPrompt) {
          await Promise.resolve(
            onApplyDesignPrompt(
              normalizedPrompt,
              resolvePromptKind(sendScope.skillId),
            ),
          );
        } else if (onApply) {
          await Promise.resolve(onApply(normalizedPrompt));
        }
      }

      await persistConversation(latestMessages, {
        title: nextTitle,
        modelId: activeModelId,
        silent: true,
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError(err instanceof Error ? err.message : "Failed to get a response");
    } finally {
      setStreaming(false);
    }
    });
  }

  function handleCopy(id: string, content: string) {
    void navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleInputChange(nextValue: string) {
    setInput(nextValue);

    const trimmedStart = nextValue.trimStart();
    if (trimmedStart.startsWith("/")) {
      const spaceIndex = trimmedStart.indexOf(" ");
      const commandPart =
        spaceIndex === -1 ? trimmedStart : trimmedStart.slice(0, spaceIndex);
      setSlashMenuOpen(true);
      setSlashQuery(commandPart);
      setSlashActiveIndex(0);
      return;
    }

    setSlashMenuOpen(false);
    setSlashQuery("");
    setSlashActiveIndex(0);
  }

  function applySkillSelection(skill: ChatSkillDefinition) {
    onSkillChange?.(skill.id);
    if (skill.id === "storyboard") {
      onPatchChatScope?.({
        mediaMode: "text",
        behaviorMode: "draft",
        skillId: "storyboard",
      });
    } else if (skill.id === "storyboard-image") {
      onPatchChatScope?.({
        mediaMode: "image",
        behaviorMode: scope.behaviorMode === "edit" ? "edit" : "draft",
        skillId: "storyboard-image",
      });
    } else if (skill.id === STORYBOARD_TO_VIDEO_SKILL_ID) {
      if (firstFrameRef.current) {
        revokeChatImageAttachment(firstFrameRef.current);
      }
      if (lastFrameRef.current) {
        revokeChatImageAttachment(lastFrameRef.current);
      }
      setFirstFrame(null);
      setLastFrame(null);
      onPatchChatScope?.({
        mediaMode: "video",
        behaviorMode: scope.behaviorMode === "agent" ? "agent" : "draft",
        skillId: STORYBOARD_TO_VIDEO_SKILL_ID,
      });
    } else if (!skill.builtin) {
      onPatchChatScope?.(resolveScopePatchForSkill(skill, scope));
    }
    setSelectedSkillLabel(skill.label);
    setSlashMenuOpen(false);
    setSlashQuery("");
    setSlashActiveIndex(0);
    setInput("");
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function clearSkillSelection() {
    onSkillChange?.(null);
    setSelectedSkillLabel(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashMenuOpen && filteredSlashSkills.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashActiveIndex((current) =>
          current + 1 >= filteredSlashSkills.length ? 0 : current + 1,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashActiveIndex((current) =>
          current - 1 < 0 ? filteredSlashSkills.length - 1 : current - 1,
        );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const skill = filteredSlashSkills[slashActiveIndex];
        if (skill) {
          applySkillSelection(skill);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  const attachedStoryboardReference = findAttachedStoryboardReference(
    attachedReferences,
  );
  const hasFilmReferenceInput =
    attachedImages.length > 0 || attachedStoryboardReference != null;
  const canSendStoryboardImage =
    canGenerateStoryboardImage &&
    attachedStoryboardReference?.status === "ready";

  const sendDisabled =
    inputDisabled ||
    (canGenerateVideo
      ? !input.trim() && attachedStoryboardReference?.status !== "ready"
      : canGenerateStoryboardImage
        ? !canSendStoryboardImage
        : canGenerateCharacterSheet || canGenerateImage
          ? false
          : canGenerateStoryboardPlan
            ? false
            : !input.trim() && attachedImages.length === 0);

  const combinedError = error ?? conversationsError;

  function applyActionLabel(): string {
    if (scope.skillId === "character") return "Save as character";
    if (scope.skillId === "environment") return "Save as environment";
    return "Apply to editor";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-panel">
      <div className="relative shrink-0 border-b border-border-subtle px-2 py-1.5">
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border-subtle bg-bg-viewer px-2 py-1">
            <MessageSquare className="h-3 w-3 shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
              {activeTitle}
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={streaming || conversationsLoading}
                aria-label="Close conversation"
                className="shrink-0 rounded p-0.5 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNewConversation}
            disabled={streaming || conversationsLoading}
            aria-label="New conversation"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors hover:border-border-focus hover:bg-bg-raised hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (!historyOpen) {
                  refreshConversations();
                }
                setHistoryOpen((open) => !open);
              }}
              disabled={conversationsLoading}
              aria-label="Conversation history"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors hover:border-border-focus hover:bg-bg-raised hover:text-foreground disabled:opacity-50",
                historyOpen && "border-border-focus bg-bg-raised text-foreground",
              )}
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            <ConversationHistoryMenu
              open={historyOpen}
              conversations={conversations}
              activeConversationId={activeConversation?.id ?? null}
              onClose={() => setHistoryOpen(false)}
              onSelect={handleSelectConversation}
            />
          </div>
        </div>

      </div>

      <div ref={messagesScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            {conversationsLoading && (
              <Loader2 className="mb-2 h-4 w-4 animate-spin text-text-secondary" />
            )}
            <Sparkles className="mb-3 h-8 w-8 text-border-subtle" />
            <p className="text-[13px] leading-relaxed text-text-secondary">
              {placeholder}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-1.5",
              message.role === "user" ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-[12px] leading-relaxed shadow-sm",
                message.role === "user"
                  ? "bg-resolve-accent text-bg-app"
                  : "border border-border-subtle bg-bg-raised text-foreground",
              )}
            >
              {message.role === "user" && message.attachedImages?.length ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {message.attachedImages.map((image) => (
                      <ChatAttachedImage
                        key={`${message.id}-${image.name}-${image.imageBlobId ?? image.dataUrl?.slice(0, 32) ?? "image"}`}
                        messageId={message.id}
                        image={image}
                      />
                    ))}
                  </div>
                  {message.content ? (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  ) : null}
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
              {streaming &&
                message.role === "assistant" &&
                message.rawContent?.includes("<script>") &&
                !message.scriptOutput && (
                  <div className="mt-2 flex items-center gap-1.5 text-text-secondary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Updating script…</span>
                  </div>
                )}
              {streaming &&
                message.role === "assistant" &&
                message.rawContent?.includes("<prompt>") &&
                !message.promptOutput && (
                  <div className="mt-2 flex items-center gap-1.5 text-text-secondary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving prompt…</span>
                  </div>
                )}
              {streaming && message.role === "assistant" && !message.content && (
                <div className="flex items-center gap-1.5 text-text-secondary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Thinking…</span>
                </div>
              )}
            </div>

            {message.role === "assistant" && message.content && (
              <div className="ml-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(message.id, message.content)}
                  className="flex items-center gap-1 text-[10px] text-text-secondary transition-colors hover:text-foreground"
                >
                  {copiedId === message.id ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                  {copiedId === message.id ? "Copied" : "Copy"}
                </button>
                {onApply && message.scriptOutput && (
                  <button
                    type="button"
                    onClick={() => {
                      const messageIndex = messages.findIndex(
                        (item) => item.id === message.id,
                      );
                      let generationPrompt = "";
                      for (let index = messageIndex - 1; index >= 0; index -= 1) {
                        const prior = messages[index];
                        if (prior?.role === "user") {
                          generationPrompt = prior.content;
                          break;
                        }
                      }
                      void Promise.resolve(
                        onApply(
                          normalizeScriptAgentOutput(message.scriptOutput!),
                          {
                            generationPrompt,
                            generationModelId: activeModelId,
                          },
                        ),
                      );
                    }}
                    className="text-[10px] font-medium text-resolve-accent transition-opacity hover:opacity-80"
                  >
                    {applyActionLabel()}
                  </button>
                )}
                {(onApplyDesignPrompt || onApply) && message.promptOutput && (
                  <button
                    type="button"
                    onClick={() => {
                      const normalizedPrompt = normalizeDesignPromptOutput(
                        message.promptOutput!,
                      );
                      if (onApplyDesignPrompt) {
                        onApplyDesignPrompt(
                          normalizedPrompt,
                          resolvePromptKind(),
                        );
                        return;
                      }
                      if (onApply) {
                        onApply(normalizedPrompt);
                      }
                    }}
                    className="text-[10px] font-medium text-resolve-accent transition-opacity hover:opacity-80"
                  >
                    {applyActionLabel()}
                  </button>
                )}
              </div>
            )}
          </div>
          ))}
      </div>

      {combinedError && (
        <div className="mx-3 mb-2 shrink-0 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive-foreground">
          {combinedError}
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle bg-bg-panel p-3">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(event) => void handleDrop(event)}
          className={cn(
            "rounded-xl border bg-bg-viewer transition-colors focus-within:border-border-focus",
            dragOver
              ? "border-resolve-accent ring-1 ring-resolve-accent/30"
              : "border-border-subtle",
          )}
        >
          <div className="flex flex-col gap-2 py-3">
          <ChatContextChips
            attachedReferences={attachedReferences}
            onRemoveAttached={handleRemoveAttached}
            disabled={inputDisabled}
          />

          {selectedSkillLabel ? (
            <div className="flex flex-wrap gap-1.5 px-3">
              <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-border-subtle bg-bg-raised px-2 py-1 text-foreground">
                <Sparkles className="h-3 w-3 shrink-0 text-resolve-accent" />
                <span className="truncate text-[11px] font-medium">
                  {selectedSkillLabel}
                </span>
                <button
                  type="button"
                  disabled={inputDisabled}
                  onClick={clearSkillSelection}
                  aria-label={`Remove ${selectedSkillLabel} skill`}
                  className="shrink-0 rounded p-0.5 text-text-secondary transition-colors hover:bg-bg-panel hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : null}

          {supportsImageAttachments &&
            showVideoParameters &&
            attachedImages.length > 0 && (
              <div className="px-3 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
                {isStoryboardToVideo
                  ? "Storyboard reference"
                  : supportsVideoReferenceAttachments
                    ? "Reference media"
                    : "Reference images"}
              </div>
            )}

          {supportsImageAttachments && (
            <ChatImagePreviews
              attachments={attachedImages}
              onRemove={handleRemoveAttachedImage}
              disabled={inputDisabled}
            />
          )}

          <div className="relative">
            {slashMenuOpen && filteredSlashSkills.length > 0 ? (
              <SlashSkillMenu
                skills={filteredSlashSkills}
                activeIndex={slashActiveIndex}
                onSelect={applySkillSelection}
              />
            ) : null}

            {supportsImageAttachments && showVideoParameters ? (
              <ChatImageMentionInput
                value={input}
                onChange={handleInputChange}
                attachedImages={attachedImages.filter(
                  (attachment) => !isVideoChatAttachment(attachment),
                )}
                placeholder={placeholder}
                disabled={inputDisabled}
                minHeight={INPUT_MIN_HEIGHT}
                maxHeight={INPUT_MAX_HEIGHT}
                onPaste={handlePaste}
                onSend={() => void handleSend()}
              />
            ) : (
              <ComposerTextarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleComposerKeyDown}
                placeholder={placeholder}
                disabled={inputDisabled}
                minHeight={INPUT_MIN_HEIGHT}
                maxHeight={INPUT_MAX_HEIGHT}
              />
            )}
          </div>

          {showVideoParameters ? (
            <>
              {onGenerateVideo ? (
                <FilmVideoGenerationPanel
                  firstFrame={firstFrame}
                  lastFrame={lastFrame}
                  generateAudio={videoGenerateAudio}
                  aspectRatio={videoAspectRatio}
                  resolution={videoResolution}
                  durationSec={videoDurationSec}
                  videoModelId={videoModelId}
                  referenceImageCount={attachedImages.length}
                  hasInputReferences={hasFilmReferenceInput}
                  showFrameSlots={!isStoryboardToVideo}
                  disabled={inputDisabled}
                  onFirstFrameChange={(frame) => {
                    if (firstFrameRef.current) {
                      revokeChatImageAttachment(firstFrameRef.current);
                    }
                    setFirstFrame(frame);
                  }}
                  onLastFrameChange={(frame) => {
                    if (lastFrameRef.current) {
                      revokeChatImageAttachment(lastFrameRef.current);
                    }
                    setLastFrame(frame);
                  }}
                  onSwapFrames={handleSwapFrames}
                  onGenerateAudioChange={setVideoGenerateAudio}
                  onAspectRatioChange={setVideoAspectRatio}
                  onResolutionChange={setVideoResolution}
                  onDurationChange={setVideoDurationSec}
                  onAddFrameFile={(file, slot) => void handleAddFrameFile(file, slot)}
                  onAddFrameAsset={(payload, slot) =>
                    void handleAddFrameAsset(payload, slot)
                  }
                  onFrameVideoPositionChange={(slot, position) =>
                    void handleFrameVideoPositionChange(slot, position)
                  }
                  onKeyframeDragActiveChange={(active) => {
                    if (active) setDragOver(false);
                  }}
                />
              ) : (
                <div className="px-3 text-[10px] text-text-secondary">
                  Video generation is unavailable in this context. Open a film asset to generate clips.
                </div>
              )}
            </>
          ) : null}

          {isImageMode &&
          scope.skillId !== "character-sheet" &&
          scope.skillId !== "environment-sheet" &&
          scope.skillId !== "storyboard-image" ? (
            <div className="flex flex-col gap-2 px-3">
              <label className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
                <span className="text-[10px] text-text-secondary">Image output</span>
                <div className="inline-flex flex-wrap gap-1 rounded-lg bg-bg-app p-1">
                  {IMAGE_OUTPUT_ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      disabled={inputDisabled}
                      onClick={() => setImageAspectRatio(ratio)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        imageAspectRatio === ratio
                          ? "bg-bg-raised text-foreground"
                          : "text-text-secondary hover:text-foreground",
                        inputDisabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </label>
              <label className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
                <span className="text-[10px] text-text-secondary">Image resolution</span>
                <ImageResolutionSelector
                  value={imageResolution}
                  disabled={inputDisabled}
                  onChange={setImageResolution}
                />
              </label>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-3">
            <div className="flex min-w-0 items-center gap-2">
              {behaviorModeControl}
              <ModelDropdown
                modelId={activeModelId}
                models={activeModels}
                disabled={inputDisabled}
                onChange={handleModelChange}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sendDisabled}
              aria-label={
                canGenerateVideo
                  ? "Generate video"
                  : canGenerateCharacterSheet
                    ? `Generate ${designSheetLabel}`
                    : canGenerateStoryboardImage
                      ? "Generate storyboard images"
                      : canGenerateStoryboardPlan
                        ? "Plan storyboard shots"
                        : canGenerateImage
                        ? "Generate image"
                        : "Send message"
              }
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                sendDisabled
                  ? "bg-bg-raised text-text-disabled cursor-not-allowed"
                  : "bg-resolve-accent text-bg-app hover:opacity-90",
              )}
            >
              {streaming || inFlightGenerations > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : canGenerateVideo ? (
                <Clapperboard className="h-4 w-4" />
              ) : canGenerateCharacterSheet || canGenerateStoryboardImage || canGenerateStoryboardPlan || canGenerateImage ? (
                <Sparkles className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
          </div>
        </div>

        {!configured && onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-2 w-full rounded-sm border border-resolve-accent/40 bg-resolve-accent/10 px-2 py-1.5 text-[10px] font-medium text-resolve-accent transition-colors hover:border-resolve-accent hover:bg-resolve-accent/15"
          >
            Connect OpenRouter to chat
          </button>
        )}
      </div>
    </div>
  );
}
