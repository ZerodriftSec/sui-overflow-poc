import type { StoryboardSheetEntry } from "./project";

export interface StoryboardSheetGrid {
  cols: number;
  rows: number;
}

export interface StoryboardSheetPanelPlacement {
  imageDataUrl: string;
  panelIndex: number;
  panelCount: number;
  segmentTitle: string;
  panelAspectRatio: string;
}

/**
 * Canonical contact-sheet grid for a panel count.
 * Uses the smallest square grid that fits every panel so the full-sheet aspect
 * ratio equals the per-panel aspect ratio (e.g. 16:9 panels → 16:9 sheet).
 * That keeps panel framing consistent across sheets even when OpenRouter remaps
 * unsupported ultra-wide canvas ratios like 32:9 → 21:9.
 */
export function resolveStoryboardSheetGrid(panelCount: number): StoryboardSheetGrid {
  const count = Math.max(1, Math.round(panelCount));
  if (count <= 1) {
    return { cols: 1, rows: 1 };
  }
  const side = Math.ceil(Math.sqrt(count));
  return { cols: side, rows: side };
}

/** Unused cells in row-major order when the grid has more cells than panels. */
export function resolveStoryboardEmptyCells(
  panelCount: number,
): Array<{ col: number; row: number }> {
  const count = Math.max(1, Math.round(panelCount));
  const { cols, rows } = resolveStoryboardSheetGrid(count);
  const totalCells = cols * rows;
  const empty: Array<{ col: number; row: number }> = [];
  for (let index = count; index < totalCells; index += 1) {
    empty.push({
      col: index % cols,
      row: Math.floor(index / cols),
    });
  }
  return empty;
}

/** First unused cell in row-major order when the grid has more cells than panels. */
export function resolveStoryboardEmptyCell(
  panelCount: number,
): { col: number; row: number } | null {
  return resolveStoryboardEmptyCells(panelCount)[0] ?? null;
}

/**
 * Prompt text that instructs image models to render a uniform contact-sheet grid.
 * Wording is kept in sync with {@link resolveStoryboardSheetGrid}.
 */
export function buildStoryboardGridLayoutPrompt(
  panelCount: number,
  panelAspectRatio: string,
): string {
  const count = Math.max(1, Math.round(panelCount));
  const panelLabel = `${panelAspectRatio} panel`;
  const { cols, rows } = resolveStoryboardSheetGrid(count);
  const gridLabel = `${cols}×${rows}`;

  if (count <= 1) {
    return `Render as a single full-frame ${panelLabel} filling the entire contact sheet.`;
  }

  const equalGridRule =
    `Divide the entire image into a strict ${gridLabel} grid of identical rectangular cells — every cell must have exactly the same width and the same height. ` +
    `Each of the ${count} storyboard panels must occupy exactly one cell at the same size as every other panel. ` +
    `Do not use variable panel sizes, hero panels, stacked tiers, mosaic layouts, or any asymmetric arrangement.`;

  const orderingRule =
    "Place panels left-to-right, top-to-bottom: fill row 1 left to right, then row 2 left to right, and so on.";

  const emptyCells = resolveStoryboardEmptyCells(count);
  const emptyCellRule =
    emptyCells.length === 0
      ? "Fill every cell in the grid with a panel — no empty cells."
      : emptyCells.length === 1
        ? `Leave the cell at row ${emptyCells[0].row + 1}, column ${emptyCells[0].col + 1} empty (plain white). Do not stretch panels into the empty cell.`
        : `Leave unused cells empty (plain white): ${emptyCells
            .map((cell) => `row ${cell.row + 1} column ${cell.col + 1}`)
            .join("; ")}. Do not stretch panels into empty cells.`;

  const gutterRule =
    "Use thin, uniform black borders between cells. Each panel should fill its cell edge-to-edge within those gutters.";

  return [
    equalGridRule,
    orderingRule,
    emptyCellRule,
    gutterRule,
    STORYBOARD_SHEET_PANEL_ISOLATION_RULE,
    STORYBOARD_SHEET_NO_TEXT_RULE,
  ].join(" ");
}

