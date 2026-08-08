import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import {
  buildStoryboardPrompt,
  buildStoryboardCardsFromScript,
  splitScriptIntoScenes,
} from "./storyboard";
import type { StoryboardCard } from "./project";
import type { AppSettings } from "./settings";
import { parseStoryboardSceneGraphFromUnknown } from "./storyboard-scene-graph";
import { AGENT_MODE_CHUNK_DURATION_SEC } from "./openrouter-models";
import {
  buildStoryboardCardsFromBeatSheet,
  isVisualBeatSheet,
  normalizeVisualBeatSheet,
} from "./visual-beat-sheet";

export type StoryboardGenerationStatus =
  | "idle"
  | "analyzing"
  | "generating"
  | "parsing"
  | "generating-sheets"
  | "done"
  | "error"
  | "fallback";

// ─── Prompt ────────────────────────────────────────────────────────────────

function buildSystemPrompt(targetDurationSec: number): string {
  const chunkHint = Math.min(
    AGENT_MODE_CHUNK_DURATION_SEC,
    Math.max(1, Math.round(targetDurationSec)),
  );

  return `You are an expert storyboard supervisor and cinematographer. Your job is to read a visual beat sheet or script and convert it into a shot-by-shot storyboard that fits within a strict runtime budget.

CRITICAL REQUIREMENT: The total of all shot estimatedDurationSec values must not exceed ${targetDurationSec} seconds. Prioritize the most important story beats and compress or omit lower-priority moments to stay within budget.

Input format:
- If the source is a visual beat sheet (Beat 1 (WS, 4s): ...), map each beat to exactly one storyboard card unless a beat clearly contains multiple camera setups.
- Preserve dialogue, voiceover, and action from each beat in the correct card fields.

Shot creation guidelines:
- Create only as many shots as needed to cover the key beats within ${targetDurationSec} seconds
- Prefer fewer, tighter shots when the runtime budget is short
- Cover essential dialogue with close-up or medium close-up shots
- Keep estimatedDurationSec realistic and sum to <= ${targetDurationSec}
- Structure shots so they can be grouped into ${chunkHint}-second video chunks
- ONE STORYBOARD CARD = ONE CAMERA SETUP. Never combine multiple camera shots into one card.
- shotDescription must describe only what is visible in this single shot. Do not paste beat labels, timestamps, dialogue blocks, or later shots into shotDescription.
- The FIRST storyboard card must begin with the first visual story action immediately. Never use the project title, STYLE line, "opening shot", "scene starts", or setup metadata as the first shotDescription.
- Put spoken lines in dialogue, narration in voiceover, and blocking in characterAction — not in shotDescription.
- Write like production notes: short, declarative, specific. The ideal shotDescription is one sentence; characterAction is a punchy movement/blocking note.
- Keep cameraMovement to one clear instruction such as "Static", "Slow dolly in", "Handheld push-in", or "Whip-pan right".

Shot type reference:
• ECU — Extreme Close-Up (eyes, small object, critical detail)
• CU  — Close-Up (face, hand, reaction)
• MCU — Medium Close-Up (head and shoulders, dialogue coverage)
• MS  — Medium Shot (waist up, normal coverage)
• WS  — Wide Shot (full body in environment, action staging)
• EWS — Extreme Wide Shot (location establishing, scale)

Camera angles: eye-level | high-angle | low-angle | birds-eye | dutch
Transitions: cut (hard cut — default for all shots; use match-cut only when visually motivated; avoid dissolves, fades, and wipes)

Output format:
Return ONLY a raw JSON array. No markdown, no code fences, no explanation — just the array starting with [ and ending with ].

Each element must have exactly these fields:
{
  "title": "Scene N: Descriptive shot name",
  "sceneIndex": <0-based integer matching the scene number>,
  "scriptSegment": "Precise location in script this shot covers (e.g. Scene 3 opening beat, midpoint confrontation, final line before transition)",
  "shotDescription": "Vivid, precise description of what the camera sees — composition, subject position, environment details, lighting mood",
  "shotType": "MS",
  "cameraAngle": "eye-level",
  "cameraMovement": "Static / Slow pan right / Dolly in / etc.",
  "characterAction": "What characters are doing — body language, movement, blocking",
  "dialogue": "Exact dialogue spoken during this shot, or empty string if none",
  "voiceover": "Voiceover narration text, or empty string",
  "sfx": "Key sound effects, or empty string",
  "musicCue": "Music direction or mood, or empty string",
  "estimatedDurationSec": 4,
  "transitionOut": "cut",
  "storyPurpose": "The narrative or emotional job this shot performs in the story"
}`;
}

