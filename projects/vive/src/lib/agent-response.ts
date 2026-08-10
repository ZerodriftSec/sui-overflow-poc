import { buildScriptContextSection, type ContextReference } from "./agent-context";
import {
  AGENT_MODE_DEFAULT_TOTAL_DURATION_SEC,
} from "./openrouter-models";
import {
  buildVisualBeatSheetFormatRules,
  normalizeVisualBeatSheet,
} from "./visual-beat-sheet";

const THOUGHT_START = "<thought>";
const THOUGHT_END = "</thought>";
const SCRIPT_START = "<script>";
const SCRIPT_END = "</script>";
const PROMPT_START = "<prompt>";
const PROMPT_END = "</prompt>";

export interface ParsedAgentResponse {
  thought: string;
  script: string | null;
  hasScriptOutput: boolean;
  scriptComplete: boolean;
  prompt: string | null;
  hasPromptOutput: boolean;
  promptComplete: boolean;
}

export function parseAgentResponse(text: string): ParsedAgentResponse {
  const thoughtStart = text.indexOf(THOUGHT_START);
  const thoughtEnd = text.indexOf(THOUGHT_END);
  const scriptStart = text.indexOf(SCRIPT_START);
  const scriptEnd = text.indexOf(SCRIPT_END);
  const promptStart = text.indexOf(PROMPT_START);
  const promptEnd = text.indexOf(PROMPT_END);

  const artifactStart =
    scriptStart !== -1
      ? scriptStart
      : promptStart !== -1
        ? promptStart
        : -1;

  let thought = "";
  if (thoughtStart !== -1) {
    const contentStart = thoughtStart + THOUGHT_START.length;
    const contentEnd =
      thoughtEnd !== -1 ? thoughtEnd : artifactStart !== -1 ? artifactStart : text.length;
    thought = text.slice(contentStart, contentEnd).trim();
  } else if (artifactStart === -1) {
    thought = text.trim();
  }

  let script: string | null = null;
  let hasScriptOutput = false;
  let scriptComplete = false;

  if (scriptStart !== -1) {
    hasScriptOutput = true;
    const contentStart = scriptStart + SCRIPT_START.length;
    const contentEnd = scriptEnd !== -1 ? scriptEnd : text.length;
    script = text.slice(contentStart, contentEnd).trim();
    scriptComplete = scriptEnd !== -1;
  }

  let prompt: string | null = null;
  let hasPromptOutput = false;
  let promptComplete = false;

  if (promptStart !== -1) {
    hasPromptOutput = true;
    const contentStart = promptStart + PROMPT_START.length;
    const contentEnd = promptEnd !== -1 ? promptEnd : text.length;
    prompt = text.slice(contentStart, contentEnd).trim();
    promptComplete = promptEnd !== -1;
  }

  return {
    thought,
    script,
    hasScriptOutput,
    scriptComplete,
    prompt,
    hasPromptOutput,
    promptComplete,
  };
}

export function buildScriptPhaseSystemPrompt(
  references: ContextReference[],
  phase: string,
  targetDurationSec: number = AGENT_MODE_DEFAULT_TOTAL_DURATION_SEC,
): string {
  const contextSection = buildScriptContextSection(references);

  return `You are an AI assistant in a video production studio. You are helping with the "${phase}" phase.
Help the user refine, revise, and improve their visual beat sheet for AI storyboard and video generation. Be concise and actionable in your reasoning.
When rewriting, preserve the user's voice unless asked otherwise.

The script is a visual beat sheet — NOT a traditional screenplay. Each beat becomes one storyboard panel.

${buildVisualBeatSheetFormatRules(targetDurationSec)}

You must structure every response in exactly two parts using these XML tags:

1. <thought> — Your reasoning, analysis, and explanation of what you changed and why. This is shown to the user in the chat. Keep it concise and conversational.

2. <script> — The complete, polished visual beat sheet for the attached script being edited. This is applied directly to the script editor when present. Include the FULL revised beat sheet (not just changed sections). Do not use markdown code fences inside <script>. Additional reference scripts are context only unless the user explicitly asks you to merge or rewrite them.

Always include both tags in this order. The <script> section must contain the entire primary beat sheet ready for use.

${contextSection}`;
}

export function normalizeScriptAgentOutput(content: string): string {
  return normalizeVisualBeatSheet(content.trim());
}

export function normalizeDesignPromptOutput(content: string): string {
  return content.trim().replace(/^```[\w-]*\n?|\n?```$/g, "");
}

export function buildDefaultSystemPrompt(
  contextTitle: string | null,
  contextContent: string,
  phase: string,
): string {
  const title = contextTitle ?? "Untitled";
  const body = contextContent.trim() || "(empty)";

  return `You are an AI assistant in a video production studio. You are helping with the "${phase}" phase.
Help the user refine, revise, and improve their work. Be concise and actionable.
When suggesting rewrites, preserve the user's voice unless asked otherwise.

Current context ("${title}"):
---
${body}
---`;
}
