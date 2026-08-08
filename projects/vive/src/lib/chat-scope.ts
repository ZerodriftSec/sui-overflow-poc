import type { Phase } from "../components/workspace/types";
import type { AssetFolderId } from "./asset-catalog";

export type MediaMode = "text" | "image" | "video";

export type BehaviorMode = "ask" | "draft" | "edit" | "agent";

export interface ConversationScope {
  mediaMode: MediaMode;
  behaviorMode: BehaviorMode;
  skillId: string | null;
}

export const MEDIA_MODES: { id: MediaMode; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

export const BEHAVIOR_MODES: { id: BehaviorMode; label: string; description: string }[] = [
  { id: "ask", label: "Ask", description: "Chat, critique, and brainstorm without changing assets" },
  { id: "draft", label: "Draft", description: "Generate new content from your request" },
  { id: "edit", label: "Edit", description: "Revise the selected asset in context" },
  { id: "agent", label: "Agent", description: "Run multi-step creative workflows" },
];

const TEXT_BEHAVIOR_MODE_IDS = new Set<BehaviorMode>(["ask", "draft"]);

export function behaviorModesForMediaMode(
  mediaMode: MediaMode,
): typeof BEHAVIOR_MODES {
  if (mediaMode === "text") {
    return BEHAVIOR_MODES.filter((mode) => TEXT_BEHAVIOR_MODE_IDS.has(mode.id));
  }
  return [];
}

export function showsBehaviorModeSelector(mediaMode: MediaMode): boolean {
  return mediaMode === "text";
}

export function normalizeBehaviorModeForMediaMode(
  mediaMode: MediaMode,
  behaviorMode: BehaviorMode,
): BehaviorMode {
  if (mediaMode !== "text") {
    return "draft";
  }
  if (!TEXT_BEHAVIOR_MODE_IDS.has(behaviorMode)) {
    return "draft";
  }
  return behaviorMode;
}

export const DEFAULT_CONVERSATION_SCOPE: ConversationScope = {
  mediaMode: "text",
  behaviorMode: "draft",
  skillId: "script",
};

export function scopeKey(scope: ConversationScope): string {
  const skillBucket = scope.skillId?.trim() || "_default";
  return `${scope.mediaMode}:${scope.behaviorMode}:${skillBucket}`;
}

/** Storage bucket for conversations — behavior mode is runtime-only and not part of the key. */
export function conversationBucketKey(scope: ConversationScope): string {
  const skillBucket = scope.skillId?.trim() || "_default";
  return `${scope.mediaMode}:${skillBucket}`;
}

/** Text mode without an active skill resumes the latest thread; skills and other tabs start fresh. */
export function shouldAutoRestoreConversation(scope: ConversationScope): boolean {
  return scope.mediaMode === "text" && !scope.skillId;
}

/** Legacy per-behavior-mode paths used before conversations were bucketed by media + skill only. */
export function legacyConversationBucketKeys(
  scope: ConversationScope,
): string[] {
  const skillBucket = scope.skillId?.trim() || "_default";
  return BEHAVIOR_MODES.map(
    (mode) => `${scope.mediaMode}:${mode.id}:${skillBucket}`,
  );
}

export function scopesEqual(a: ConversationScope, b: ConversationScope): boolean {
  return scopeKey(a) === scopeKey(b);
}

export function conversationBucketsEqual(
  a: ConversationScope,
  b: ConversationScope,
): boolean {
  return conversationBucketKey(a) === conversationBucketKey(b);
}

export function mediaModeFromFolder(folderId: AssetFolderId | null): MediaMode {
  if (!folderId) return "text";
  switch (folderId) {
    case "scripts":
    case "character_prompts":
    case "environment_prompts":
      return "text";
    case "character_sheets":
    case "environment_sheets":
      return "image";
    case "storyboards":
      return "image";
    case "videos":
      return "video";
    default:
      return "text";
  }
}

export function defaultSkillIdForFolder(
  folderId: AssetFolderId | null,
): string | null {
  if (!folderId) return null;
  switch (folderId) {
    case "scripts":
      return "script";
    case "character_prompts":
      return "character";
    case "character_sheets":
      return "character-sheet";
    case "environment_prompts":
      return "environment";
    case "environment_sheets":
      return "environment-sheet";
    case "storyboards":
      return "storyboard-image";
    case "videos":
      return null;
    default:
      return null;
  }
}

export function phaseFromMediaMode(mediaMode: MediaMode): Phase {
  switch (mediaMode) {
    case "text":
      return "script";
    case "image":
      return "design";
    case "video":
      return "film";
  }
}

export interface ChatCapabilities {
  supportsChat: boolean;
  supportsAssetDrop: boolean;
  /** @deprecated Use supportsAssetDrop */
  supportsScriptDrop: boolean;
  supportsImageAttachments: boolean;
  supportsVideoGeneration: boolean;
  supportsCharacterSheetGeneration: boolean;
  supportsStoryboardImageGeneration: boolean;
  supportsStoryboardPlanGeneration: boolean;
  supportsImageGeneration: boolean;
  autoApplyScriptOutput: boolean;
  supportsRegenerate: boolean;
}

export function getChatCapabilities(scope: ConversationScope): ChatCapabilities {
  const { mediaMode, behaviorMode } = scope;

  const isVideoGenerate =
    mediaMode === "video" && (behaviorMode === "draft" || behaviorMode === "agent");

  const isDesignSheetGenerate =
    mediaMode === "image" &&
    (scope.skillId === "character-sheet" || scope.skillId === "environment-sheet") &&
    (behaviorMode === "draft" || behaviorMode === "edit");

  const isStoryboardImageGenerate =
    mediaMode === "image" &&
    scope.skillId === "storyboard-image" &&
    (behaviorMode === "draft" || behaviorMode === "edit");

  const isStoryboardPlanGenerate =
    mediaMode === "text" &&
    scope.skillId === "storyboard" &&
    behaviorMode === "draft";

  const isGenericImageGenerate =
    mediaMode === "image" &&
    (behaviorMode === "draft" || behaviorMode === "edit") &&
    scope.skillId !== "character-sheet" &&
    scope.skillId !== "environment-sheet" &&
    scope.skillId !== "storyboard-image";

  return {
    supportsChat:
      !isVideoGenerate &&
      !isDesignSheetGenerate &&
      !isStoryboardImageGenerate &&
      !isStoryboardPlanGenerate &&
      !isGenericImageGenerate,
    supportsAssetDrop: true,
    supportsScriptDrop: true,
    supportsImageAttachments: mediaMode === "image" || mediaMode === "video",
    supportsVideoGeneration: isVideoGenerate,
    supportsCharacterSheetGeneration: isDesignSheetGenerate,
    supportsStoryboardImageGeneration: isStoryboardImageGenerate,
    supportsStoryboardPlanGeneration: isStoryboardPlanGenerate,
    supportsImageGeneration: isGenericImageGenerate,
    autoApplyScriptOutput:
      mediaMode === "text" &&
      (scope.skillId === "script" || scope.skillId === null) &&
      (behaviorMode === "edit" || behaviorMode === "draft"),
    supportsRegenerate: behaviorMode !== "ask",
  };
}

export function composerPlaceholder(
  scope: ConversationScope,
  options?: { disabled?: boolean; disabledReason?: string; configured?: boolean },
): string {
  if (options?.disabled) {
    return options.disabledReason ?? "Agent unavailable";
  }
  if (options?.configured === false) {
    return "Connect OpenRouter to chat";
  }

  const { mediaMode, behaviorMode } = scope;

  if (mediaMode === "video") {
    if (scope.skillId === "storyboard-to-video") {
      if (behaviorMode === "draft" || behaviorMode === "agent") {
        return "Attach a storyboard contact sheet, then describe motion and pacing across the panels…";
      }
    }
    if (behaviorMode === "draft" || behaviorMode === "agent") {
      return "Describe your video. Attach image or video references, or set start/end frames…";
    }
    return "Plan your film, refine prompts, or ask about a clip…";
  }

  if (mediaMode === "image") {
    if (scope.skillId === "character-sheet") {
      if (behaviorMode === "draft") {
        return "Paste or describe a character prompt, or send to generate from the selected asset…";
      }
      if (behaviorMode === "edit") {
        return "Revise the prompt or send to regenerate the character sheet…";
      }
    }
    if (scope.skillId === "environment-sheet") {
      if (behaviorMode === "draft") {
        return "Paste or describe an environment prompt, or send to generate from the selected asset…";
      }
      if (behaviorMode === "edit") {
        return "Revise the prompt or send to regenerate the environment sheet…";
      }
    }
    if (scope.skillId === "storyboard-image") {
      if (behaviorMode === "draft") {
        return "Attach a storyboard, then send to generate contact sheet images…";
      }
      if (behaviorMode === "edit") {
        return "Attach a storyboard, then send to regenerate contact sheet images…";
      }
    }
    if (behaviorMode === "draft") {
      return "Describe the image you want to generate…";
    }
    if (behaviorMode === "edit") {
      return "Ask the agent to refine this image prompt…";
    }
    return "Ask about visual style, composition, or image prompts…";
  }

  if (scope.skillId === "storyboard") {
    if (behaviorMode === "draft") {
      return "Attach a script or send to plan and save storyboard shots…";
    }
    if (behaviorMode === "edit") {
      return "Describe how to revise the selected shot…";
    }
  }

  if (behaviorMode === "ask") {
    return "Ask anything — critique, brainstorm, or get advice…";
  }
  if (behaviorMode === "draft") {
    return "Describe what you want to create, or type / for skills…";
  }
  if (behaviorMode === "edit") {
    return "Describe how to revise the selected content…";
  }
  if (behaviorMode === "agent") {
    return "Describe a multi-step creative goal for the agent…";
  }

  return "Type a message, or / for skills…";
}