const USER_PROMPT_PREFIX =
  "Convert the following visual beat sheet into storyboard cards that fit the runtime budget. Do not exceed the total duration limit.\n\nBEAT SHEET:\n\n";

function normalizeStoryboardScript(scriptContent: string): string {
  return normalizeVisualBeatSheet(scriptContent);
}

const SCENE_HEADING_PATTERN = /^(?:INT|EXT|INT\/EXT|EST)\./i;
const METADATA_ONLY_LINE_PATTERN =
  /^(?:title\s*:|duration\s*:|logline\s*:|synopsis\s*:|overview\s*:|opening\s*:|scene\s+\d+\s*:|act\s+\d+\b|fade\s+in\s*:|notes?\s*:|style\s*:|tone\s*:)/i;

function sanitizeShotDescription(
  value: string,
  fallback: string,
  sceneIndex: number,
): string {
  const cleaned = value
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !SCENE_HEADING_PATTERN.test(line) &&
        !METADATA_ONLY_LINE_PATTERN.test(line),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0) {
    return cleaned;
  }

  return (
    fallback.trim() ||
    `Begin with a clear visual action beat for scene ${sceneIndex + 1}.`
  );
}

// ─── Zod schema ────────────────────────────────────────────────────────────

const llmCardSchema = z.object({
  title: z.string(),
  sceneIndex: z.number(),
  scriptSegment: z.string(),
  shotDescription: z.string().min(1),
  shotType: z.enum(["ECU", "CU", "MCU", "MS", "WS", "EWS"]),
  cameraAngle: z.enum([
    "eye-level",
    "high-angle",
    "low-angle",
    "birds-eye",
    "dutch",
  ]),
  cameraMovement: z.string(),
  characterAction: z.string(),
  dialogue: z.string(),
  voiceover: z.string(),
  sfx: z.string(),
  musicCue: z.string(),
  estimatedDurationSec: z.number(),
  transitionOut: z.enum([
    "cut",
    "dissolve",
    "fade-to-black",
    "wipe",
    "match-cut",
  ]),
  storyPurpose: z.string(),
  sceneGraph: z.unknown().optional(),
});

type LLMCardInput = z.infer<typeof llmCardSchema>;

