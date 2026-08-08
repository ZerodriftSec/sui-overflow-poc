import { describe, expect, test } from "bun:test";
import {
  filterSkillsByQuery,
  filterSkillsForScope,
  getSkillBySlashCommand,
  isSkillCompatibleWithScope,
  parseSlashCommand,
  resolveScopePatchForSkill,
  scopeWithSkill,
  skillsForSlashMenu,
  BUILTIN_CHAT_SKILLS,
} from "./chat-skills";

describe("chat-skills", () => {
  test("parseSlashCommand extracts skill and user text", () => {
    expect(parseSlashCommand("/character make a noir detective")).toEqual({
      skillId: "character",
      userText: "make a noir detective",
    });

    expect(parseSlashCommand("plain question")).toEqual({
      skillId: null,
      userText: "plain question",
    });
  });

  test("getSkillBySlashCommand resolves built-ins", () => {
    expect(getSkillBySlashCommand("/script")?.id).toBe("script");
    expect(getSkillBySlashCommand("/character-sheet")?.id).toBe("character-sheet");
    expect(getSkillBySlashCommand("/environment-sheet")?.id).toBe("environment-sheet");
    expect(getSkillBySlashCommand("/storyboard-image")?.id).toBe("storyboard-image");
    expect(getSkillBySlashCommand("/storyboard-to-video")?.id).toBe(
      "storyboard-to-video",
    );
  });

  test("filterSkillsForScope excludes environment prompt from image mode", () => {
    const imageDraft = filterSkillsForScope(
      BUILTIN_CHAT_SKILLS,
      "image",
      "draft",
    );
    expect(imageDraft.some((skill) => skill.id === "environment")).toBe(false);
    expect(imageDraft.some((skill) => skill.id === "environment-sheet")).toBe(true);
    expect(imageDraft.some((skill) => skill.id === "storyboard")).toBe(false);
    expect(imageDraft.some((skill) => skill.id === "storyboard-image")).toBe(true);
  });

  test("filterSkillsForScope respects media and behavior", () => {
    const textDraft = filterSkillsForScope(
      BUILTIN_CHAT_SKILLS,
      "text",
      "draft",
    );
    expect(textDraft.some((skill) => skill.id === "script")).toBe(true);
    expect(textDraft.some((skill) => skill.id === "video-prompt")).toBe(false);
  });

  test("filterSkillsByQuery matches command prefix", () => {
    const matches = filterSkillsByQuery(BUILTIN_CHAT_SKILLS, "/char");
    expect(matches.some((skill) => skill.id === "character")).toBe(true);
  });

  test("scopeWithSkill preserves media and behavior mode", () => {
    const scope = {
      mediaMode: "image" as const,
      behaviorMode: "draft" as const,
      skillId: null,
    };
    expect(scopeWithSkill(scope, "storyboard-image")).toEqual({
      mediaMode: "image",
      behaviorMode: "draft",
      skillId: "storyboard-image",
    });
  });

  test("isSkillCompatibleWithScope requires matching media and behavior", () => {
    const storyboardImage = getSkillBySlashCommand("/storyboard-image")!;
    expect(
      isSkillCompatibleWithScope(storyboardImage, {
        mediaMode: "image",
        behaviorMode: "draft",
      }),
    ).toBe(true);
    expect(
      isSkillCompatibleWithScope(storyboardImage, {
        mediaMode: "video",
        behaviorMode: "draft",
      }),
    ).toBe(false);
  });

  test("skillsForSlashMenu always includes user skills", () => {
    const userSkill = {
      id: "user-test",
      label: "Custom",
      description: "Custom skill",
      slashCommand: "/custom",
      mediaModes: ["text"] as const,
      behaviorModes: ["draft"] as const,
      systemPromptTemplate: "Do custom things.",
      outputActionHints: [],
      builtin: false,
    };

    const menu = skillsForSlashMenu(
      [...BUILTIN_CHAT_SKILLS, userSkill],
      "video",
      "ask",
    );

    expect(menu.some((skill) => skill.id === "user-test")).toBe(true);
    expect(menu.some((skill) => skill.id === "video-prompt")).toBe(true);
    expect(menu.some((skill) => skill.id === "script")).toBe(false);
  });

  test("resolveScopePatchForSkill picks compatible modes", () => {
    const userSkill = {
      id: "user-test",
      label: "Custom",
      description: "Custom skill",
      slashCommand: "/custom",
      mediaModes: ["text"] as const,
      behaviorModes: ["draft", "edit"] as const,
      systemPromptTemplate: "Do custom things.",
      outputActionHints: [],
      builtin: false,
    };

    expect(
      resolveScopePatchForSkill(userSkill, {
        mediaMode: "video",
        behaviorMode: "ask",
      }),
    ).toEqual({
      mediaMode: "text",
      behaviorMode: "draft",
      skillId: "user-test",
    });
  });
});
