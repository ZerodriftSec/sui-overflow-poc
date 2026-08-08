import { buildScriptContextSection, formatContextBody, type ContextReference } from "./agent-context";
import {
  buildScriptPhaseSystemPrompt,
  normalizeDesignPromptOutput,
} from "./agent-response";
import type { ConversationScope } from "./chat-scope";
import { getChatCapabilities } from "./chat-scope";
import { getBuiltinSkill } from "./chat-skills";
import { loadAllChatSkills } from "./user-skills";

function resolveSkillPrompt(scope: ConversationScope): string | null {
  if (!scope.skillId) return null;

  const allSkills = loadAllChatSkills();
  const skill = allSkills.find((item) => item.id === scope.skillId);
  return skill?.systemPromptTemplate ?? getBuiltinSkill(scope.skillId)?.systemPromptTemplate ?? null;
}

function behaviorInstruction(behaviorMode: ConversationScope["behaviorMode"]): string {
  switch (behaviorMode) {
    case "ask":
      return "Answer questions, critique, and brainstorm. Do not overwrite content unless the user explicitly asks you to produce a revised artifact.";
    case "draft":
      return "Generate new content based on the user's request. Produce polished output ready for use.";
    case "edit":
      return "Revise the selected or attached content. Preserve the user's voice unless asked otherwise. Produce complete revised output when rewriting.";
    case "agent":
      return "Plan and execute multi-step creative work. Break complex goals into clear steps and produce actionable outputs.";
  }
}

function buildDesignPromptSkillSystemPrompt(
  scope: ConversationScope,
  references: ContextReference[],
): string {
  const skillPrompt = resolveSkillPrompt(scope);
  const contextSection =
    references.length > 0
      ? `\n\nReference context:\n\n${references
          .map(
            (ref) => `"${ref.title}":
---
${formatContextBody(ref.content)}
---`,
          )
          .join("\n\n")}`
      : buildScriptContextSection(references);

  const artifactLabel =
    scope.skillId === "environment"
      ? "environment image-generation prompt"
      : "character image-generation prompt";

  const skillSection = skillPrompt
    ? `\n\nActive skill instructions:\n${skillPrompt}`
    : "";

  return `You are an AI assistant in a video production studio helping create design prompts.
Be concise and actionable in your reasoning. When revising, preserve the user's intent unless asked otherwise.

You must structure every response in exactly two parts using these XML tags:

1. <thought> — Your reasoning and explanation. This is shown to the user in the chat. Keep it concise and conversational.

2. <prompt> — The complete, polished ${artifactLabel}. This is saved directly as a design asset when present. Include the FULL prompt (not just changed sections). Do not use markdown code fences inside <prompt>.

Always include both tags in this order. The <prompt> section must contain the entire prompt ready for use.${skillSection}${contextSection}`;
}

export function buildComposerSystemPrompt(
  scope: ConversationScope,
  attachedReferences: ContextReference[],
): string {
  const skillPrompt = resolveSkillPrompt(scope);
  const behavior = behaviorInstruction(scope.behaviorMode);
  const phase = scope.mediaMode === "text" ? "script" : scope.mediaMode === "image" ? "design" : "film";

  if (
    scope.mediaMode === "text" &&
    scope.skillId === "script" &&
    (scope.behaviorMode === "draft" || scope.behaviorMode === "edit")
  ) {
    return buildScriptPhaseSystemPrompt(attachedReferences, phase);
  }

  if (
    scope.mediaMode === "text" &&
    (scope.skillId === "character" || scope.skillId === "environment") &&
    (scope.behaviorMode === "draft" || scope.behaviorMode === "edit")
  ) {
    return buildDesignPromptSkillSystemPrompt(scope, attachedReferences);
  }

  const contextSection =
    attachedReferences.length > 0
      ? `\n\nReference context:\n\n${attachedReferences
          .map(
            (ref) => `"${ref.title}":
---
${formatContextBody(ref.content)}
---`,
          )
          .join("\n\n")}`
      : buildScriptContextSection(attachedReferences);

  const skillSection = skillPrompt
    ? `\n\nActive skill instructions:\n${skillPrompt}`
    : "";

  const videoSection =
    scope.mediaMode === "video"
      ? "\nHelp the user plan clips, refine generation prompts, and prepare reference images."
      : "";

  const imageSection =
    scope.mediaMode === "image"
      ? "\nHelp the user craft and refine image generation prompts and visual direction."
      : "";

  return `You are an AI assistant in a video production studio working in ${scope.mediaMode} mode.
Behavior: ${scope.behaviorMode}. ${behavior}
${videoSection}${imageSection}${skillSection}

Be concise and actionable.${contextSection}`;
}

export function shouldAutoApplyOutput(scope: ConversationScope): boolean {
  return getChatCapabilities(scope).autoApplyScriptOutput;
}

export function shouldAutoApplyDesignPromptOutput(
  scope: ConversationScope,
): boolean {
  return (
    scope.mediaMode === "text" &&
    (scope.behaviorMode === "draft" || scope.behaviorMode === "edit") &&
    (scope.skillId === "character" || scope.skillId === "environment")
  );
}

export { normalizeDesignPromptOutput };