function parseSceneGraphFromCardInput(
  sceneGraph: unknown,
): StoryboardCard["sceneGraph"] {
  if (sceneGraph == null) return null;
  return parseStoryboardSceneGraphFromUnknown(sceneGraph);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function coerceCardField<T>(
  value: unknown,
  defaultValue: T,
  validator: (v: unknown) => v is T,
): T {
  return validator(value) ? value : defaultValue;
}

const VALID_SHOT_TYPES = new Set(["ECU", "CU", "MCU", "MS", "WS", "EWS"]);
const VALID_ANGLES = new Set([
  "eye-level",
  "high-angle",
  "low-angle",
  "birds-eye",
  "dutch",
]);
const VALID_TRANSITIONS = new Set([
  "cut",
  "dissolve",
  "fade-to-black",
  "wipe",
  "match-cut",
]);

function isShotType(v: unknown): v is StoryboardCard["shotType"] {
  return typeof v === "string" && VALID_SHOT_TYPES.has(v);
}
function isCameraAngle(v: unknown): v is StoryboardCard["cameraAngle"] {
  return typeof v === "string" && VALID_ANGLES.has(v);
}
function isTransitionOut(v: unknown): v is StoryboardCard["transitionOut"] {
  return typeof v === "string" && VALID_TRANSITIONS.has(v);
}

function llmCardToStoryboardCard(
  input: LLMCardInput,
  index: number,
): StoryboardCard {
  const cleanTitle = input.title.trim() || `Shot ${index + 1}`;
  const cleanShotDescription = sanitizeShotDescription(
    input.shotDescription,
    input.characterAction,
    input.sceneIndex,
  );
  const partial: Omit<StoryboardCard, "generationPrompt"> = {
    id: crypto.randomUUID(),
    sceneIndex: input.sceneIndex,
    shotIndex: index + 1,
    title: cleanTitle,
    scriptSegment: input.scriptSegment,
    storyPurpose: input.storyPurpose,
    shotDescription: cleanShotDescription,
    shotType: coerceCardField(input.shotType, "MS" as const, isShotType),
    cameraAngle: coerceCardField(
      input.cameraAngle,
      "eye-level" as const,
      isCameraAngle,
    ),
    cameraMovement: input.cameraMovement,
    characterAction: input.characterAction,
    visualSketch: "",
    sceneGraph: parseSceneGraphFromCardInput(input.sceneGraph),
    blocking2d: null,
    dialogue: input.dialogue,
    voiceover: input.voiceover,
    sfx: input.sfx,
    musicCue: input.musicCue,
    continuity: "",
    estimatedDurationSec: Math.max(
      1,
      Math.min(
        AGENT_MODE_CHUNK_DURATION_SEC,
        Math.round(input.estimatedDurationSec),
      ),
    ),
    transitionOut: coerceCardField(
      input.transitionOut,
      "cut" as const,
      isTransitionOut,
    ),
    negativePrompt:
      "No extra limbs, no warped faces, no text overlays, no logo watermarks",
    status: "draft",
  };

  return {
    ...partial,
    generationPrompt: buildStoryboardPrompt(partial as StoryboardCard),
  };
}

/**
 * Strips markdown code fences and locates the outermost JSON array in text.
 */
function extractJsonArray(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("[")) return inner;
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

/**
 * Attempts lenient parsing of potentially-malformed LLM JSON by stripping
 * trailing commas before closing brackets/braces.
 */
function lenientParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    return JSON.parse(cleaned);
  }
}

/**
 * Parses the raw LLM text into an array of validated StoryboardCard objects.
 * Skips individual cards that fail schema validation rather than throwing.
 */
function parseCardsFromText(text: string): StoryboardCard[] {
  const jsonText = extractJsonArray(text);
  const parsed = lenientParse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error("LLM response is not a JSON array");
  }

  const cards: StoryboardCard[] = [];
  for (const item of parsed) {
    const result = llmCardSchema.safeParse(item);
    if (result.success) {
      cards.push(llmCardToStoryboardCard(result.data, cards.length));
    } else {
      // Attempt a loose coerce for cards that are mostly correct
      const loose = llmCardSchema.partial().safeParse(item);
      if (loose.success && loose.data.shotDescription) {
        const coerced: LLMCardInput = {
          title: String(item?.title ?? `Shot ${cards.length + 1}`),
          sceneIndex: Number(item?.sceneIndex ?? cards.length),
          scriptSegment: String(item?.scriptSegment ?? ""),
          shotDescription: String(item?.shotDescription ?? ""),
          shotType: isShotType(item?.shotType) ? item.shotType : "MS",
          cameraAngle: isCameraAngle(item?.cameraAngle)
            ? item.cameraAngle
            : "eye-level",
          cameraMovement: String(item?.cameraMovement ?? "Static"),
          characterAction: String(item?.characterAction ?? ""),
          dialogue: String(item?.dialogue ?? ""),
          voiceover: String(item?.voiceover ?? ""),
          sfx: String(item?.sfx ?? ""),
          musicCue: String(item?.musicCue ?? ""),
          estimatedDurationSec: Number(item?.estimatedDurationSec ?? 4) || 4,
          transitionOut: isTransitionOut(item?.transitionOut)
            ? item.transitionOut
            : "cut",
          storyPurpose: String(item?.storyPurpose ?? ""),
          sceneGraph: item?.sceneGraph,
        };
        cards.push(llmCardToStoryboardCard(coerced, cards.length));
      }
    }
  }

  return cards;
}

