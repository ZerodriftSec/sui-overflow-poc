import { describe, expect, test } from "bun:test";
import {
  behaviorModesForMediaMode,
  DEFAULT_CONVERSATION_SCOPE,
  conversationBucketKey,
  defaultSkillIdForFolder,
  getChatCapabilities,
  mediaModeFromFolder,
  normalizeBehaviorModeForMediaMode,
  scopeKey,
  shouldAutoRestoreConversation,
  showsBehaviorModeSelector,
} from "./chat-scope";

describe("chat-scope", () => {
  test("text mode exposes ask and draft behavior modes only", () => {
    expect(behaviorModesForMediaMode("text").map((mode) => mode.id)).toEqual([
      "ask",
      "draft",
    ]);
    expect(behaviorModesForMediaMode("image")).toEqual([]);
    expect(behaviorModesForMediaMode("video")).toEqual([]);
  });

  test("behavior mode selector is text-only and image/video always use draft", () => {
    expect(showsBehaviorModeSelector("text")).toBe(true);
    expect(showsBehaviorModeSelector("image")).toBe(false);
    expect(showsBehaviorModeSelector("video")).toBe(false);
    expect(normalizeBehaviorModeForMediaMode("image", "edit")).toBe("draft");
    expect(normalizeBehaviorModeForMediaMode("video", "agent")).toBe("draft");
  });

  test("scopeKey includes media, behavior, and skill bucket", () => {
    expect(
      scopeKey({
        mediaMode: "text",
        behaviorMode: "ask",
        skillId: null,
      }),
    ).toBe("text:ask:_default");

    expect(
      scopeKey({
        mediaMode: "video",
        behaviorMode: "draft",
        skillId: "video-prompt",
      }),
    ).toBe("video:draft:video-prompt");
  });

  test("conversationBucketKey excludes behavior mode", () => {
    expect(
      conversationBucketKey({
        mediaMode: "text",
        behaviorMode: "ask",
        skillId: "script",
      }),
    ).toBe("text:script");

    expect(
      conversationBucketKey({
        mediaMode: "text",
        behaviorMode: "draft",
        skillId: "script",
      }),
    ).toBe("text:script");
  });

  test("shouldAutoRestoreConversation only restores default text threads", () => {
    expect(
      shouldAutoRestoreConversation({
        mediaMode: "text",
        behaviorMode: "ask",
        skillId: null,
      }),
    ).toBe(true);
    expect(
      shouldAutoRestoreConversation({
        mediaMode: "text",
        behaviorMode: "ask",
        skillId: "script",
      }),
    ).toBe(false);
    expect(
      shouldAutoRestoreConversation({
        mediaMode: "image",
        behaviorMode: "ask",
        skillId: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoRestoreConversation({
        mediaMode: "video",
        behaviorMode: "ask",
        skillId: null,
      }),
    ).toBe(false);
  });

  test("mediaModeFromFolder maps folders to media modes", () => {
    expect(mediaModeFromFolder("scripts")).toBe("text");
    expect(mediaModeFromFolder("character_prompts")).toBe("text");
    expect(mediaModeFromFolder("character_sheets")).toBe("image");
    expect(mediaModeFromFolder("videos")).toBe("video");
  });

  test("defaultSkillIdForFolder maps folders to default skills", () => {
    expect(defaultSkillIdForFolder("scripts")).toBe("script");
    expect(defaultSkillIdForFolder("character_prompts")).toBe("character");
    expect(defaultSkillIdForFolder("character_sheets")).toBe("character-sheet");
    expect(defaultSkillIdForFolder("environment_sheets")).toBe("environment-sheet");
    expect(defaultSkillIdForFolder("storyboards")).toBe("storyboard-image");
    expect(defaultSkillIdForFolder("videos")).toBe(null);
  });

  test("character sheet draft enables image generation capabilities", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "image",
      behaviorMode: "draft",
      skillId: "character-sheet",
    });

    expect(capabilities.supportsCharacterSheetGeneration).toBe(true);
    expect(capabilities.supportsStoryboardImageGeneration).toBe(false);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("environment sheet draft enables image generation capabilities", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "image",
      behaviorMode: "draft",
      skillId: "environment-sheet",
    });

    expect(capabilities.supportsCharacterSheetGeneration).toBe(true);
    expect(capabilities.supportsStoryboardImageGeneration).toBe(false);
    expect(capabilities.supportsImageGeneration).toBe(false);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("storyboard image draft enables storyboard sheet generation", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "image",
      behaviorMode: "draft",
      skillId: "storyboard-image",
    });

    expect(capabilities.supportsStoryboardImageGeneration).toBe(true);
    expect(capabilities.supportsStoryboardPlanGeneration).toBe(false);
    expect(capabilities.supportsCharacterSheetGeneration).toBe(false);
    expect(capabilities.supportsImageGeneration).toBe(false);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("storyboard draft enables storyboard plan generation", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "text",
      behaviorMode: "draft",
      skillId: "storyboard",
    });

    expect(capabilities.supportsStoryboardPlanGeneration).toBe(true);
    expect(capabilities.supportsStoryboardImageGeneration).toBe(false);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("generic image draft enables direct image generation", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "image",
      behaviorMode: "draft",
      skillId: null,
    });

    expect(capabilities.supportsImageGeneration).toBe(true);
    expect(capabilities.supportsCharacterSheetGeneration).toBe(false);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("video draft enables generation capabilities", () => {
    const capabilities = getChatCapabilities({
      ...DEFAULT_CONVERSATION_SCOPE,
      mediaMode: "video",
      behaviorMode: "draft",
    });

    expect(capabilities.supportsVideoGeneration).toBe(true);
    expect(capabilities.supportsChat).toBe(false);
  });

  test("default text scope uses draft behavior mode and script skill", () => {
    expect(DEFAULT_CONVERSATION_SCOPE.behaviorMode).toBe("draft");
    expect(DEFAULT_CONVERSATION_SCOPE.skillId).toBe("script");
    const capabilities = getChatCapabilities(DEFAULT_CONVERSATION_SCOPE);
    expect(capabilities.autoApplyScriptOutput).toBe(true);
    expect(capabilities.supportsVideoGeneration).toBe(false);
  });

  test("ask mode stays non-destructive", () => {
    const capabilities = getChatCapabilities({
      ...DEFAULT_CONVERSATION_SCOPE,
      behaviorMode: "ask",
    });
    expect(capabilities.autoApplyScriptOutput).toBe(false);
    expect(capabilities.supportsVideoGeneration).toBe(false);
  });

  test("script draft mode auto-applies completed script output", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "text",
      behaviorMode: "draft",
      skillId: "script",
    });
    expect(capabilities.autoApplyScriptOutput).toBe(true);
  });

  test("script edit mode auto-applies completed script output", () => {
    const capabilities = getChatCapabilities({
      mediaMode: "text",
      behaviorMode: "edit",
      skillId: "script",
    });
    expect(capabilities.autoApplyScriptOutput).toBe(true);
  });
});
