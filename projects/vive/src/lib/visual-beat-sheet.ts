import type { StoryboardCard } from "./project";
import { buildStoryboardPrompt } from "./storyboard";
import { AGENT_MODE_CHUNK_DURATION_SEC } from "./openrouter-models";

export interface VisualBeat {
  beatNumber: number;
  shotType: StoryboardCard["shotType"];
  estimatedDurationSec: number;
  visualDescription: string;
  characterAction: string;
  dialogue: string;
  dialogueSpeaker: string;
  voiceover: string;
  sfx: string;
  musicCue: string;
}

const BEAT_HEADER_PATTERN =
  /^Beat\s+(\d+)\s*\(([^)]+)\)\s*:\s*(.*)$/i;
const BEAT_LINE_PATTERN = /^Beat\s+\d+\s*\(/i;
const DIALOGUE_PATTERN = /^DIALOGUE\s*\(([^)]+)\)\s*:\s*(.+)$/i;
const VOICEOVER_PATTERN = /^VOICEOVER\s*:\s*(.+)$/i;
const ACTION_PATTERN = /^ACTION\s*:\s*(.+)$/i;
const SFX_PATTERN = /^SFX\s*:\s*(.+)$/i;
const MUSIC_PATTERN = /^MUSIC(?:\s+CUE)?\s*:\s*(.+)$/i;

const METADATA_LINE_PATTERN =
  /^(?:title\s*:|duration\s*:|logline\s*:|synopsis\s*:|overview\s*:|opening\s*:|scene\s+\d+\s*:|act\s+\d+\b|fade\s+in\s*:|notes?\s*:|title\s+card)/i;

