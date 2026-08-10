import type { BehaviorMode, ConversationScope, MediaMode } from "./chat-scope";
import { getCachedUserSkills, userSkillToChatSkillFromCache } from "./skills-cache";

export interface ChatSkillDefinition {
  id: string;
  label: string;
  description: string;
  slashCommand: string;
  mediaModes: MediaMode[];
  behaviorModes: BehaviorMode[];
  systemPromptTemplate: string;
  outputActionHints: string[];
  builtin: boolean;
}

export const BUILTIN_CHAT_SKILLS: ChatSkillDefinition[] = [
  {
    id: "script",
    label: "Write Script",
    description: "Create or revise a visual beat sheet for storyboard and video generation",
    slashCommand: "/script",
    mediaModes: ["text"],
    behaviorModes: ["draft", "edit", "agent"],
    systemPromptTemplate: `You are helping write a visual beat sheet for AI storyboard and video generation.
Each beat becomes one storyboard panel. Be concise and drawable.
When producing a full script, structure output with <thought> reasoning and <script> complete beat sheet.`,
    outputActionHints: ["Apply to script", "Save as new script"],
    builtin: true,
  },
  {
    id: "character",
    label: "Character Prompt",
    description: "Create reusable character prompts from a script or description",
    slashCommand: "/character",
    mediaModes: ["text"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are helping create character design prompts for AI image generation.
Focus on likeness, wardrobe, proportions, palette, and distinguishing features.`,
    outputActionHints: ["Save as character", "Turn into image"],
    builtin: true,
  },
  {
    id: "character-sheet",
    label: "Character Sheet",
    description: "Generate a character reference sheet image from the character prompt",
    slashCommand: "/character-sheet",
    mediaModes: ["image"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are generating a professional character reference sheet image.
Use the character image prompt to produce a four-column turnaround sheet with matching face close-ups.`,
    outputActionHints: ["Save to character sheet", "Regenerate"],
    builtin: true,
  },
  {
    id: "environment",
    label: "Environment Prompt",
    description: "Create environment and setting prompts from context",
    slashCommand: "/environment",
    mediaModes: ["text"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are helping create environment design prompts for AI image generation.
Focus on architecture, lighting, palette, atmosphere, and spatial composition.
Match any provided art style as the required rendering language (e.g. anime/cel-shaded as illustrated background art with linework and graphic color separation — not photoreal photography or CGI sports-game footage unless that style is requested).`,
    outputActionHints: ["Save as environment", "Turn into image"],
    builtin: true,
  },
  {
    id: "environment-sheet",
    label: "Environment Sheet",
    description: "Generate an environment reference sheet image from the environment prompt",
    slashCommand: "/environment-sheet",
    mediaModes: ["image"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are generating a professional environment reference sheet image.
Use the environment image prompt to produce a widescreen empty setting keyframe with consistent lighting and palette.`,
    outputActionHints: ["Save to environment sheet", "Regenerate"],
    builtin: true,
  },
  {
    id: "storyboard",
    label: "Plan Storyboard",
    description: "Plan or refine storyboard shot descriptions",
    slashCommand: "/storyboard",
    mediaModes: ["text"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are helping plan storyboard shots for short-form video.
Each shot should be drawable, with clear action, camera, and duration cues.`,
    outputActionHints: ["Plan shots", "Save storyboard"],
    builtin: true,
  },
  {
    id: "storyboard-image",
    label: "Storyboard Image",
    description: "Generate storyboard contact sheet images with all panels",
    slashCommand: "/storyboard-image",
    mediaModes: ["image"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are generating professional storyboard contact sheet images.
Use the planned shots and design references to produce multi-panel storyboard sheets.`,
    outputActionHints: ["Save to storyboard", "Regenerate"],
    builtin: true,
  },
  {
    id: "image-prompt",
    label: "Image Prompt",
    description: "Craft or refine an image generation prompt",
    slashCommand: "/image-prompt",
    mediaModes: ["image"],
    behaviorModes: ["draft", "edit"],
    systemPromptTemplate: `You are an expert at writing image generation prompts.
Produce vivid, specific prompts optimized for AI image models.`,
    outputActionHints: ["Apply to prompt", "Copy"],
    builtin: true,
  },
  {
    id: "video-prompt",
    label: "Video Prompt",
    description: "Craft or refine a video generation prompt",
    slashCommand: "/video-prompt",
    mediaModes: ["video"],
    behaviorModes: ["draft", "edit", "ask"],
    systemPromptTemplate: `You are an expert at writing video generation prompts.
Focus on motion, camera movement, subject action, and temporal pacing.`,
    outputActionHints: ["Use for generation", "Copy"],
    builtin: true,
  },
  {
    id: "storyboard-to-video",
    label: "Storyboard to Video",
    description:
      "Generate video from a storyboard contact sheet, matching panel composition unless a panel is broken",
    slashCommand: "/storyboard-to-video",
    mediaModes: ["video"],
    behaviorModes: ["draft", "agent"],
    systemPromptTemplate: `You are generating video from a storyboard contact sheet reference.
The attached image is a multi-panel visual target for shot order and composition — not the opening frame.
Match each panel's framing and blocking as closely as possible. If a panel is garbled or contradicts the scene, help the user override that panel with a clear shot that fits the written action.
Help the user describe motion and pacing across panels without treating the sheet as a static first frame.`,
    outputActionHints: ["Generate video"],
    builtin: true,
  },
];

export function getBuiltinSkill(id: string): ChatSkillDefinition | undefined {
  return BUILTIN_CHAT_SKILLS.find((skill) => skill.id === id);
}

export function getSkillBySlashCommand(command: string): ChatSkillDefinition | undefined {
  const normalized = command.trim().toLowerCase();
  const builtin = BUILTIN_CHAT_SKILLS.find(
    (skill) => skill.slashCommand.toLowerCase() === normalized,
  );
  if (builtin) return builtin;
  return getCachedUserSkills()
    .map(userSkillToChatSkillFromCache)
    .find((skill) => skill.slashCommand.toLowerCase() === normalized);
}

export function filterSkillsForScope(
  skills: ChatSkillDefinition[],
  mediaMode: MediaMode,
  behaviorMode: BehaviorMode,
): ChatSkillDefinition[] {
  return skills.filter((skill) =>
    isSkillCompatibleWithScope(skill, { mediaMode, behaviorMode }),
  );
}

/** Built-ins respect the current scope; user skills always appear in the slash menu. */
export function skillsForSlashMenu(
  skills: ChatSkillDefinition[],
  mediaMode: MediaMode,
  behaviorMode: BehaviorMode,
): ChatSkillDefinition[] {
  const compatibleBuiltins = filterSkillsForScope(
    skills.filter((skill) => skill.builtin),
    mediaMode,
    behaviorMode,
  );
  const userSkills = skills.filter((skill) => !skill.builtin);
  const seen = new Set<string>();
  return [...userSkills, ...compatibleBuiltins].filter((skill) => {
    if (seen.has(skill.id)) return false;
    seen.add(skill.id);
    return true;
  });
}

export function resolveScopePatchForSkill(
  skill: ChatSkillDefinition,
  currentScope: Pick<ConversationScope, "mediaMode" | "behaviorMode">,
): Pick<ConversationScope, "mediaMode" | "behaviorMode" | "skillId"> {
  const mediaMode = skill.mediaModes.includes(currentScope.mediaMode)
    ? currentScope.mediaMode
    : skill.mediaModes[0];

  const behaviorMode = skill.behaviorModes.includes(currentScope.behaviorMode)
    ? currentScope.behaviorMode
    : skill.behaviorModes.includes("draft")
      ? "draft"
      : skill.behaviorModes[0];

  return {
    mediaMode,
    behaviorMode,
    skillId: skill.id,
  };
}

export function isSkillCompatibleWithScope(
  skill: ChatSkillDefinition,
  scope: Pick<ConversationScope, "mediaMode" | "behaviorMode">,
): boolean {
  return (
    skill.mediaModes.includes(scope.mediaMode) &&
    skill.behaviorModes.includes(scope.behaviorMode)
  );
}

/** Apply a skill without changing the user's media or behavior mode selection. */
export function scopeWithSkill(
  scope: ConversationScope,
  skillId: string,
): ConversationScope {
  return { ...scope, skillId };
}

export interface SlashParseResult {
  skillId: string | null;
  userText: string;
}

export function parseSlashCommand(input: string): SlashParseResult {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) {
    return { skillId: null, userText: input };
  }

  const spaceIndex = trimmed.indexOf(" ");
  const commandToken =
    spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1);

  const skill = getSkillBySlashCommand(commandToken);
  if (!skill) {
    return { skillId: null, userText: input };
  }

  return {
    skillId: skill.id,
    userText: rest.trim(),
  };
}

export function filterSkillsByQuery(
  skills: ChatSkillDefinition[],
  query: string,
): ChatSkillDefinition[] {
  const normalized = query.trim().toLowerCase().replace(/^\//, "");
  if (!normalized) return skills;

  return skills.filter((skill) => {
    const command = skill.slashCommand.replace(/^\//, "");
    return (
      command.startsWith(normalized) ||
      skill.label.toLowerCase().includes(normalized) ||
      skill.id.includes(normalized)
    );
  });
}
