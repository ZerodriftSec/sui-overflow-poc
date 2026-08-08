import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { StoryboardCard } from "./project";
import type { AppSettings } from "./settings";
import {
  generateDesignAssetsFromScript,
  AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS,
  buildStyleArtDirectionDirective,
} from "./design-llm";
import { generateStoryboardCardsWithLLM } from "./storyboard-llm";
import {
  AGENT_MODE_CHUNK_DURATION_SEC,
  DEFAULT_AGENT_SCRIPT_MODEL,
  DEFAULT_DESIGN_ANALYSIS_MODEL,
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_STORYBOARD_OPENROUTER_MODEL,
  DEFAULT_STORYBOARD_SHEET_IMAGE_SIZE,
  DEFAULT_VIDEO_ASPECT_RATIO,
  DEFAULT_VIDEO_MODEL,
  resolveAgentWorkflowModelId,
  supportsOpenRouterReferenceImageInput,
  type ImageGenerationSize,
  type VideoAspectRatioSetting,
} from "./openrouter-models";
import {
  generateOpenRouterImage,
  type OpenRouterInputReference,
} from "./openrouter-images";
import {
  compressReferenceImageForOpenRouter,
  openRouterReferenceImageDataUrl,
  type OpenRouterInputImageMimeType,
} from "./openrouter-reference-images";
import {
  buildStoryboardGridLayoutPrompt,
  computeStoryboardSheetAspectRatio,
  STORYBOARD_SHEET_NO_TEXT_RULE,
  STORYBOARD_SHEET_PANEL_ISOLATION_RULE,
} from "./storyboard-sheet-layout";
import {
  groupStoryboardCardsIntoSegments,
  resolveWorkflowStyleBrief,
  type StoryboardSegment,
} from "./workflow-options";
import type { GeneratedDesignAsset } from "./design-llm";
import {
  buildBeatSheetCritiqueSystemPrompt,
  buildBeatSheetRewriteSystemPrompt,
  buildBeatSheetSystemPrompt,
  buildBriefAdaptationGuidance,
  buildBriefDurationGuidance,
  extractScriptTitle,
  normalizeVisualBeatSheet,
  applyStyleBriefToBeatSheet,
  validateBeatSheetForTarget,
} from "./visual-beat-sheet";

export interface ScriptAgentResult {
  content: string;
  title: string;
}

/** One multi-panel storyboard contact sheet for a ~15s video segment. */
export interface StoryboardSheet {
  segmentId: string;
  segmentIndex: number;
  segmentTitle: string;
  durationSec: number;
  shotIds: string[];
  panelCount: number;
  /** First shot id — used for asset gallery / film document linkage. */
  shotId: string;
  shotTitle: string;
  mimeType: string;
  dataBase64: string;
  prompt: string;
  panelAspectRatio: string;
}

interface StoryboardReferenceImage {
  label: string;
  kind: GeneratedDesignAsset["kind"];
  description: string;
  mimeType: string;
  dataBase64: string;
}

interface StoryboardAttachableReferenceImage {
  label: string;
  kind: GeneratedDesignAsset["kind"];
  description: string;
  mimeType: OpenRouterInputImageMimeType;
  dataBase64: string;
}

const MAX_STORYBOARD_REFERENCE_IMAGES = 10;
const STORYBOARD_SHEET_IMAGE_CONCURRENCY = 4;

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      await worker();
    }),
  );
  return results;
}

export function ordinalAttachmentLabel(imageNumber: number): string {
  if (imageNumber === 1) return "first";
  if (imageNumber === 2) return "second";
  if (imageNumber === 3) return "third";
  return `${imageNumber}th`;
}

function buildStoryboardReferenceImageLegend(
  referenceImages: Array<Pick<StoryboardReferenceImage, "label" | "kind">>,
  attachableCount: number,
): string {
  if (referenceImages.length === 0) {
    return "";
  }

  const lines = referenceImages.map((ref, index) => {
    const imageNumber = index + 1;
    const ordinal = ordinalAttachmentLabel(imageNumber);
    const attachmentHint =
      imageNumber <= attachableCount
        ? `(the ${ordinal} attached image)`
        : "(described in text only — no image attached)";
    if (ref.kind === "character") {
      return `Image ${imageNumber} ${attachmentHint}: "${ref.label}" — character reference sheet. Use this sheet only for ${ref.label}'s likeness, wardrobe, proportions, and styling.`;
    }
    return `Image ${imageNumber} ${attachmentHint}: "${ref.label}" — environment reference. Use this image for setting, architecture, palette, and lighting.`;
  });

  return [
    "Attached reference images appear below in this exact order. Match each character to their own sheet — do not swap identities between characters:",
    ...lines,
  ].join("\n");
}

function buildStoryboardReferenceImageCaption(
  ref: StoryboardAttachableReferenceImage,
  imageNumber: number,
  totalImages: number,
): string {
  const ordinal = ordinalAttachmentLabel(imageNumber);
  if (ref.kind === "character") {
    return `This is ${ref.label}. The following image (${imageNumber} of ${totalImages}, the ${ordinal} attached image) is ${ref.label}'s character reference sheet. ${ref.description}`;
  }
  return `This is the environment "${ref.label}". The following image (${imageNumber} of ${totalImages}, the ${ordinal} attached image) is its environment reference. ${ref.description}`;
}