function stripMarkdown(value: string): string {
  return value.replace(/\*\*/g, "").replace(/\*/g, "").trim();
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseShotTypeFromBeatHeader(header: string): StoryboardCard["shotType"] {
  const normalized = header.toUpperCase();
  if (normalized.includes("EXTREME CLOSE") || /\bECU\b/.test(normalized)) {
    return "ECU";
  }
  if (normalized.includes("MEDIUM CLOSE") || /\bMCU\b/.test(normalized)) {
    return "MCU";
  }
  if (/\bCU\b/.test(normalized) || /CLOSE[-\s]?(?:UP|ON)\b/.test(normalized)) {
    return "CU";
  }
  if (normalized.includes("EXTREME WIDE") || /\bEWS\b/.test(normalized)) {
    return "EWS";
  }
  if (/\bWS\b/.test(normalized) || /\bWIDE\b/.test(normalized)) {
    return "WS";
  }
  if (/\bMS\b/.test(normalized) || /\bMEDIUM\b/.test(normalized)) {
    return "MS";
  }
  return "MS";
}

function parseDurationFromBeatHeader(
  header: string,
  fallbackSec: number,
): number {
  const match = /(\d+)\s*s(?:ec(?:ond)?s?)?/i.exec(header);
  if (!match) {
    return fallbackSec;
  }
  return Math.max(
    1,
    Math.min(AGENT_MODE_CHUNK_DURATION_SEC, Number.parseInt(match[1], 10) || fallbackSec),
  );
}

/** Minimum seconds a single beat should hold for readable pacing. */
export const MIN_BEAT_DURATION_SEC = 2;

/** Maximum seconds a single beat should hold before feeling sluggish. */
export const MAX_BEAT_DURATION_SEC = 8;

/**
 * Returns a content-appropriate beat count range for a given target duration.
 * - Minimum: at most one beat per 8 seconds (slow, deliberate storytelling)
 * - Maximum: at least one beat per 2 seconds (fast-cut action pacing)
 */
export function estimateBeatRange(targetDurationSec: number): { min: number; max: number } {
  const duration = Math.max(1, Math.round(targetDurationSec));
  const min = Math.max(2, Math.ceil(duration / MAX_BEAT_DURATION_SEC));
  const max = Math.min(24, Math.floor(duration / MIN_BEAT_DURATION_SEC));
  return { min, max: Math.max(min, max) };
}

/**
 * Guidance for matching a creative brief to the selected runtime.
 * Helps the script agent expand thin prompts or compress long stories.
 */
export function buildBriefDurationGuidance(
  brief: string,
  targetDurationSec: number,
): string {
  const trimmed = brief.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const { min, max } = estimateBeatRange(targetDurationSec);

  if (wordCount < 15 && targetDurationSec >= 30) {
    return (
      `Brief/runtime note: The brief is short (${wordCount} words) but the target is ${targetDurationSec}s. ` +
      `Invent a complete visual story arc with setup, escalation, and payoff. ` +
      `Use ${min}–${max} beats with varied shot types — do not pad with title cards or static holds.`
    );
  }

  if (wordCount < 8 && targetDurationSec >= 15) {
    return (
      `Brief/runtime note: The brief is very short (${wordCount} words) for a ${targetDurationSec}s video. ` +
      `Expand it into a full visual narrative with character motivation, environment detail, and escalating action. ` +
      `Let the story determine beat count (${min}–${max} beats); do not default to a fixed number.`
    );
  }

  if (wordCount >= 80 && targetDurationSec <= 15) {
    return (
      `Brief/runtime note: The brief is detailed (${wordCount} words) but the runtime is only ${targetDurationSec}s. ` +
      `Select the ${min}–${max} most visually essential story beats. Cut subplots and compress dialogue so every beat earns its screen time.`
    );
  }

  if (wordCount >= 40 && targetDurationSec <= 20) {
    return (
      `Brief/runtime note: The brief has substantial content (${wordCount} words) for a ${targetDurationSec}s video. ` +
      `Prioritize the strongest visual moments and aim for ${min}–${max} beats. Merge or omit beats that do not advance the core story.`
    );
  }

  return "";
}

export type BriefAdaptationMode = "expand" | "preserve";

export function resolveBriefAdaptationMode(brief: string): BriefAdaptationMode {
  const trimmed = brief.trim();
  if (!trimmed) {
    return "expand";
  }

  const nonEmptyLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const structuredLineCount = nonEmptyLines.filter((line) =>
    /^(?:[-*]\s+|#{1,6}\s+|\d+\.\s+|\*\*\[|Beat\s+\d+\s*\(|ACTION\s*:|DIALOGUE\b|VOICEOVER\s*:|SFX\s*:)/i.test(
      line,
    ) || /:\s+/.test(line),
  ).length;

  const detailSignals = [
    wordCount >= 60,
    nonEmptyLines.length >= 6,
    structuredLineCount >= 4,
    /```/.test(trimmed),
    /\b(?:ACTION|DIALOGUE|VOICEOVER|SFX|Beat)\b/i.test(trimmed),
    /\*\*[^\n]+\*\*/.test(trimmed),
  ];

  const score = detailSignals.filter(Boolean).length;
  return score >= 2 ? "preserve" : "expand";
}

export function buildBriefAdaptationGuidance(
  brief: string,
  targetDurationSec: number,
): string {
  const mode = resolveBriefAdaptationMode(brief);
  const { min, max } = estimateBeatRange(targetDurationSec);

  if (mode === "preserve") {
    return (
      `Source adaptation mode: The brief is already detailed or structured. ` +
      "Treat it as source material to preserve, not a loose vibe to replace. " +
      "Keep the original narrative order, featured subjects, named characters or teams, signature actions, major reveals, matchup screens, pauses, and ending mechanics whenever the runtime allows. " +
      "Translate or reorganize the source into the beat-sheet format, but do not flatten distinct moments into a generic lineup, montage, or rivalry template. " +
      `If runtime pressure forces compression, keep the core opener, the main set-piece escalation, and the ending payoff while fitting within ${min}–${max} beats.`
    );
  }

  return (
    `Source adaptation mode: The brief is sparse, so you should invent missing connective tissue and cinematic structure. ` +
    `Build a complete visual arc with setup, escalation, and payoff, using whatever beat count between ${min} and ${max} best fits the idea. ` +
    "Choose strong defaults instead of asking for more detail, but stay consistent with the tone and medium implied by the brief."
  );
}

export interface BeatSheetValidation {
  beatCount: number;
  totalDurationSec: number;
  issues: string[];
}

/** Checks whether a beat sheet fits the target runtime and beat-count range. */
export function validateBeatSheetForTarget(
  scriptContent: string,
  targetDurationSec: number,
): BeatSheetValidation {
  const beats = parseVisualBeatSheet(scriptContent);
  const { min, max } = estimateBeatRange(targetDurationSec);
  const totalDurationSec = beats.reduce(
    (sum, beat) => sum + beat.estimatedDurationSec,
    0,
  );
  const issues: string[] = [];

  if (beats.length < min) {
    issues.push(
      `Only ${beats.length} beat(s) — use at least ${min} for ${targetDurationSec}s to avoid sluggish pacing.`,
    );
  }
  if (beats.length > max) {
    issues.push(
      `${beats.length} beats exceeds the ${max}-beat maximum for ${targetDurationSec}s. Merge or cut beats.`,
    );
  }
  if (totalDurationSec > targetDurationSec + 1) {
    issues.push(
      `Beat durations sum to ${totalDurationSec}s, exceeding the ${targetDurationSec}s budget. Shorten or merge beats.`,
    );
  }
  if (beats.length >= 8 && beats.length % 8 === 0 && beats.every((beat) => beat.estimatedDurationSec === 4)) {
    issues.push(
      "Beat sheet looks like a fixed template (equal 4s beats). Vary durations and let content determine beat count.",
    );
  }

  return { beatCount: beats.length, totalDurationSec, issues };
}

/** @deprecated Use estimateBeatRange for prompt generation; kept for compatibility. */
export function estimateBeatCount(targetDurationSec: number): number {
  const { min, max } = estimateBeatRange(targetDurationSec);
  return Math.round((min + max) / 2);
}

export function buildVisualBeatSheetFormatRules(
  targetDurationSec: number,
): string {
  const { min, max } = estimateBeatRange(targetDurationSec);

  return `Runtime constraints:
- Target approximately ${targetDurationSec} seconds total runtime. Do not exceed it.
- Beat count is determined by story content, NOT a default number. Write between ${min} and ${max} beats — use exactly as many as the story naturally requires. Never default to 8 beats or any fixed count.
- If the brief is short or vague, develop and expand it into a full story arc that fills the target runtime with meaningful visual beats.
- If the brief is already a detailed script, trailer copy, treatment, or scene outline, preserve its narrative spine, featured subjects, signature actions, and ending structure. Convert it into beat-sheet form instead of replacing it with a generic template.
- If the brief describes more content than the runtime allows, select the most visually compelling and narratively essential moments to fit within ${targetDurationSec} seconds.
- Each beat is one complete camera setup and one storyboard panel. Never split a single shot across two beats, and never end a beat mid-action.
- Vary beat durations for professional pacing: use ${MIN_BEAT_DURATION_SEC}–3s for fast action and reaction shots, 4–5s for dialogue and moderate action, 6–${MAX_BEAT_DURATION_SEC}s for emotional moments and establishing shots. Beat durations must sum to ≤ ${targetDurationSec}s.
- Every beat must be a complete drawable shot that can stand alone as one storyboard panel.

Format rules (follow exactly):
- Output plain text only. No markdown, no bold, no title line, no "Title:", no "[SCENE START]", no title cards, no montage shorthand like "[FAST CUTS: ...]".
- Do not use screenplay sluglines (INT./EXT.), "FADE TO BLACK", or character-cue blocks.
- Start with one STYLE line describing look, setting, and mood.
- Then write beats in this format:

Beat 1 (WS, 4s): What the camera sees — composition, environment, lighting.
ACTION: Character blocking and movement for this shot.
DIALOGUE (CHARACTER): "Spoken line for this shot only."
SFX: Optional sound effects.

- Use shot types in beat headers: ECU, CU, MCU, MS, WS, or EWS.
- Put spoken lines in DIALOGUE (SPEAKER) on separate lines — one short line per beat when possible (~2-3 words per second).
- Use VOICEOVER: for narration instead of on-screen dialogue when appropriate.
- Beat content must be visual and drawable. Never describe metadata, scene labels, or "scene starts".
- When adapting detailed source material, keep distinct introduction beats distinct unless compression is necessary for runtime.
- Beat 1 must begin with the first visual story action immediately — not a title, slugline, or setup note.
- End with one TONE line describing emotional finish and production style.
- Do not request on-screen text, logos, or title cards. End on a visual story beat.`;
}

export function buildBeatSheetSystemPrompt(
  targetDurationSec: number,
  styleBrief?: string,
): string {
  const trimmedStyle = styleBrief?.trim() ?? "";
  const styleDirective = trimmedStyle
    ? `\n\nRequired art direction (mandatory):\n${trimmedStyle}\nThe STYLE line MUST reflect this art direction. Every beat's lighting, palette, medium, and mood must stay consistent with it. Do not invent a conflicting style.`
    : "";

  return `You are an expert short-form video storyboard writer. Write a visual beat sheet — one drawable storyboard panel per beat — for AI image and video generation.

${buildVisualBeatSheetFormatRules(targetDurationSec)}${styleDirective}

Output only the beat sheet.`;
}

export function buildBeatSheetCritiqueSystemPrompt(
  targetDurationSec: number,
  styleBrief?: string,
): string {
  const trimmedStyle = styleBrief?.trim() ?? "";
  const styleDirective = trimmedStyle
    ? ` Also check that STYLE and beat visuals stay faithful to this required art direction: ${trimmedStyle}.`
    : "";
  const { min, max } = estimateBeatRange(targetDurationSec);
  return (
    `You are a visual beat-sheet critic for short-form AI video. Evaluate hook strength, pacing, whether each beat is a single complete drawable panel (never mid-shot), dialogue length vs beat duration, beat-count fit (${min}–${max} beats for ${targetDurationSec}s), brief-vs-runtime balance, source fidelity, and visual clarity. ` +
    "When the original brief is detailed or structured, explicitly flag lost narrative order, omitted featured subjects, collapsed signature actions, missing set-piece moments, and rewritten endings. " +
    `Flag fixed-template beat sheets (e.g. always 8 beats at 4s each). Flag beats that would be cut off mid-action when segmented into 15s clips.${styleDirective} Be concise.`
  );
}

export function buildBeatSheetRewriteSystemPrompt(
  targetDurationSec: number,
  styleBrief?: string,
): string {
  const { min, max } = estimateBeatRange(targetDurationSec);
  const trimmedStyle = styleBrief?.trim() ?? "";
  const styleDirective = trimmedStyle
    ? ` Keep the STYLE line and all visual direction faithful to this required art direction: ${trimmedStyle}.`
    : "";
  return `You are a visual beat-sheet rewriter. Improve the beat sheet while preserving beat-sheet format (STYLE line, Beat N (SHOT, Xs): lines, optional ACTION/DIALOGUE/SFX fields, TONE line). You may adjust the beat count (between ${min} and ${max} beats) if the critique requires merging or splitting beats for better pacing and visual clarity — do not force a fixed count. Total runtime must stay at or below ${targetDurationSec} seconds.${styleDirective} Vary beat durations for professional pacing — shorter beats for action/reaction, longer for emotional moments. Preserve fidelity to the original brief when it is detailed: keep narrative order, featured subjects, signature actions, set pieces, pauses, and ending mechanics unless a change is required to satisfy runtime or clarity. Do not flatten distinct beats into a generic lineup, montage, or versus-template rewrite. Output only the revised beat sheet. Plain text, no markdown.`;
}

export function normalizeVisualBeatSheet(scriptContent: string): string {
  const lines = scriptContent.split("\n").map((line) => stripMarkdown(line.trimEnd()));

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }
    if (METADATA_LINE_PATTERN.test(trimmed)) {
      return false;
    }
    if (/^\[(?:scene\s+(?:start|end)|fast\s+cuts)/i.test(trimmed)) {
      return false;
    }
    return true;
  });

  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function isVisualBeatSheet(scriptContent: string): boolean {
  const normalized = normalizeVisualBeatSheet(scriptContent);
  const beatMatches = normalized.match(/^Beat\s+\d+\s*\(/gim);
  return (beatMatches?.length ?? 0) >= 2;
}

function parseBeatBlock(lines: string[], defaultDurationSec: number): VisualBeat | null {
  if (lines.length === 0) {
    return null;
  }

  const headerMatch = BEAT_HEADER_PATTERN.exec(lines[0].trim());
  if (!headerMatch) {
    return null;
  }

  const beatNumber = Number.parseInt(headerMatch[1], 10);
  const headerMeta = headerMatch[2];
  const visualDescription = headerMatch[3].trim();

  let characterAction = "";
  let dialogue = "";
  let dialogueSpeaker = "";
  let voiceover = "";
  let sfx = "";
  let musicCue = "";

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;

    const dialogueMatch = DIALOGUE_PATTERN.exec(line);
    if (dialogueMatch) {
      dialogueSpeaker = dialogueMatch[1].trim();
      dialogue = stripWrappingQuotes(dialogueMatch[2]);
      continue;
    }

    const voiceoverMatch = VOICEOVER_PATTERN.exec(line);
    if (voiceoverMatch) {
      voiceover = stripWrappingQuotes(voiceoverMatch[1]);
      continue;
    }

    const actionMatch = ACTION_PATTERN.exec(line);
    if (actionMatch) {
      characterAction = actionMatch[1].trim();
      continue;
    }

    const sfxMatch = SFX_PATTERN.exec(line);
    if (sfxMatch) {
      sfx = sfxMatch[1].trim();
      continue;
    }

    const musicMatch = MUSIC_PATTERN.exec(line);
    if (musicMatch) {
      musicCue = musicMatch[1].trim();
      continue;
    }
  }

  return {
    beatNumber,
    shotType: parseShotTypeFromBeatHeader(headerMeta),
    estimatedDurationSec: parseDurationFromBeatHeader(
      headerMeta,
      defaultDurationSec,
    ),
    visualDescription,
    characterAction,
    dialogue,
    dialogueSpeaker,
    voiceover,
    sfx,
    musicCue,
  };
}

export function parseVisualBeatSheet(scriptContent: string): VisualBeat[] {
  const normalized = normalizeVisualBeatSheet(scriptContent);
  const lines = normalized.split("\n");
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }

    if (BEAT_LINE_PATTERN.test(trimmed) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [trimmed];
      continue;
    }

    if (BEAT_LINE_PATTERN.test(trimmed)) {
      currentBlock = [trimmed];
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(trimmed);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const defaultDurationSec = 4;
  const beats: VisualBeat[] = [];

  for (const block of blocks) {
    const beat = parseBeatBlock(block, defaultDurationSec);
    if (beat && beat.visualDescription.length > 0) {
      beats.push(beat);
    }
  }

  return beats.sort((a, b) => a.beatNumber - b.beatNumber);
}

function scaleBeatDurations(
  beats: VisualBeat[],
  targetDurationSec: number,
): VisualBeat[] {
  if (beats.length === 0) {
    return beats;
  }

  const duration = Math.max(1, Math.round(targetDurationSec));
  const sourceTotal = beats.reduce(
    (sum, beat) => sum + beat.estimatedDurationSec,
    0,
  );

  const scaled = beats.map((beat) => ({
    ...beat,
    estimatedDurationSec: Math.max(
      1,
      Math.round((beat.estimatedDurationSec / sourceTotal) * duration),
    ),
  }));

  const scaledTotal = scaled.reduce(
    (sum, beat) => sum + beat.estimatedDurationSec,
    0,
  );
  scaled[scaled.length - 1].estimatedDurationSec = Math.max(
    1,
    scaled[scaled.length - 1].estimatedDurationSec + duration - scaledTotal,
  );

  return scaled;
}

export function buildStoryboardCardsFromBeatSheet(
  scriptContent: string,
  targetDurationSec?: number,
): StoryboardCard[] {
  const beats = parseVisualBeatSheet(scriptContent);
  if (beats.length === 0) {
    return [];
  }

  const scaledBeats =
    typeof targetDurationSec === "number"
      ? scaleBeatDurations(beats, targetDurationSec)
      : beats;

  return scaledBeats.map((beat, index) => {
    const partial: Omit<StoryboardCard, "generationPrompt"> = {
      id: crypto.randomUUID(),
      sceneIndex: 0,
      shotIndex: index + 1,
      title: `Beat ${beat.beatNumber}: ${beat.visualDescription.slice(0, 48)}`,
      scriptSegment: `Beat ${beat.beatNumber}`,
      storyPurpose: `Story beat ${beat.beatNumber}`,
      shotDescription: beat.visualDescription,
      shotType: beat.shotType,
      cameraAngle: "eye-level",
      cameraMovement: "Static",
      characterAction: beat.characterAction,
      visualSketch: "",
      sceneGraph: null,
      blocking2d: null,
      dialogue: beat.dialogue,
      voiceover: beat.voiceover,
      sfx: beat.sfx,
      musicCue: beat.musicCue,
      continuity: "",
      estimatedDurationSec: beat.estimatedDurationSec,
      transitionOut: "cut",
      negativePrompt:
        "No extra limbs, no warped faces, no text overlays, no logo watermarks",
      status: "draft",
    };

    return {
      ...partial,
      generationPrompt: buildStoryboardPrompt(partial as StoryboardCard),
    };
  });
}

export function extractStyleBriefFromBeatSheet(beatSheetContent: string): string {
  const styleMatch = beatSheetContent.match(/^STYLE:\s*(.+)$/im);
  if (!styleMatch) {
    return "";
  }

  const styleBrief = styleMatch[1].trim();
  return styleBrief.length >= 3 ? styleBrief : "";
}

/** Force the STYLE line to match an explicit user style brief when provided. */
export function applyStyleBriefToBeatSheet(
  beatSheetContent: string,
  styleBrief: string,
): string {
  const trimmedStyle = styleBrief.trim();
  if (!trimmedStyle) {
    return beatSheetContent.trim();
  }

  const styleLine = `STYLE: ${trimmedStyle}`;
  const normalized = beatSheetContent.trim();
  if (/^STYLE:\s*.+$/im.test(normalized)) {
    return normalized.replace(/^STYLE:\s*.+$/im, styleLine);
  }
  return `${styleLine}\n\n${normalized}`;
}

export function extractScriptTitle(brief: string, beatSheetContent: string): string {
  const styleBrief = extractStyleBriefFromBeatSheet(beatSheetContent);
  if (styleBrief) {
    const styleHint = styleBrief.split(/[.,]/)[0]?.trim();
    if (styleHint && styleHint.length >= 3) {
      return styleHint.slice(0, 80);
    }
  }

  const briefLine = brief
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (briefLine) {
    return briefLine.slice(0, 80);
  }

  return "Agent Beat Sheet";
}