export const STORYBOARD_SHEET_PANEL_ISOLATION_RULE =
  "Each panel must be a fully self-contained storyboard frame — one distinct camera shot with its own complete framing and composition. " +
  "Do NOT let characters, props, motion trails, or backgrounds bleed across panel borders or continue from one cell into another. " +
  "Do NOT split a single wide shot, action beat, or panorama across multiple panels. " +
  "Treat every cell as a separate thumbnail, not part of one continuous image.";

export const STORYBOARD_SHEET_NO_TEXT_RULE =
  "Do not add any text, labels, numbers, captions, or logos anywhere on the image.";

/**
 * Prompt text telling video models how to read a multi-panel contact sheet.
 * Wording is kept in sync with {@link resolveStoryboardSheetGrid}.
 */
export function buildStoryboardSheetReadingOrderPrompt(panelCount: number): string {
  const count = Math.max(1, Math.round(panelCount));
  const { cols, rows } = resolveStoryboardSheetGrid(count);
  const gridLabel = `${cols}×${rows}`;

  if (count <= 1) {
    return "The storyboard sheet contains a single full-frame panel.";
  }

  return [
    `The storyboard contact sheet is a uniform ${gridLabel} grid with ${count} panels.`,
    "Read shots in strict order: left to right across each row, then top to bottom row by row.",
    "Panel 1 is the top-left cell; each subsequent panel follows that reading order.",
    "Animate each panel as a distinct shot in that sequence — do not treat the sheet as one collage or pan across it.",
  ].join(" ");
}

/**
 * Single consolidated instruction for storyboard-to-video generation.
 * Replaces separate grid-reading and not-first-frame blocks to avoid repetition.
 */
export function buildStoryboardToVideoInstructionBlock(panelCount: number): string {
  const count = Math.max(1, Math.round(panelCount));
  const { cols, rows } = resolveStoryboardSheetGrid(count);
  const gridHint =
    count > 1
      ? `${cols}×${rows} grid — read panels left-to-right, top-to-bottom. `
      : "";

  return (
    `Storyboard image is a shot-by-shot visual target, not the opening frame. ${gridHint}` +
    "Match each panel's composition as closely as possible — framing, camera angle, subject placement, screen direction, and blocking. " +
    "If a panel is garbled, incoherent, or contradicts the shot timeline or scene, override that panel's composition with a clear cinematic shot that fits the written action and scene continuity instead. " +
    "Animate each panel as its own shot with instant hard cuts between panels — like professional TV editing. " +
    "Do not hold on, pan across, crossfade, dissolve, or fade between panels."
  );
}

export function resolvePanelGridPosition(
  panelIndex: number,
  panelCount: number,
): { col: number; row: number; cols: number; rows: number } {
  const { cols, rows } = resolveStoryboardSheetGrid(panelCount);
  const safeIndex = Math.max(0, Math.min(panelIndex, panelCount - 1));
  return {
    col: safeIndex % cols,
    row: Math.floor(safeIndex / cols),
    cols,
    rows,
  };
}

/** Default 16:9 sheet dimensions used until the image loads. */
export const STORYBOARD_SHEET_FALLBACK_ASPECT = 16 / 9;

/** Base panel width for estimated contact-sheet dimensions before decode. */
export const STORYBOARD_SHEET_FALLBACK_CELL_WIDTH = 320;

/**
 * Estimates full contact-sheet pixel dimensions from panel count and ratio.
 * Crop math only depends on sheet aspect ratio, so this gives a correct layout
 * before the image finishes loading.
 */
export function estimateStoryboardSheetNaturalSize(
  panelCount: number,
  panelAspectRatio = "16:9",
): { width: number; height: number } {
  const { cols, rows } = resolveStoryboardSheetGrid(panelCount);
  const { width: panelWidth, height: panelHeight } = parseAspectRatio(panelAspectRatio);
  const width = Math.max(1, STORYBOARD_SHEET_FALLBACK_CELL_WIDTH * cols);
  const height = Math.max(
    1,
    Math.round((STORYBOARD_SHEET_FALLBACK_CELL_WIDTH * panelHeight * rows) / panelWidth),
  );
  return { width, height };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1;
}