function buildStoryboardReferenceImages(
  characterRefs: GeneratedDesignAsset[],
  environmentRefs: GeneratedDesignAsset[],
): StoryboardReferenceImage[] {
  const refs: StoryboardReferenceImage[] = [
    ...characterRefs.map((ref) => ({
      label: ref.title,
      kind: ref.kind,
      description: ref.description,
      mimeType: ref.image.mimeType,
      dataBase64: ref.image.dataBase64,
    })),
    ...environmentRefs
      .slice(0, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS)
      .map((ref) => ({
        label: ref.title,
        kind: ref.kind,
        description: ref.description,
        mimeType: ref.image.mimeType,
        dataBase64: ref.image.dataBase64,
      })),
  ];

  return refs.slice(0, MAX_STORYBOARD_REFERENCE_IMAGES);
}

async function prepareAttachableReferenceImages(
  referenceImages: StoryboardReferenceImage[],
): Promise<StoryboardAttachableReferenceImage[]> {
  const attachable: StoryboardAttachableReferenceImage[] = [];

  for (const ref of referenceImages) {
    const compressed = await compressReferenceImageForOpenRouter({
      mimeType: ref.mimeType,
      dataBase64: ref.dataBase64,
    });
    if (!compressed) {
      continue;
    }

    attachable.push({
      label: ref.label,
      kind: ref.kind,
      description: ref.description,
      mimeType: compressed.mimeType,
      dataBase64: compressed.dataBase64,
    });
  }

  return attachable;
}

