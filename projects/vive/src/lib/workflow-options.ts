import { extractStyleBriefFromBeatSheet } from "./visual-beat-sheet";
import {
  AGENT_MODE_CHUNK_DURATION_SEC,
  AGENT_MODE_DEFAULT_TOTAL_DURATION_SEC,
  DEFAULT_AGENT_TEXT_MODEL,
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_IMAGE_GENERATION_SIZE,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  DEFAULT_VIDEO_DURATION_SEC,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_VIDEO_RESOLUTION,
  resolveAgentWorkflowModelId,
  type ImageGenerationSize,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "./openrouter-models";
import type { StoryboardCard } from "./project";
import type { CheckpointPolicy } from "./workflow";

/** One ~15s video chunk with the storyboard shots assigned to it. */
export interface StoryboardSegment {
  segmentIndex: number;
  durationSec: number;
  cards: StoryboardCard[];
}

export const DEFAULT_WORKFLOW_STYLE_BRIEF =
  "Cinematic short-form video production design.";

export interface WorkflowOptions {
  scriptTitle: string;
  /** Visual style for character sheets, environments, and storyboard panels. */
  styleBrief: string;
  /**
   * Text / reasoning model for script writing, design analysis, and storyboard planning.
   * Kept in sync with `storyboardModelId` via the agent Text model picker.
   */
  scriptModelId: string;
  storyboardModelId: string;
  imageModelId: string;
  /** Resolution for design assets and storyboard contact sheets. */
  imageResolution: ImageGenerationSize;
  videoModelId: string;
  checkpointPolicy: CheckpointPolicy;
  /**
   * Per-clip duration in seconds (used in control mode).
   * Each video clip is generated with this duration.
   */
  videoDurationSec: number;
  /**
   * Total target duration for agent mode workflow (up to 60 seconds).
   * The workflow breaks this into chunks of up to 15 seconds each
   * for storyboard and video generation.
   */
  agentModeTotalDurationSec: number;
  videoAspectRatio: VideoAspectRatioSetting;
  videoResolution: VideoResolution;
  videoGenerateAudio: boolean;
}

export const DEFAULT_WORKFLOW_OPTIONS: WorkflowOptions = {
  scriptTitle: "",
  styleBrief: "",
  scriptModelId: DEFAULT_AGENT_TEXT_MODEL,
  storyboardModelId: DEFAULT_AGENT_TEXT_MODEL,
  imageModelId: DEFAULT_DESIGN_IMAGE_MODEL,
  imageResolution: DEFAULT_IMAGE_GENERATION_SIZE,
  videoModelId: DEFAULT_VIDEO_MODEL,
  checkpointPolicy: "full_run",
  videoDurationSec: DEFAULT_VIDEO_DURATION_SEC,
  agentModeTotalDurationSec: AGENT_MODE_DEFAULT_TOTAL_DURATION_SEC,
  videoAspectRatio: DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  videoResolution: DEFAULT_VIDEO_RESOLUTION,
  videoGenerateAudio: true,
};

/** Paid text model used across script, design analysis, and storyboard planning. */
export function resolveWorkflowTextModelId(
  options: Pick<WorkflowOptions, "scriptModelId">,
): string {
  return resolveAgentWorkflowModelId(options.scriptModelId);
}

/** Keep script + storyboard text models aligned behind one agent picker. */
export function workflowTextModelPatch(
  modelId: string,
): Pick<WorkflowOptions, "scriptModelId" | "storyboardModelId"> {
  return {
    scriptModelId: modelId,
    storyboardModelId: modelId,
  };
}

/**
 * Resolve the style brief used for design asset generation.
 * Prefers an explicit user brief, then the beat sheet STYLE line, then the default.
 */
export function resolveWorkflowStyleBrief(
  options: Pick<WorkflowOptions, "styleBrief">,
  scriptContent?: string,
): string {
  const userBrief = options.styleBrief.trim();
  if (userBrief) {
    return userBrief;
  }

  if (scriptContent) {
    const extracted = extractStyleBriefFromBeatSheet(scriptContent);
    if (extracted) {
      return extracted;
    }
  }

  return DEFAULT_WORKFLOW_STYLE_BRIEF;
}

/**
 * Calculate the number of video clips needed based on total duration.
 * Each clip is up to `maxClipDurationSec` (defaults to 15 seconds).
 */
export function calculateChunkCount(
  totalDurationSec: number,
  maxClipDurationSec = AGENT_MODE_CHUNK_DURATION_SEC,
): number {
  const chunkSize = Math.max(1, Math.round(maxClipDurationSec));
  return Math.ceil(totalDurationSec / chunkSize);
}

/**
 * Get per-clip durations capped by `maxClipDurationSec`.
 * Uses full chunks first, then a final remainder clip if needed.
 * Returns an array of durations (in seconds) for each clip.
 */
export function getChunkDurations(
  totalDurationSec: number,
  maxClipDurationSec = AGENT_MODE_CHUNK_DURATION_SEC,
): number[] {
  const total = Math.max(0, Math.round(totalDurationSec));
  if (total === 0) {
    return [];
  }

  const chunkCap = Math.max(1, Math.round(maxClipDurationSec));
  const durations: number[] = [];
  let remaining = total;

  while (remaining > 0) {
    const chunk = Math.min(chunkCap, remaining);
    durations.push(chunk);
    remaining -= chunk;
  }

  return durations;
}

/** Maximum panels per storyboard contact sheet so each shot stays legible. */
export const MAX_SHOTS_PER_STORYBOARD_SHEET = 8;

export interface AgentSegmentPlan {
  /** Per-clip durations in seconds; length equals {@link segmentCount}. */
  segmentDurations: number[];
  /** How many video clips / contact sheets are required. */
  segmentCount: number;
  /** Minimum segments needed to fit all shots within the per-sheet panel cap. */
  minSegmentsByShots: number;
  /** Minimum segments needed to stay within the per-clip duration cap. */
  minSegmentsByDuration: number;
}

/**
 * Plan how many video segments are needed and how long each should be.
 *
 * Segment count is driven by BOTH the total runtime budget AND the shot count:
 * every beat must land in a segment without exceeding the per-sheet panel cap
 * or the per-clip duration cap. Segments always break on shot boundaries.
 */
export function resolveAgentSegmentPlan(input: {
  totalDurationSec: number;
  shotCount: number;
  maxClipDurationSec?: number;
  maxShotsPerSheet?: number;
}): AgentSegmentPlan {
  const total = Math.max(1, Math.round(input.totalDurationSec));
  const shotCount = Math.max(0, Math.round(input.shotCount));
  const clipCap = Math.max(
    1,
    Math.round(input.maxClipDurationSec ?? AGENT_MODE_CHUNK_DURATION_SEC),
  );
  const maxShots = Math.max(
    1,
    Math.round(input.maxShotsPerSheet ?? MAX_SHOTS_PER_STORYBOARD_SHEET),
  );

  const minSegmentsByDuration = Math.ceil(total / clipCap);
  const minSegmentsByShots =
    shotCount > 0 ? Math.ceil(shotCount / maxShots) : 1;
  const segmentCount = Math.max(1, minSegmentsByDuration, minSegmentsByShots);

  const baseDuration = Math.floor(total / segmentCount);
  const extraSeconds = total % segmentCount;
  const segmentDurations = Array.from({ length: segmentCount }, (_, index) =>
    Math.min(clipCap, Math.max(1, baseDuration + (index < extraSeconds ? 1 : 0))),
  );

  return {
    segmentDurations,
    segmentCount,
    minSegmentsByShots,
    minSegmentsByDuration,
  };
}

/**
 * Assign planned storyboard shots to contact sheets for video generation.
 *
 * When `segmentDurations` is provided (i.e. we know how many clips to produce),
 * cards are distributed **evenly by count** across all segments so that no beats
 * are dropped and each clip gets a balanced number of panels. This prevents the
 * previous greedy-fill behaviour that could discard beats at the end of a sequence
 * when shot durations didn't align perfectly with clip boundaries.
 *
 * Without `segmentDurations`, falls back to the original greedy-fill approach:
 * a new sheet starts when adding the next shot would exceed
 * {@link MAX_SHOTS_PER_STORYBOARD_SHEET} panels or the per-clip duration cap.
 */
export function groupStoryboardCardsIntoSegments(
  cards: StoryboardCard[],
  segmentDurations?: number[],
  maxClipDurationSec = AGENT_MODE_CHUNK_DURATION_SEC,
): StoryboardSegment[] {
  if (cards.length === 0) {
    return [];
  }

  const clipCap = Math.max(1, Math.round(maxClipDurationSec));

  // ── Even-count distribution (preferred when the target segment count is known) ──
  // Distributes beats evenly so that all beats are assigned and no clip gets
  // dramatically more panels than another (e.g. 3+3 from 8 beats → now 4+4).
  if (segmentDurations && segmentDurations.length > 0) {
    const minSegmentsByShots = Math.ceil(
      cards.length / MAX_SHOTS_PER_STORYBOARD_SHEET,
    );
    const segmentCount = Math.max(segmentDurations.length, minSegmentsByShots);
    const effectiveDurations = [...segmentDurations];
    while (effectiveDurations.length < segmentCount) {
      effectiveDurations.push(clipCap);
    }

    const baseCount = Math.floor(cards.length / segmentCount);
    const extra = cards.length % segmentCount;
    const segments: StoryboardSegment[] = [];
    let cardIndex = 0;

    for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
      if (cardIndex >= cards.length) {
        break;
      }

      const rawPanelCount = baseCount + (segIdx < extra ? 1 : 0);
      const panelCount = Math.min(
        MAX_SHOTS_PER_STORYBOARD_SHEET,
        rawPanelCount,
        cards.length - cardIndex,
      );
      if (panelCount === 0) {
        break;
      }

      const segCards = cards.slice(cardIndex, cardIndex + panelCount);
      cardIndex += segCards.length;

      const configuredDuration = effectiveDurations[segIdx];
      const shotDurationTotal = segCards.reduce(
        (sum, card) => sum + Math.max(1, Math.round(card.estimatedDurationSec)),
        0,
      );

      segments.push({
        segmentIndex: segments.length,
        durationSec:
          typeof configuredDuration === "number"
            ? Math.min(clipCap, Math.max(1, configuredDuration))
            : Math.min(clipCap, Math.max(1, shotDurationTotal)),
        cards: segCards,
      });
    }

    if (cardIndex < cards.length) {
      const overflowCards = cards.slice(cardIndex);
      const overflowSegments = groupStoryboardCardsIntoSegments(
        overflowCards,
        undefined,
        maxClipDurationSec,
      );
      for (const overflow of overflowSegments) {
        segments.push({
          ...overflow,
          segmentIndex: segments.length,
        });
      }
    }

    return segments;
  }

  // ── Greedy-fill fallback (used when segment count is not predetermined) ──
  const segments: StoryboardSegment[] = [];
  let currentCards: StoryboardCard[] = [];
  let currentDurationSec = 0;

  function flushSegment(): void {
    if (currentCards.length === 0) {
      return;
    }

    const segmentIndex = segments.length;
    const shotDurationTotal = currentCards.reduce(
      (sum, card) => sum + Math.max(1, Math.round(card.estimatedDurationSec)),
      0,
    );

    segments.push({
      segmentIndex,
      durationSec: Math.min(clipCap, Math.max(1, shotDurationTotal)),
      cards: currentCards,
    });
    currentCards = [];
    currentDurationSec = 0;
  }

  for (const card of cards) {
    const cardDurationSec = Math.max(1, Math.round(card.estimatedDurationSec));
    const exceedsShotLimit =
      currentCards.length >= MAX_SHOTS_PER_STORYBOARD_SHEET;
    const exceedsDurationLimit =
      currentCards.length > 0 &&
      currentDurationSec + cardDurationSec > clipCap;

    if (exceedsShotLimit || exceedsDurationLimit) {
      flushSegment();
    }

    currentCards.push(card);
    currentDurationSec += cardDurationSec;
  }

  if (currentCards.length > 0) {
    flushSegment();
  }

  return segments;
}

/**
 * Keep the highest-priority shots that fit within the total runtime budget.
 */
export function trimStoryboardCardsToDuration(
  cards: StoryboardCard[],
  targetDurationSec: number,
): StoryboardCard[] {
  const budget = Math.max(1, Math.round(targetDurationSec));
  if (cards.length === 0) {
    return cards;
  }

  const totalDuration = cards.reduce(
    (sum, card) => sum + Math.max(1, Math.round(card.estimatedDurationSec)),
    0,
  );
  if (totalDuration <= budget) {
    return cards;
  }

  const trimmed: StoryboardCard[] = [];
  let usedDuration = 0;

  for (const card of cards) {
    const cardDuration = Math.max(1, Math.round(card.estimatedDurationSec));
    const remaining = budget - usedDuration;

    if (remaining <= 0) {
      break;
    }

    if (cardDuration > remaining && trimmed.length > 0) {
      break;
    }

    trimmed.push({
      ...card,
      estimatedDurationSec: Math.min(cardDuration, remaining),
    });
    usedDuration += Math.min(cardDuration, remaining);
  }

  return trimmed.length > 0 ? trimmed : [cards[0]];
}