function validateBeatCoverage(
  cards: StoryboardCard[],
  scriptContent: string,
): void {
  const beatMatches = scriptContent.match(/^Beat\s+\d+\s*\(/gim);
  const expectedBeats = beatMatches?.length ?? 0;
  if (expectedBeats === 0) {
    return;
  }
  if (cards.length < Math.max(1, expectedBeats - 1)) {
    throw new Error(
      `Storyboard has ${cards.length} cards but beat sheet defines ${expectedBeats} beats`,
    );
  }
}

function validateSceneCoverage(
  cards: StoryboardCard[],
  scriptContent: string,
): void {
  if (isVisualBeatSheet(scriptContent)) {
    validateBeatCoverage(cards, scriptContent);
    return;
  }

  const scenes = splitScriptIntoScenes(scriptContent);
  if (scenes.length === 0) return;

  const covered = new Set(
    cards
      .map((card) => card.sceneIndex)
      .filter((index) => Number.isInteger(index) && index >= 0),
  );

  const missing: number[] = [];
  for (let index = 0; index < scenes.length; index += 1) {
    if (!covered.has(index)) {
      missing.push(index + 1);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Storyboard is missing script coverage for scene(s): ${missing.join(", ")}`,
    );
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface StoryboardGenerationResult {
  cards: StoryboardCard[];
  usedFallback: boolean;
  error?: string;
  usedModelId?: string;
}

export type OnStatusChange = (status: StoryboardGenerationStatus) => void;

/**
 * Generates storyboard cards from a script using an LLM.
 *
 * The LLM receives the full script and is instructed to produce a
 * comprehensive shot-by-shot breakdown covering every scene and beat.
 *
 * Falls back to the algorithmic parser if the LLM call fails or returns
 * unusable output.
 */
export async function generateStoryboardCardsWithLLM(
  scriptContent: string,
  settings: AppSettings,
  modelId: string,
  onStatus?: OnStatusChange,
  signal?: AbortSignal,
  options?: {
    targetDurationSec?: number;
  },
): Promise<StoryboardGenerationResult> {
  const normalizedScript = normalizeStoryboardScript(scriptContent);
  const targetDurationSec = Math.max(
    1,
    Math.round(options?.targetDurationSec ?? AGENT_MODE_CHUNK_DURATION_SEC),
  );
  onStatus?.("analyzing");

  if (isVisualBeatSheet(normalizedScript)) {
    onStatus?.("parsing");
    const beatSheetCards = buildStoryboardCardsFromBeatSheet(
      normalizedScript,
      targetDurationSec,
    );
    if (beatSheetCards.length > 0) {
      onStatus?.("done");
      return {
        cards: beatSheetCards,
        usedFallback: false,
        usedModelId: modelId,
      };
    }
  }

  try {
    const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });

    onStatus?.("generating");
    const { text } = await generateText({
      model: openrouter.chat(modelId),
      system: buildSystemPrompt(targetDurationSec),
      prompt: `${USER_PROMPT_PREFIX}${normalizedScript}\n\nMaximum total runtime: ${targetDurationSec} seconds.`,
      temperature: 0.4,
      abortSignal: signal,
    });

    onStatus?.("parsing");

    const cards = parseCardsFromText(text);
    if (cards.length === 0) {
      throw new Error(
        "LLM returned no valid storyboard cards. Response may be malformed.",
      );
    }
    validateSceneCoverage(cards, normalizedScript);

    onStatus?.("done");
    return { cards, usedFallback: false, usedModelId: modelId };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    const message =
      err instanceof Error
        ? err.message
        : "Unknown error during LLM generation";

    onStatus?.("fallback");

    const fallbackCards = isVisualBeatSheet(normalizedScript)
      ? buildStoryboardCardsFromBeatSheet(normalizedScript, targetDurationSec)
      : buildStoryboardCardsFromScript(normalizedScript);
    return {
      cards: fallbackCards,
      usedFallback: true,
      error: message,
    };
  }
}