function buildStoryboardPanelDescription(
  card: StoryboardCard,
  index: number,
): string {
  const header = `Panel ${index + 1}: ${card.title}`;
  const generationPrompt = card.generationPrompt.trim();
  if (generationPrompt) {
    return `${header} — ${generationPrompt}`;
  }

  const details = [
    card.shotDescription,
    `${card.estimatedDurationSec}s`,
    `${card.shotType}, ${card.cameraAngle}`,
    card.cameraMovement ? `Camera: ${card.cameraMovement}` : "",
    card.characterAction ? `Action: ${card.characterAction}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  return `${header} — ${details}`;
}

function formatSegmentTitle(segment: StoryboardSegment): string {
  const { cards, segmentIndex, durationSec } = segment;
  if (cards.length === 0) {
    return `Segment ${segmentIndex + 1} (${durationSec}s)`;
  }
  if (cards.length === 1) {
    return cards[0].title;
  }
  return `Segment ${segmentIndex + 1}: ${cards[0].title} – ${cards[cards.length - 1].title}`;
}

function buildStoryboardSegmentSheetGeneration(input: {
  segment: StoryboardSegment;
  referenceImages: StoryboardReferenceImage[];
  attachableReferenceImages: StoryboardAttachableReferenceImage[];
  totalSegments: number;
  panelAspectRatio: string;
  imageModelId: string;
  styleBrief?: string;
}): {
  prompt: string;
  inputReferences: OpenRouterInputReference[];
} {
  const {
    segment,
    referenceImages,
    attachableReferenceImages,
    totalSegments,
    panelAspectRatio,
    imageModelId,
    styleBrief,
  } = input;
  const panelCount = segment.cards.length;
  const sheetAspectRatio = computeStoryboardSheetAspectRatio(
    panelAspectRatio,
    panelCount,
  );
  const referenceImageLegend = buildStoryboardReferenceImageLegend(
    referenceImages,
    attachableReferenceImages.length,
  );
  const styleDirection = buildStyleArtDirectionDirective(styleBrief ?? "");

  const panelDescriptions = segment.cards
    .map((card, index) => buildStoryboardPanelDescription(card, index))
    .join("\n");

  const intro = [
    `Create one ${sheetAspectRatio} storyboard contact sheet for video segment ${segment.segmentIndex + 1} of ${totalSegments}.`,
    `This sheet covers approximately ${segment.durationSec} seconds of the final video and must contain ${panelCount} storyboard panel${panelCount === 1 ? "" : "s"} in a single image.`,
    styleDirection || null,
    segment.segmentIndex > 0
      ? "This segment continues the story from the previous segment. Advance the narrative — do not re-stage the opening setup from earlier sheets."
      : null,
    `Every panel must use a ${panelAspectRatio} aspect ratio, matching the final video frame.`,
    buildStoryboardGridLayoutPrompt(panelCount, panelAspectRatio),
    "Each panel corresponds to one shot listed below, in order, representing a contiguous portion of the script.",
    referenceImageLegend,
  ]
    .filter(Boolean)
    .join("\n");

  const sheetInstructions = [
    "Shots to render as panels in this contact sheet:",
    panelDescriptions,
    "",
    "Maintain consistent character design, environment, and cinematic style across all panels.",
    styleDirection
      ? "CRITICAL: Every panel must stay in the mandatory art style above — do not drift into photorealism, live-action, or CGI sports-game footage unless that style was requested."
      : null,
    "CRITICAL: Keep every panel the same size in a uniform grid. Never vary panel dimensions within the sheet.",
    STORYBOARD_SHEET_PANEL_ISOLATION_RULE,
    STORYBOARD_SHEET_NO_TEXT_RULE,
  ]
    .filter(Boolean)
    .join("\n");

  const canAttachReferenceImages =
    attachableReferenceImages.length > 0 &&
    supportsOpenRouterReferenceImageInput(imageModelId);

  if (!canAttachReferenceImages) {
    return {
      prompt: [intro, "", sheetInstructions].join("\n"),
      inputReferences: [],
    };
  }

  const captions = attachableReferenceImages
    .map((ref, index) =>
      buildStoryboardReferenceImageCaption(
        ref,
        index + 1,
        attachableReferenceImages.length,
      ),
    )
    .join("\n");

  const inputReferences: OpenRouterInputReference[] =
    attachableReferenceImages.map((ref) => ({
      type: "image_url",
      image_url: { url: openRouterReferenceImageDataUrl(ref) },
    }));

  return {
    prompt: [intro, "", captions, "", sheetInstructions].join("\n"),
    inputReferences,
  };
}

function cleanPromptLine(value: string): string {
  return value
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function truncateAtEmbeddedShotHeading(value: string): string {
  const embeddedHeadingPattern =
    /\s(?:EXTREME\s+CLOSE\s+UP|CLOSE\s+UP|MEDIUM\s+CLOSE\s+UP|MEDIUM\s+SHOT|WIDE\s+SHOT|EXTREME\s+WIDE\s+SHOT|OVER[-\s]THE[-\s]SHOULDER|INSERT|POV|ANGLE\s+ON|CUTAWAY|INT\.|EXT\.|INT\/EXT\.)\b/i;
  const match = embeddedHeadingPattern.exec(value);
  if (!match || match.index < 24) {
    return value;
  }
  return value.slice(0, match.index).trim();
}

const BEAT_FIELD_LINE_PATTERN =
  /^(?:ACTION|SFX|MUSIC(?:\s+CUE)?|VOICEOVER|DIALOGUE(?:\s*\([^)]+\))?)\s*:/i;
const EMBEDDED_BEAT_FIELD_PATTERN =
  /\s(?:ACTION|SFX|MUSIC(?:\s+CUE)?|VOICEOVER|DIALOGUE(?:\s*\([^)]+\))?)\s*:/i;
const INLINE_BEAT_FIELD_MARKER_PATTERN =
  /(ACTION|DIALOGUE(?:\s*\([^)]+\))?|VOICEOVER|SFX)\s*:/gi;

interface ParsedBeatSheetFields {
  description: string;
  action: string;
  dialogue: string;
  voiceover: string;
  sfx: string;
}

function emptyBeatSheetFields(): ParsedBeatSheetFields {
  return {
    description: "",
    action: "",
    dialogue: "",
    voiceover: "",
    sfx: "",
  };
}

function beatFieldKeyFromMarker(marker: string): keyof ParsedBeatSheetFields | null {
  const normalized = marker.trim().toUpperCase();
  if (normalized.startsWith("DIALOGUE")) return "dialogue";
  if (normalized === "VOICEOVER") return "voiceover";
  if (normalized === "SFX") return "sfx";
  if (normalized === "ACTION") return "action";
  return null;
}

function formatDialogueField(marker: string, content: string): string {
  const speakerMatch = /DIALOGUE\s*\(([^)]+)\)/i.exec(marker);
  if (!speakerMatch) {
    return content.trim();
  }
  return `${speakerMatch[1].trim()}: ${content.trim()}`;
}

function parseInlineBeatSheetFields(value: string): ParsedBeatSheetFields {
  const fields = emptyBeatSheetFields();
  const match = EMBEDDED_BEAT_FIELD_PATTERN.exec(value);
  if (!match || match.index < 24) {
    fields.description = value.trim();
    return fields;
  }

  fields.description = value.slice(0, match.index).trim();
  const remainder = value.slice(match.index);
  const markers: Array<{
    field: keyof ParsedBeatSheetFields;
    contentStart: number;
    nextMarkerStart: number;
    marker: string;
  }> = [];
  const allMatches = [...remainder.matchAll(INLINE_BEAT_FIELD_MARKER_PATTERN)];

  for (const [index, markerMatch] of allMatches.entries()) {
    const field = beatFieldKeyFromMarker(markerMatch[1]);
    if (!field || markerMatch.index === undefined) {
      continue;
    }
    const nextMatch = allMatches[index + 1];
    markers.push({
      field,
      contentStart: markerMatch.index + markerMatch[0].length,
      nextMarkerStart: nextMatch?.index ?? remainder.length,
      marker: markerMatch[1],
    });
  }

  for (const marker of markers) {
    const content = remainder
      .slice(marker.contentStart, marker.nextMarkerStart)
      .trim();
    if (marker.field === "dialogue") {
      fields.dialogue = formatDialogueField(marker.marker, content);
      continue;
    }
    fields[marker.field] = content;
  }

  return fields;
}

function parseBeatSheetFieldsFromText(value: string): ParsedBeatSheetFields {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return parseInlineBeatSheetFields(value);
  }

  const fields = emptyBeatSheetFields();
  const descriptionParts: string[] = [];

  for (const line of lines) {
    const actionMatch = /^ACTION\s*:\s*(.+)$/i.exec(line);
    if (actionMatch) {
      fields.action = actionMatch[1].trim();
      continue;
    }

    const dialogueMatch = /^DIALOGUE(?:\s*\(([^)]+)\))?\s*:\s*(.+)$/i.exec(
      line,
    );
    if (dialogueMatch) {
      const speaker = dialogueMatch[1]?.trim();
      const dialogue = dialogueMatch[2].trim();
      fields.dialogue = speaker ? `${speaker}: ${dialogue}` : dialogue;
      continue;
    }

    const voiceoverMatch = /^VOICEOVER\s*:\s*(.+)$/i.exec(line);
    if (voiceoverMatch) {
      fields.voiceover = voiceoverMatch[1].trim();
      continue;
    }

    const sfxMatch = /^SFX\s*:\s*(.+)$/i.exec(line);
    if (sfxMatch) {
      fields.sfx = sfxMatch[1].trim();
      continue;
    }

    if (!BEAT_FIELD_LINE_PATTERN.test(line)) {
      descriptionParts.push(line);
    }
  }

  fields.description = descriptionParts.join(" ");
  return fields;
}

function isPlaceholderAction(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (/^hold the emotional beat with clear blocking\.?$/i.test(trimmed)) {
    return true;
  }
  return /delivers the line with clear blocking\.?$/i.test(trimmed);
}

function firstPreparedField(
  values: string[],
  options?: { ignorePlaceholderAction?: boolean },
): string {
  for (const value of values) {
    const prepared = prepareVideoPromptField(value, "");
    if (!prepared) {
      continue;
    }
    if (options?.ignorePlaceholderAction && isPlaceholderAction(prepared)) {
      continue;
    }
    return prepared;
  }
  return "";
}

function prepareVideoPromptField(value: string, fallback: string): string {
  const withoutTimestamps = cleanPromptLine(value).replace(
    /\(?\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)?/g,
    "",
  );
  const parsed = parseBeatSheetFieldsFromText(withoutTimestamps);
  const singleShotText = truncateAtEmbeddedShotHeading(parsed.description)
    .replace(/\s+/g, " ")
    .trim();

  return singleShotText || fallback;
}

function formatTimelineTimestamp(seconds: number): string {
  const clampedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function distributeTimelineDurations(
  cards: StoryboardCard[],
  targetDurationSec: number,
): number[] {
  const duration = Math.max(1, Math.round(targetDurationSec));
  if (cards.length === 0) {
    return [];
  }

  const sourceDurations = cards.map((card) =>
    Math.max(1, Math.round(card.estimatedDurationSec)),
  );
  const sourceTotal = sourceDurations.reduce((sum, value) => sum + value, 0);
  const scaled = sourceDurations.map((value) =>
    Math.max(1, Math.round((value / sourceTotal) * duration)),
  );
  const scaledTotal = scaled.reduce((sum, value) => sum + value, 0);
  scaled[scaled.length - 1] = Math.max(
    1,
    scaled[scaled.length - 1] + duration - scaledTotal,
  );

  return scaled;
}

function isSkippedCompactPromptValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  return (
    trimmed === "(none)" ||
    trimmed === "none" ||
    trimmed === "n/a" ||
    trimmed === "(n/a)"
  );
}

function firstPreparedCompactField(values: string[]): string {
  for (const value of values) {
    const prepared = prepareVideoPromptField(value, "");
    if (!prepared || isSkippedCompactPromptValue(prepared)) {
      continue;
    }
    return prepared;
  }
  return "";
}

export interface SegmentVideoPromptOptions {
  /** When true, this clip continues a multi-clip sequence from the prior segment. */
  continuesFromPrevious?: boolean;
  segmentIndex?: number;
  totalSegments?: number;
  /** Required art style for this clip — locks rendering language across segments. */
  styleBrief?: string;
}

function buildSegmentStyleDirection(styleBrief?: string): string | null {
  const directive = buildStyleArtDirectionDirective(styleBrief ?? "", {
    subject: "video",
  });
  return directive || null;
}

/**
 * For multi-clip sequences or when a style brief is set, returns a critical
 * style-lock instruction so every clip renders in the same visual language.
 */
function buildStyleConsistencyNote(options?: SegmentVideoPromptOptions): string | null {
  const totalSegments = options?.totalSegments ?? 1;
  const hasStyleBrief = Boolean(options?.styleBrief?.trim());
  const isMultiClip = totalSegments > 1;

  if (!hasStyleBrief && !isMultiClip) {
    return null;
  }

  const segmentLabel =
    isMultiClip && typeof options?.segmentIndex === "number"
      ? ` (clip ${options.segmentIndex + 1} of ${totalSegments})`
      : "";
  const styleAnchor = hasStyleBrief
    ? ` Match the mandatory art style exactly — ${options?.styleBrief?.trim()}.`
    : "";

  return (
    `CRITICAL STYLE LOCK${segmentLabel}: ` +
    (isMultiClip
      ? "This clip is part of a continuous multi-clip video sequence. "
      : "Maintain one consistent visual language for the entire clip. ") +
    "The art style, character designs, color palette, lighting, and rendering language MUST stay identical across every shot and clip in this sequence." +
    styleAnchor +
    " Do NOT switch art styles between shots or clips — if the style is anime, every frame must be anime; if it is live-action cinematography, every frame must be live-action. " +
    "Never blend styles or drift toward photorealism, CGI, or a different genre unless the style brief explicitly requests it."
  );
}

const HARD_CUT_TRANSITION_RULES = [
  "PACING: Professional short-form editing. Each shot holds for its full allocated duration, then cuts instantly to the next — like broadcast TV or YouTube shorts, not a slideshow.",
  "Shot-to-shot transitions must be instant hard cuts only. No dissolves, crossfades, fades, wipes, morphs, zoom transitions, blur transitions, or any gradual blend between shots.",
  "FORBIDDEN: crossfade, dissolve, fade to black, fade from black, dip to black, wipe, morph, Ken Burns pan, or any video-editor transition effect.",
  "Do not open this clip with a fade-in from black. Do not end this clip with a fade-out to black. Every shot starts and ends on a full frame.",
] as const;

function buildSegmentContinuityPreface(
  options?: SegmentVideoPromptOptions,
): string | null {
  if (!options?.continuesFromPrevious) {
    return null;
  }

  const segmentLabel =
    typeof options.segmentIndex === "number" &&
    typeof options.totalSegments === "number" &&
    options.totalSegments > 1
      ? `Segment ${options.segmentIndex + 1} of ${options.totalSegments}. `
      : "";

  return (
    `${segmentLabel}CONTINUATION: This clip continues directly from the previous clip. ` +
    "Match the ending frame's composition, character positions, wardrobe, and lighting. " +
    "Begin as a seamless narrative continuation — do not restart the story or re-establish the opening setup."
  );
}

export function buildCompactSegmentVideoPrompt(
  cards: StoryboardCard[],
  durationSec: number,
  options?: SegmentVideoPromptOptions,
): string {
  const timelineDurations = distributeTimelineDurations(cards, durationSec);
  let cursorSec = 0;

  const timeline = cards
    .map((card, index) => {
      const startSec = cursorSec;
      const isLast = index === cards.length - 1;
      const endSec = isLast
        ? Math.max(startSec + 1, Math.round(durationSec))
        : startSec + timelineDurations[index];
      cursorSec = endSec;

      const embedded = parseBeatSheetFieldsFromText(card.shotDescription);
      const movement =
        card.cameraMovement && card.cameraMovement !== "Static"
          ? ` ${card.cameraMovement}`
          : "";
      const camera = cleanPromptLine(
        `${card.shotType} ${card.cameraAngle}${movement}`,
      );
      const shot = prepareVideoPromptField(
        embedded.description || card.shotDescription,
        "",
      );
      const action = firstPreparedField(
        [card.characterAction, embedded.action],
        { ignorePlaceholderAction: true },
      );
      const dialogue = firstPreparedCompactField([
        card.dialogue,
        embedded.dialogue,
      ]);
      const voiceover = firstPreparedCompactField([
        card.voiceover,
        embedded.voiceover,
      ]);
      const sfx = firstPreparedCompactField([card.sfx, embedded.sfx]);

      const extras: string[] = [];
      if (shot) {
        extras.push(`shot: ${shot}`);
      }
      if (action && action !== shot) {
        extras.push(`action: ${action}`);
      }
      if (dialogue) {
        extras.push(`dialogue: ${dialogue}`);
      }
      if (voiceover) {
        extras.push(`vo: ${voiceover}`);
      }
      if (sfx) {
        extras.push(`sfx: ${sfx}`);
      }

      const line = `${formatTimelineTimestamp(startSec)}-${formatTimelineTimestamp(endSec)} P${index + 1} ${camera}`;
      const hardCutSuffix = isLast ? "" : " → HARD CUT";
      return extras.length > 0
        ? `${line}${hardCutSuffix} | ${extras.join(" | ")}`
        : `${line}${hardCutSuffix}`;
    })
    .join("\n");

  const continuity = buildSegmentContinuityPreface(options);
  const styleDirection = buildSegmentStyleDirection(options?.styleBrief);
  const styleConsistency = buildStyleConsistencyNote(options);

  return [
    continuity,
    styleDirection,
    styleConsistency,
    `${Math.round(durationSec)}s, ${cards.length} hard-cut panel${cards.length === 1 ? "" : "s"}, no music unless audio enabled, no text overlays.`,
    "Match each attached storyboard panel's composition as closely as possible. If a panel is garbled, incoherent, or contradicts the shot timeline or scene, override that panel with a clear cinematic shot that fits the written action and scene continuity.",
    ...HARD_CUT_TRANSITION_RULES,
    `TIMELINE (${formatTimelineTimestamp(0)}-${formatTimelineTimestamp(durationSec)}):`,
    timeline,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildSegmentVideoPrompt(
  cards: StoryboardCard[],
  durationSec: number,
  options?: SegmentVideoPromptOptions,
): string {
  const timelineDurations = distributeTimelineDurations(cards, durationSec);
  let cursorSec = 0;

  const timeline = cards
    .map((card, index) => {
      const startSec = cursorSec;
      const isLast = index === cards.length - 1;
      const endSec = isLast
        ? Math.max(startSec + 1, Math.round(durationSec))
        : startSec + timelineDurations[index];
      cursorSec = endSec;

      const embedded = parseBeatSheetFieldsFromText(card.shotDescription);
      const shotDescription = prepareVideoPromptField(
        embedded.description,
        card.title,
      );
      const camera = cleanPromptLine(
        `${card.shotType} ${card.cameraAngle}; ${card.cameraMovement || "Static"}`,
      );
      const action = firstPreparedField(
        [card.characterAction, embedded.action],
        { ignorePlaceholderAction: true },
      );
      const dialogue = firstPreparedField([card.dialogue, embedded.dialogue]);
      const voiceover = firstPreparedField([
        card.voiceover,
        embedded.voiceover,
      ]);
      const sfx = firstPreparedField([card.sfx, embedded.sfx]);

      const panelLines = [
        `${formatTimelineTimestamp(startSec)}-${formatTimelineTimestamp(endSec)} [Panel ${index + 1}]: ${camera} - ${shotDescription}`,
      ];
      if (action) {
        panelLines.push(`  ACTION: ${action}`);
      }
      if (dialogue) {
        panelLines.push(`  DIALOGUE: ${dialogue}`);
      }
      if (voiceover) {
        panelLines.push(`  VOICEOVER: ${voiceover}`);
      }
      if (sfx) {
        panelLines.push(`  SFX: ${sfx}`);
      }

      return panelLines.join("\n");
    })
    .join("\n");

  return [
    buildSegmentContinuityPreface(options),
    buildSegmentStyleDirection(options?.styleBrief),
    buildStyleConsistencyNote(options),
    `${Math.round(durationSec)} seconds / ${cards.length} CUT${cards.length === 1 ? "" : "S"} / cinematic short-form sequence / NO MUSIC unless audio is explicitly enabled.`,
    "Match each attached storyboard panel's composition as closely as possible — framing, screen direction, continuity, and pacing. If a panel is garbled, incoherent, or contradicts the shot timeline or scene, override that panel with a clear cinematic shot that fits the written action and scene continuity. No text overlays, no captions, no logos.",
    ...HARD_CUT_TRANSITION_RULES,
    "",
    `TIMELINE (must cover full ${formatTimelineTimestamp(0)}-${formatTimelineTimestamp(durationSec)}):`,
    timeline,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function resolveSegmentCards(
  sheet: StoryboardSheet,
  cards: StoryboardCard[],
): StoryboardCard[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return sheet.shotIds
    .map((id) => byId.get(id))
    .filter((card): card is StoryboardCard => card !== undefined);
}

async function generateImageFromPrompt(input: {
  apiKey: string;
  imageModelId: string;
  prompt: string;
  inputReferences?: OpenRouterInputReference[];
  aspectRatio?: string;
  imageSize?: ImageGenerationSize;
  signal?: AbortSignal;
}): Promise<{ mimeType: string; dataBase64: string }> {
  return generateOpenRouterImage({
    apiKey: input.apiKey,
    modelId: input.imageModelId,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio ?? "16:9",
    imageSize: input.imageSize ?? DEFAULT_STORYBOARD_SHEET_IMAGE_SIZE,
    inputReferences: input.inputReferences,
    signal: input.signal,
    operation: "storyboard image generation",
  });
}

function createTextModel(settings: AppSettings, modelId: string) {
  const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });
  return openrouter.chat(modelId);
}

function buildScriptSystemPrompt(
  targetDurationSec: number,
  styleBrief?: string,
): string {
  return buildBeatSheetSystemPrompt(targetDurationSec, styleBrief);
}

function buildScriptUserPrompt(
  brief: string,
  targetDurationSec: number,
  styleBrief?: string,
): string {
  const trimmedStyle = styleBrief?.trim() ?? "";
  const styleBlock = trimmedStyle
    ? `\n\nRequired art style (use this for the STYLE line and all visual direction):\n${trimmedStyle}`
    : "";
  const briefGuidance = buildBriefDurationGuidance(brief, targetDurationSec);
  const adaptationGuidance = buildBriefAdaptationGuidance(brief, targetDurationSec);
  const guidanceBlock = briefGuidance ? `\n\n${briefGuidance}` : "";
  return `Brief: ${brief}\n\nMaximum runtime: ${targetDurationSec} seconds.\n\n${adaptationGuidance}${styleBlock}${guidanceBlock}`;
}

export async function runScriptAgents(
  brief: string,
  settings: AppSettings,
  options?: {
    modelId?: string;
    styleBrief?: string;
    signal?: AbortSignal;
    onThinking?: (content: string) => void;
    targetDurationSec?: number;
  },
): Promise<ScriptAgentResult> {
  const modelId = resolveAgentWorkflowModelId(
    options?.modelId ?? DEFAULT_AGENT_SCRIPT_MODEL,
  );
  const targetDurationSec = Math.max(
    1,
    Math.round(options?.targetDurationSec ?? AGENT_MODE_CHUNK_DURATION_SEC),
  );
  const styleBrief = options?.styleBrief?.trim() ?? "";
  const model = createTextModel(settings, modelId);

  options?.onThinking?.("Drafting visual beat sheet from brief…");

  const draft = await generateText({
    model,
    system: buildScriptSystemPrompt(targetDurationSec, styleBrief),
    prompt: buildScriptUserPrompt(brief, targetDurationSec, styleBrief),
    abortSignal: options?.signal,
  });

  let script = normalizeVisualBeatSheet(draft.text.trim());
  if (!script) {
    throw new Error("Script agent returned empty content");
  }
  script = applyStyleBriefToBeatSheet(script, styleBrief);

  options?.onThinking?.("Critiquing beat pacing and visual clarity…");

  const critique = await generateText({
    model,
    system: buildBeatSheetCritiqueSystemPrompt(targetDurationSec, styleBrief),
    prompt: `Original brief:\n${brief}\n\nBeat sheet:\n${script}\n\nMaximum runtime: ${targetDurationSec} seconds.${
      styleBrief
        ? `\n\nRequired art style (must remain faithful):\n${styleBrief}`
        : ""
    }`,
    abortSignal: options?.signal,
  });

  options?.onThinking?.("Revising beat sheet based on critique…");

  const revised = await generateText({
    model,
    system: buildBeatSheetRewriteSystemPrompt(targetDurationSec, styleBrief),
    prompt: `Original brief:\n${brief}\n\nOriginal beat sheet:\n${script}\n\nCritique:\n${critique.text}\n\nRewrite the beat sheet.${
      styleBrief
        ? `\n\nRequired art style (STYLE line and visuals must follow this):\n${styleBrief}`
        : ""
    }`,
    abortSignal: options?.signal,
  });

  if (revised.text.trim()) {
    script = normalizeVisualBeatSheet(revised.text.trim());
  } else {
    script = normalizeVisualBeatSheet(script);
  }
  script = applyStyleBriefToBeatSheet(script, styleBrief);

  const validation = validateBeatSheetForTarget(script, targetDurationSec);
  if (validation.issues.length > 0) {
    options?.onThinking?.(
      `Fixing beat sheet issues: ${validation.issues.join(" ")}`,
    );

    const corrected = await generateText({
      model,
      system: buildBeatSheetRewriteSystemPrompt(targetDurationSec, styleBrief),
      prompt: [
        `Original brief:\n${brief}`,
        "",
        `Original beat sheet:\n${script}`,
        "",
        `Validation issues to fix:\n${validation.issues.map((issue) => `- ${issue}`).join("\n")}`,
        "",
        `Target runtime: ${targetDurationSec} seconds. Beat count must fit the story — do not default to 8 beats.`,
        styleBrief
          ? `\nRequired art style:\n${styleBrief}`
          : "",
        "",
        "Rewrite the beat sheet to resolve every validation issue.",
      ].join("\n"),
      abortSignal: options?.signal,
    });

    if (corrected.text.trim()) {
      script = applyStyleBriefToBeatSheet(
        normalizeVisualBeatSheet(corrected.text.trim()),
        styleBrief,
      );
    }
  }

  const title = extractScriptTitle(brief, script);

  return { content: script, title };
}

export async function runCharacterAgent(
  scriptContent: string,
  settings: AppSettings,
  options?: {
    styleBrief?: string;
    signal?: AbortSignal;
    onProgress?: (
      current: number,
      total: number,
      title: string,
      phase: "prompt" | "image",
    ) => void;
  },
): Promise<GeneratedDesignAsset[]> {
  const styleBrief = resolveWorkflowStyleBrief(
    { styleBrief: options?.styleBrief ?? "" },
    scriptContent,
  );
  const all = await generateDesignAssetsFromScript({
    scriptContent,
    styleBrief,
    settings,
    analysisModelId: DEFAULT_DESIGN_ANALYSIS_MODEL,
    imageModelId: DEFAULT_DESIGN_IMAGE_MODEL,
    signal: options?.signal,
    onAssetProgress: options?.onProgress,
  });

  return all.filter((asset) => asset.kind === "character");
}

export async function runEnvironmentAgent(
  scriptContent: string,
  settings: AppSettings,
  options?: {
    styleBrief?: string;
    signal?: AbortSignal;
    onProgress?: (
      current: number,
      total: number,
      title: string,
      phase: "prompt" | "image",
    ) => void;
  },
): Promise<GeneratedDesignAsset[]> {
  const styleBrief = resolveWorkflowStyleBrief(
    { styleBrief: options?.styleBrief ?? "" },
    scriptContent,
  );
  const all = await generateDesignAssetsFromScript({
    scriptContent,
    styleBrief,
    settings,
    analysisModelId: DEFAULT_DESIGN_ANALYSIS_MODEL,
    imageModelId: DEFAULT_DESIGN_IMAGE_MODEL,
    maxEnvironmentAssets: AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS,
    signal: options?.signal,
    onAssetProgress: options?.onProgress,
  });

  return all
    .filter((asset) => asset.kind === "environment")
    .slice(0, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS);
}

export async function runStoryboardPlanAgent(
  scriptContent: string,
  settings: AppSettings,
  options?: {
    modelId?: string;
    signal?: AbortSignal;
    targetDurationSec?: number;
  },
): Promise<StoryboardCard[]> {
  const result = await generateStoryboardCardsWithLLM(
    scriptContent,
    settings,
    resolveAgentWorkflowModelId(
      options?.modelId ?? DEFAULT_STORYBOARD_OPENROUTER_MODEL,
    ),
    undefined,
    options?.signal,
    {
      targetDurationSec: options?.targetDurationSec,
    },
  );
  return result.cards;
}

export async function runStoryboardSheetAgent(
  cards: StoryboardCard[],
  characterRefs: GeneratedDesignAsset[],
  environmentRefs: GeneratedDesignAsset[],
  settings: AppSettings,
  options?: {
    imageModelId?: string;
    imageSize?: ImageGenerationSize;
    panelAspectRatio?: VideoAspectRatioSetting;
    signal?: AbortSignal;
    onProgress?: (current: number, total: number, title: string) => void;
    segmentDurations?: number[];
    maxClipDurationSec?: number;
    styleBrief?: string;
    /** When true, API failures propagate instead of returning SVG placeholders. */
    throwOnError?: boolean;
  },
): Promise<StoryboardSheet[]> {
  const imageModelId = options?.imageModelId ?? DEFAULT_DESIGN_IMAGE_MODEL;
  const panelAspectRatio = options?.panelAspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO;
  const segments = groupStoryboardCardsIntoSegments(
    cards,
    options?.segmentDurations,
    options?.maxClipDurationSec,
  );
  const referenceImages = buildStoryboardReferenceImages(
    characterRefs,
    environmentRefs,
  );
  const attachableReferenceImages = supportsOpenRouterReferenceImageInput(
    imageModelId,
  )
    ? await prepareAttachableReferenceImages(referenceImages)
    : [];
  const totalSegments = segments.length;
  let completedSheets = 0;

  return mapWithConcurrency(
    segments,
    STORYBOARD_SHEET_IMAGE_CONCURRENCY,
    async (segment) => {
      const segmentTitle = formatSegmentTitle(segment);
      const panelCount = segment.cards.length;
      const sheetAspectRatio = computeStoryboardSheetAspectRatio(
        panelAspectRatio,
        panelCount,
      );
      const { prompt, inputReferences } = buildStoryboardSegmentSheetGeneration({
        segment,
        referenceImages,
        attachableReferenceImages,
        totalSegments,
        panelAspectRatio,
        imageModelId,
        styleBrief: options?.styleBrief,
      });

      const segmentId = crypto.randomUUID();
      const firstCard = segment.cards[0];

      try {
        const image = await generateImageFromPrompt({
          apiKey: settings.openRouterApiKey,
          imageModelId,
          prompt,
          inputReferences,
          aspectRatio: sheetAspectRatio,
          imageSize: options?.imageSize,
          signal: options?.signal,
        });
        completedSheets += 1;
        options?.onProgress?.(completedSheets, totalSegments, segmentTitle);
        return {
          segmentId,
          segmentIndex: segment.segmentIndex,
          segmentTitle,
          durationSec: segment.durationSec,
          shotIds: segment.cards.map((card) => card.id),
          panelCount: segment.cards.length,
          shotId: firstCard?.id ?? segmentId,
          shotTitle: segmentTitle,
          mimeType: image.mimeType,
          dataBase64: image.dataBase64,
          prompt,
          panelAspectRatio,
        };
      } catch (error) {
        if (options?.throwOnError) {
          throw error;
        }
        const message =
          error instanceof Error ? error.message : "Sheet generation failed";
        completedSheets += 1;
        options?.onProgress?.(completedSheets, totalSegments, segmentTitle);
        return {
          segmentId,
          segmentIndex: segment.segmentIndex,
          segmentTitle,
          durationSec: segment.durationSec,
          shotIds: segment.cards.map((card) => card.id),
          panelCount: segment.cards.length,
          shotId: firstCard?.id ?? segmentId,
          shotTitle: segmentTitle,
          mimeType: "image/svg+xml",
          dataBase64: btoa(
            unescape(
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#10131a"/><text x="50%" y="50%" fill="#9ca3af" font-size="24" text-anchor="middle">${message.slice(0, 80)}</text></svg>`,
              ),
            ),
          ),
          prompt,
          panelAspectRatio,
        };
      }
    },
  );
}