export function parseAspectRatio(ratio: string): { width: number; height: number } {
  const [rawWidth, rawHeight] = ratio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 16, height: 9 };
  }
  return { width, height };
}

export function formatAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function aspectRatioToNumber(ratio: string): number {
  const { width, height } = parseAspectRatio(ratio);
  return width / height;
}

/** Full contact-sheet aspect ratio from panel ratio and grid layout. */
export function computeStoryboardSheetAspectRatio(
  panelAspectRatio: string,
  panelCount: number,
): string {
  const { width: panelWidth, height: panelHeight } = parseAspectRatio(panelAspectRatio);
  const { cols, rows } = resolveStoryboardSheetGrid(panelCount);
  return formatAspectRatio(cols * panelWidth, rows * panelHeight);
}

export interface StoryboardPanelCropLayout {
  width: string;
  height: string;
  left: string;
  top: string;
}

export interface StoryboardPanelMaskRect {
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface StoryboardPanelCropResult {
  image: StoryboardPanelCropLayout;
  masks: StoryboardPanelMaskRect[];
}

function toPercent(fraction: number): string {
  return `${fraction * 100}%`;
}

function maskRect(
  top: number,
  left: number,
  width: number,
  height: number,
): StoryboardPanelMaskRect | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    top: toPercent(top),
    left: toPercent(left),
    width: toPercent(width),
    height: toPercent(height),
  };
}

/**
 * Computes CSS offsets for one grid panel using uniform "contain" scaling, plus
 * overlay masks that hide adjacent panels outside the shot window.
 */
export function computeStoryboardPanelCrop(input: {
  naturalWidth: number;
  naturalHeight: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
  viewportAspect?: number;
}): StoryboardPanelCropResult {
  const {
    naturalWidth,
    naturalHeight,
    col,
    row,
    cols,
    rows,
    viewportAspect = STORYBOARD_SHEET_FALLBACK_ASPECT,
  } = input;

  const sheetWidth = Math.max(1, naturalWidth);
  const sheetHeight = Math.max(1, naturalHeight);
  const viewportHeight = 1 / viewportAspect;

  const uniformScale = Math.min(
    cols / sheetWidth,
    rows / (sheetHeight * viewportAspect),
  );

  const panelWidthFraction = (uniformScale * sheetWidth) / cols;
  const panelHeightFraction =
    uniformScale * sheetHeight / rows / viewportHeight;

  const centerOffsetX = (1 - panelWidthFraction) / 2;
  const centerOffsetY = (1 - panelHeightFraction) / 2;

  const masks = [
    maskRect(0, 0, 1, centerOffsetY),
    maskRect(centerOffsetY + panelHeightFraction, 0, 1, 1 - centerOffsetY - panelHeightFraction),
    maskRect(centerOffsetY, 0, centerOffsetX, panelHeightFraction),
    maskRect(
      centerOffsetY,
      centerOffsetX + panelWidthFraction,
      1 - centerOffsetX - panelWidthFraction,
      panelHeightFraction,
    ),
  ].filter((rect): rect is StoryboardPanelMaskRect => rect !== null);

  return {
    image: {
      width: toPercent(uniformScale * sheetWidth),
      height: "auto",
      left: toPercent(centerOffsetX - col * panelWidthFraction),
      top: toPercent(centerOffsetY - row * panelHeightFraction),
    },
    masks,
  };
}

export function buildCardSheetPanelMap(
  sheets: StoryboardSheetEntry[],
  imageDataUrlBySegmentId: Record<string, string>,
): Map<string, StoryboardSheetPanelPlacement> {
  const placements = new Map<string, StoryboardSheetPanelPlacement>();

  for (const sheet of sheets) {
    const imageDataUrl = imageDataUrlBySegmentId[sheet.segmentId];
    if (!imageDataUrl) continue;

    sheet.shotIds.forEach((shotId, panelIndex) => {
      placements.set(shotId, {
        imageDataUrl,
        panelIndex,
        panelCount: sheet.panelCount,
        segmentTitle: sheet.segmentTitle,
        panelAspectRatio: sheet.panelAspectRatio ?? "16:9",
      });
    });
  }

  return placements;
}