export interface VideoClipResult {
  segmentId: string;
  segmentTitle: string;
  shotIds: string[];
  assetId: string;
  prompt: string;
}

export async function runVideoClipAgent(
  sheets: StoryboardSheet[],
  cards: StoryboardCard[],
  _settings: AppSettings,
  options: {
    projectId: string;
    generateClip: (input: {
      segmentId: string;
      segmentTitle: string;
      shotIds: string[];
      prompt: string;
      sheetImage: StoryboardSheet;
      durationSec: number;
    }) => Promise<string>;
    signal?: AbortSignal;
    onProgress?: (current: number, total: number, title: string) => void;
    onClipError?: (title: string, error: Error) => void;
    maxClips?: number;
    clipDurations?: number[];
    maxClipDurationSec?: number;
    styleBrief?: string;
  },
): Promise<VideoClipResult[]> {
  const limit = options.maxClips ?? sheets.length;
  const targets = sheets.slice(0, limit);
  const results: VideoClipResult[] = [];
  const failures: Array<{ title: string; error: Error }> = [];
  const clipCap = Math.max(
    1,
    Math.round(options.maxClipDurationSec ?? AGENT_MODE_CHUNK_DURATION_SEC),
  );

  for (let index = 0; index < targets.length; index += 1) {
    const sheet = targets[index];
    const segmentCards = resolveSegmentCards(sheet, cards);
    const configuredDuration = options.clipDurations?.[index];
    const durationSec =
      typeof configuredDuration === "number"
        ? Math.min(clipCap, Math.max(1, configuredDuration))
        : Math.min(clipCap, Math.max(1, sheet.durationSec));
    options.onProgress?.(index + 1, targets.length, sheet.segmentTitle);

    const prompt =
      segmentCards.length > 0
        ? buildCompactSegmentVideoPrompt(segmentCards, durationSec, {
            continuesFromPrevious: index > 0,
            segmentIndex: index,
            totalSegments: targets.length,
            styleBrief: options.styleBrief,
          })
        : sheet.segmentTitle;

    try {
      const assetId = await options.generateClip({
        segmentId: sheet.segmentId,
        segmentTitle: sheet.segmentTitle,
        shotIds: sheet.shotIds,
        prompt,
        sheetImage: sheet,
        durationSec,
      });

      results.push({
        segmentId: sheet.segmentId,
        segmentTitle: sheet.segmentTitle,
        shotIds: sheet.shotIds,
        assetId,
        prompt,
      });
    } catch (error) {
      const clipError =
        error instanceof Error
          ? error
          : new Error("Clip generation failed unexpectedly");
      options.onClipError?.(sheet.segmentTitle, clipError);
      failures.push({ title: sheet.segmentTitle, error: clipError });
    }
  }

  if (results.length === 0 && targets.length > 0) {
    if (failures.length === 1) {
      throw failures[0].error;
    }
    const detail = failures
      .map((failure) => `"${failure.title}": ${failure.error.message}`)
      .join("; ");
    throw new Error(
      `Video clip generation failed for all ${targets.length} segments: ${detail || "unknown error"}`,
    );
  }

  return results;
}

export const WORKFLOW_DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODEL;
