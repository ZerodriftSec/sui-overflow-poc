import type { ChatImageAttachment } from "./chat-image-attachment";
import { imageBytesToDataUrl } from "./chat-image-storage";
import type { GeneratedDesignAsset } from "./design-llm";
import { AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS } from "./design-llm";
import type { FilmVideoImageBytes } from "./film-llm";
import {
  DEFAULT_DESIGN_IMAGE_MODEL,
  DEFAULT_IMAGE_GENERATION_SIZE,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  type ImageGenerationSize,
  type VideoAspectRatioSetting,
} from "./openrouter-models";
import type {
  Project,
  StoryboardAsset,
  StoryboardCard,
  StoryboardDocument,
  StoryboardSheetEntry,
} from "./project";
import type { AppSettings } from "./settings";
import {
  buildStoryboardSheetReadingOrderPrompt,
  buildStoryboardToVideoInstructionBlock,
} from "./storyboard-sheet-layout";
import type { WalrusStorageContext } from "./storage/walrus-storage";
import {
  groupStoryboardCardsIntoSegments,
  type StoryboardSegment,
} from "./workflow-options";
import {
  buildCompactSegmentVideoPrompt,
  buildSegmentVideoPrompt,
  resolveSegmentCards,
  runStoryboardSheetAgent,
  type StoryboardSheet,
} from "./workflow-agents";
import {
  listDesignAssetsForProject,
  listStoryboardAssetsForProject,
  loadDesignAssetDocument,
  loadDesignImageDataUrl,
  loadStoryboardAssetDocument,
} from "./workspace";

export const MAX_VIDEO_INPUT_REFERENCES = 7;
export const MAX_CHARACTER_REFERENCES_PER_CLIP = 5;
export const STORYBOARD_TO_VIDEO_SKILL_ID = "storyboard-to-video";

export function isStoryboardToVideoSkill(skillId: string | null | undefined): boolean {
  return skillId === STORYBOARD_TO_VIDEO_SKILL_ID;
}

const STORYBOARD_NOT_FIRST_FRAME_MARKER =
  "not the opening frame";

export function buildStoryboardSheetOnlyReferences(input: {
  segmentTitle: string;
  sheetMimeType: string;
  sheetBytes: Uint8Array;
}): FilmVideoImageBytes[] {
  return [
    {
      name: `${input.segmentTitle} storyboard sheet`,
      kind: "storyboard",
      mimeType: input.sheetMimeType,
      bytes: input.sheetBytes,
    },
  ];
}

export function buildAttachedImageReferenceLegend(
  references: FilmVideoImageBytes[],
): string {
  if (references.length === 0) {
    return "";
  }

  const lines = references.map((reference, index) => {
    const imageNumber = index + 1;
    const label = reference.name?.trim() || `Reference ${imageNumber}`;
    switch (reference.kind) {
      case "storyboard":
        return `Image ${imageNumber}: Storyboard contact sheet "${label}" — primary visual target for shot order and panel composition; override a panel only if it is broken or contradicts the scene`;
      case "character":
        return `Image ${imageNumber}: Character sheet "${label}" — likeness, wardrobe, and proportions for this character only`;
      case "environment":
        return `Image ${imageNumber}: Environment reference "${label}" — setting, architecture, palette, and lighting`;
      case "video":
        return `Video ${imageNumber}: Video reference "${label}" — match motion, timing, camera path, and scene continuity from this clip`;
      default:
        if (reference.mimeType.trim().toLowerCase().startsWith("video/")) {
          return `Video ${imageNumber}: Video reference "${label}" — match motion, timing, camera path, and scene continuity from this clip`;
        }
        return `Image ${imageNumber}: Reference image "${label}"`;
    }
  });

  return ["Attached images in order:", ...lines].join("\n");
}

export function finalizeStoryboardToVideoPrompt(input: {
  basePrompt: string;
  inputReferences: FilmVideoImageBytes[];
  panelCount?: number;
}): string {
  const parts: string[] = [input.basePrompt.trim()];

  const panelCount =
    typeof input.panelCount === "number" && input.panelCount > 0
      ? Math.round(input.panelCount)
      : undefined;
  const hasStoryboardReference = input.inputReferences.some(
    (reference) => reference.kind === "storyboard",
  );

  if (
    hasStoryboardReference &&
    panelCount &&
    !input.basePrompt.includes(STORYBOARD_NOT_FIRST_FRAME_MARKER)
  ) {
    parts.push(buildStoryboardToVideoInstructionBlock(panelCount));
  }

  const legend = buildAttachedImageReferenceLegend(input.inputReferences);
  if (legend) {
    parts.push(legend);
  }

  return parts.filter((part) => part.trim().length > 0).join("\n\n");
}

export function prepareStoryboardToVideoReferences(
  references: FilmVideoImageBytes[],
): FilmVideoImageBytes[] {
  return references.map((reference) => ({
    ...reference,
    kind: reference.kind ?? "storyboard",
  }));
}

function resolveStoryboardToVideoInputReferences(
  requestReferences: FilmVideoImageBytes[],
  context: ControlModeFilmContext | null,
): FilmVideoImageBytes[] {
  if (requestReferences.length > 0) {
    return prepareStoryboardToVideoReferences(requestReferences);
  }
  if (!context) {
    return [];
  }
  const storyboardReferences = context.inputReferences.filter(
    (reference) => reference.kind === "storyboard",
  );
  return storyboardReferences.length > 0
    ? storyboardReferences
    : context.inputReferences;
}

export function prepareStoryboardToVideoGeneration(input: {
  prompt: string;
  inputReferences: FilmVideoImageBytes[];
  generationSkillId?: string | null;
  firstFrame?: FilmVideoImageBytes;
  lastFrame?: FilmVideoImageBytes;
  panelCount?: number;
}): {
  prompt: string;
  inputReferences: FilmVideoImageBytes[];
  firstFrame?: FilmVideoImageBytes;
  lastFrame?: FilmVideoImageBytes;
} {
  if (!isStoryboardToVideoSkill(input.generationSkillId)) {
    return {
      prompt: input.prompt,
      inputReferences: input.inputReferences,
      firstFrame: input.firstFrame,
      lastFrame: input.lastFrame,
    };
  }

  const inputReferences = prepareStoryboardToVideoReferences(
    input.inputReferences,
  );

  return {
    prompt: finalizeStoryboardToVideoPrompt({
      basePrompt: input.prompt,
      inputReferences,
      panelCount: input.panelCount,
    }),
    inputReferences,
    firstFrame: undefined,
    lastFrame: undefined,
  };
}

export interface ControlModeFilmContext {
  storyboardId: string;
  segmentIndex: number;
  prompt: string;
  durationSec: number;
  inputReferences: FilmVideoImageBytes[];
  attachments: ChatImageAttachment[];
  sourceStoryboardId: string;
  sourceShotId: string;
  storyboardPanelCount?: number;
}

export interface ResolveControlModeFilmContextInput {
  ctx: WalrusStorageContext;
  project: Project;
  storyboardId: string;
  segmentIndex?: number;
  settings: AppSettings;
  /** When true, only attach the storyboard sheet — no design asset references. */
  storyboardReferenceOnly?: boolean;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseDataUrl(dataUrl: string): { mimeType: string; dataBase64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return {
    mimeType: match[1],
    dataBase64: match[2],
  };
}

export function designAssetsToReferenceImages(designAssets: GeneratedDesignAsset[]): {
  characterReferenceImages: FilmVideoImageBytes[];
  environmentReferenceImages: FilmVideoImageBytes[];
} {
  const characterReferenceImages = designAssets
    .filter((asset) => asset.kind === "character")
    .map((asset) => ({
      name: asset.title,
      kind: "character" as const,
      mimeType: asset.image.mimeType,
      bytes: base64ToBytes(asset.image.dataBase64),
    }));

  const environmentReferenceImages = designAssets
    .filter((asset) => asset.kind === "environment")
    .map((asset) => ({
      name: asset.title,
      kind: "environment" as const,
      mimeType: asset.image.mimeType,
      bytes: base64ToBytes(asset.image.dataBase64),
    }));

  return { characterReferenceImages, environmentReferenceImages };
}

export function buildFilmInputReferences(input: {
  segmentTitle: string;
  sheetMimeType: string;
  sheetBytes: Uint8Array;
  designAssets: GeneratedDesignAsset[];
}): FilmVideoImageBytes[] {
  const { characterReferenceImages, environmentReferenceImages } =
    designAssetsToReferenceImages(input.designAssets);

  const storyboardReference: FilmVideoImageBytes = {
    name: `${input.segmentTitle} storyboard sheet`,
    kind: "storyboard",
    mimeType: input.sheetMimeType,
    bytes: input.sheetBytes,
  };
  const environmentReference = environmentReferenceImages[0];
  const characterReferencesForClip = characterReferenceImages.slice(
    0,
    MAX_CHARACTER_REFERENCES_PER_CLIP,
  );

  return [
    storyboardReference,
    ...(environmentReference ? [environmentReference] : []),
    ...characterReferencesForClip,
  ].slice(0, MAX_VIDEO_INPUT_REFERENCES);
}

export function buildFilmReferenceImageLegend(
  references: FilmVideoImageBytes[],
): string {
  return buildAttachedImageReferenceLegend(references);
}

function appendFilmReferenceLegendToPrompt(
  prompt: string,
  inputReferences: FilmVideoImageBytes[],
): string {
  const legend = buildFilmReferenceImageLegend(inputReferences);
  if (!legend) {
    return prompt;
  }
  if (prompt.includes("Attached images in order:")) {
    return prompt;
  }

  return [prompt, legend].filter((part) => part.trim().length > 0).join("\n\n");
}

export function augmentFilmClipPrompt(
  basePrompt: string,
  durationSec: number,
  panelCount: number,
  inputReferences?: FilmVideoImageBytes[],
): string {
  return appendFilmReferenceLegendToPrompt(
    [
      basePrompt,
      `Animate this ${durationSec}-second video segment following the ${panelCount} storyboard panel${panelCount === 1 ? "" : "s"} in order.`,
      buildStoryboardSheetReadingOrderPrompt(panelCount),
      "Match each panel's composition as closely as possible. If a panel is garbled or contradicts the scene, override it with a clear shot that fits the written action. Do not pan across the contact sheet as a still.",
    ].join(" "),
    inputReferences ?? [],
  );
}

export function filmReferencesToChatAttachments(
  references: FilmVideoImageBytes[],
): ChatImageAttachment[] {
  return references.map((reference) => {
    const dataUrl = imageBytesToDataUrl(reference.bytes, reference.mimeType);
    const mediaKind =
      reference.kind === "video" ||
      reference.mimeType.trim().toLowerCase().startsWith("video/")
        ? ("video" as const)
        : ("image" as const);
    return {
      id: crypto.randomUUID(),
      name: reference.name ?? "reference",
      mimeType: reference.mimeType,
      previewUrl: dataUrl,
      dataUrl,
      mediaKind,
    };
  });
}

async function storyboardSheetEntryToRuntimeSheet(
  ctx: WalrusStorageContext,
  entry: StoryboardSheetEntry,
): Promise<StoryboardSheet | null> {
  const inlineDataBase64 = entry.image.dataBase64?.trim();
  let dataBase64 = inlineDataBase64;
  let mimeType = entry.image.mimeType;

  if (!dataBase64) {
    const imageBlobId = entry.image.imageBlobId?.trim();
    if (!imageBlobId) {
      return null;
    }

    try {
      const dataUrl = await loadDesignImageDataUrl(ctx, entry.image);
      const parsed = parseDataUrl(dataUrl);
      dataBase64 = parsed.dataBase64;
      mimeType = parsed.mimeType;
    } catch {
      return null;
    }
  }

  return {
    segmentId: entry.segmentId,
    segmentIndex: entry.segmentIndex,
    segmentTitle: entry.segmentTitle,
    durationSec: entry.durationSec,
    shotIds: entry.shotIds,
    panelCount: entry.panelCount,
    shotId: entry.shotId,
    shotTitle: entry.segmentTitle,
    mimeType,
    dataBase64,
    prompt: entry.prompt,
    panelAspectRatio:
      (entry.panelAspectRatio as StoryboardSheet["panelAspectRatio"]) ??
      DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  };
}

function runtimeSheetToStoryboardEntry(sheet: StoryboardSheet): StoryboardSheetEntry {
  return {
    segmentId: sheet.segmentId,
    segmentIndex: sheet.segmentIndex,
    segmentTitle: sheet.segmentTitle,
    durationSec: sheet.durationSec,
    shotIds: sheet.shotIds,
    panelCount: sheet.panelCount,
    shotId: sheet.shotId,
    prompt: sheet.prompt,
    panelAspectRatio: sheet.panelAspectRatio,
    image: {
      mimeType: sheet.mimeType,
      dataBase64: sheet.dataBase64,
    },
  };
}

async function loadStoryboardAssetById(
  ctx: WalrusStorageContext,
  project: Project,
  storyboardId: string,
): Promise<StoryboardAsset> {
  const assets = await listStoryboardAssetsForProject(ctx, project);
  const asset = assets.find((entry) => entry.id === storyboardId);
  if (!asset) {
    throw new Error("Storyboard not found");
  }
  return asset;
}

export async function loadProjectDesignAssets(
  ctx: WalrusStorageContext,
  project: Project,
): Promise<GeneratedDesignAsset[]> {
  const assets = await listDesignAssetsForProject(ctx, project);
  const loaded: GeneratedDesignAsset[] = [];

  for (const asset of assets) {
    const document = await loadDesignAssetDocument(ctx, project, asset);
    const designAsset = document.assets[0];
    if (!designAsset?.image) continue;

    const dataUrl = await loadDesignImageDataUrl(ctx, designAsset.image);
    const parsed = parseDataUrl(dataUrl);

    loaded.push({
      title: designAsset.title,
      kind: designAsset.kind,
      description: designAsset.description,
      scriptReferences: "",
      imagePrompt: designAsset.prompt,
      generationModelId: designAsset.generationModelId,
      image: {
        mimeType: parsed.mimeType,
        dataBase64: parsed.dataBase64,
      },
    });
  }

  return loaded;
}

export interface GenerateStoryboardContactSheetsInput {
  cards: StoryboardCard[];
  designAssets: GeneratedDesignAsset[];
  settings: AppSettings;
  imageModelId?: string;
  imageSize?: ImageGenerationSize;
  panelAspectRatio?: VideoAspectRatioSetting;
  segmentDurations?: number[];
  styleBrief?: string;
  signal?: AbortSignal;
  onProgress?: (current: number, total: number, title: string) => void;
  throwOnError?: boolean;
}

export async function generateStoryboardContactSheets(
  input: GenerateStoryboardContactSheetsInput,
): Promise<StoryboardSheetEntry[]> {
  const characterRefs = input.designAssets.filter(
    (asset) => asset.kind === "character",
  );
  const environmentRefs = input.designAssets
    .filter((asset) => asset.kind === "environment")
    .slice(0, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS);

  const generatedSheets = await runStoryboardSheetAgent(
    input.cards,
    characterRefs,
    environmentRefs,
    input.settings,
    {
      imageModelId: input.imageModelId ?? DEFAULT_DESIGN_IMAGE_MODEL,
      imageSize: input.imageSize ?? DEFAULT_IMAGE_GENERATION_SIZE,
      panelAspectRatio:
        input.panelAspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
      signal: input.signal,
      segmentDurations: input.segmentDurations,
      styleBrief: input.styleBrief,
      onProgress: input.onProgress,
      throwOnError: input.throwOnError ?? true,
    },
  );

  return generatedSheets.map(runtimeSheetToStoryboardEntry);
}

async function loadStoryboardSheets(input: {
  ctx: WalrusStorageContext;
  document: StoryboardDocument;
  onStatus?: (message: string) => void;
}): Promise<StoryboardSheet[]> {
  const entries = input.document.sheets ?? [];
  if (entries.length === 0) {
    return [];
  }

  input.onStatus?.("Loading storyboard contact sheets…");

  const loaded = await Promise.all(
    entries.map((entry) => storyboardSheetEntryToRuntimeSheet(input.ctx, entry)),
  );

  return loaded.filter((sheet): sheet is StoryboardSheet => sheet !== null);
}

function resolveTextOnlyStoryboardSegment(
  cards: StoryboardCard[],
  segmentIndex: number,
): StoryboardSegment {
  const segments = groupStoryboardCardsIntoSegments(cards);
  if (segments.length === 0) {
    const durationSec = Math.max(
      1,
      cards.reduce(
        (sum, card) => sum + Math.max(1, Math.round(card.estimatedDurationSec)),
        0,
      ),
    );
    return {
      segmentIndex: 0,
      durationSec,
      cards,
    };
  }

  const index = Math.min(Math.max(segmentIndex, 0), segments.length - 1);
  return segments[index]!;
}

async function loadSheetBytes(sheet: StoryboardSheet): Promise<Uint8Array> {
  if (sheet.dataBase64.trim().length > 0) {
    return base64ToBytes(sheet.dataBase64);
  }

  throw new Error("Storyboard sheet image is missing data");
}

export async function resolveControlModeFilmContext(
  input: ResolveControlModeFilmContextInput,
): Promise<ControlModeFilmContext> {
  const storyboardAsset = await loadStoryboardAssetById(
    input.ctx,
    input.project,
    input.storyboardId,
  );
  const document = await loadStoryboardAssetDocument(
    input.ctx,
    input.project,
    storyboardAsset,
  );
  const cards = document.cards ?? [];

  if (cards.length === 0) {
    throw new Error("Storyboard has no shots to film");
  }

  input.onStatus?.(
    input.storyboardReferenceOnly
      ? "Loading storyboard contact sheet…"
      : "Loading design references…",
  );
  const designAssets = input.storyboardReferenceOnly
    ? []
    : await loadProjectDesignAssets(input.ctx, input.project);

  const sheets = await loadStoryboardSheets({
    ctx: input.ctx,
    document,
    onStatus: input.onStatus,
  });

  const segmentIndex = Math.max(input.segmentIndex ?? 0, 0);

  if (sheets.length > 0) {
    const sheet = sheets[Math.min(segmentIndex, sheets.length - 1)]!;
    const segmentCards = resolveSegmentCards(sheet, cards);
    const durationSec = Math.max(1, Math.round(sheet.durationSec));
    const sheetBytes = await loadSheetBytes(sheet);
    const inputReferences = input.storyboardReferenceOnly
      ? buildStoryboardSheetOnlyReferences({
          segmentTitle: sheet.segmentTitle,
          sheetMimeType: sheet.mimeType,
          sheetBytes,
        })
      : buildFilmInputReferences({
          segmentTitle: sheet.segmentTitle,
          sheetMimeType: sheet.mimeType,
          sheetBytes,
          designAssets,
        });
    const buildPrompt = input.storyboardReferenceOnly
      ? buildCompactSegmentVideoPrompt
      : buildSegmentVideoPrompt;
    const basePrompt =
      segmentCards.length > 0
        ? buildPrompt(segmentCards, durationSec)
        : sheet.segmentTitle;
    const prompt = input.storyboardReferenceOnly
      ? basePrompt
      : augmentFilmClipPrompt(
          basePrompt,
          durationSec,
          sheet.panelCount,
          inputReferences,
        );

    return {
      storyboardId: input.storyboardId,
      segmentIndex: sheet.segmentIndex,
      prompt,
      durationSec,
      inputReferences,
      attachments: filmReferencesToChatAttachments(inputReferences),
      sourceStoryboardId: input.storyboardId,
      sourceShotId: sheet.shotId,
      storyboardPanelCount: sheet.panelCount,
    };
  }

  const segment = resolveTextOnlyStoryboardSegment(cards, segmentIndex);
  const segmentCards = segment.cards;
  const durationSec = Math.max(1, Math.round(segment.durationSec));
  const buildPrompt = input.storyboardReferenceOnly
    ? buildCompactSegmentVideoPrompt
    : buildSegmentVideoPrompt;
  const prompt =
    segmentCards.length > 0
      ? buildPrompt(segmentCards, durationSec)
      : "Generate a cinematic video clip from the attached storyboard.";

  return {
    storyboardId: input.storyboardId,
    segmentIndex: segment.segmentIndex,
    prompt,
    durationSec,
    inputReferences: [],
    attachments: [],
    sourceStoryboardId: input.storyboardId,
    sourceShotId: segmentCards[0]?.id ?? cards[0]!.id,
    storyboardPanelCount:
      segmentCards.length > 0 ? segmentCards.length : undefined,
  };
}

export function mergeStoryboardContextPrompt(
  contextPrompt: string,
  userPrompt: string,
): string {
  const trimmedContext = contextPrompt.trim();
  const trimmedUser = userPrompt.trim();

  if (!trimmedContext) {
    return trimmedUser;
  }
  if (!trimmedUser) {
    return trimmedContext;
  }

  return `${trimmedContext}\n\nAdditional direction from the user:\n${trimmedUser}`;
}

export function mergeFilmGenerationRequest(input: {
  requestPrompt: string;
  requestReferences: FilmVideoImageBytes[];
  context: ControlModeFilmContext | null;
  generationSkillId?: string | null;
}): {
  prompt: string;
  inputReferences: FilmVideoImageBytes[];
  durationSec?: number;
  sourceStoryboardId?: string;
  sourceShotId?: string;
} {
  const trimmedPrompt = input.requestPrompt.trim();
  const hasUserReferences = input.requestReferences.length > 0;
  const storyboardToVideo = isStoryboardToVideoSkill(input.generationSkillId);

  if (!input.context) {
    return {
      prompt: appendFilmReferenceLegendToPrompt(
        input.requestPrompt,
        input.requestReferences,
      ),
      inputReferences: input.requestReferences,
    };
  }

  const inputReferences = storyboardToVideo
    ? resolveStoryboardToVideoInputReferences(
        input.requestReferences,
        input.context,
      )
    : hasUserReferences
      ? input.requestReferences
      : input.context.inputReferences;
  const basePrompt = mergeStoryboardContextPrompt(
    input.context.prompt,
    trimmedPrompt.length > 0 ? input.requestPrompt : "",
  );
  const prompt = storyboardToVideo
    ? basePrompt
    : appendFilmReferenceLegendToPrompt(basePrompt, inputReferences);

  return {
    prompt,
    inputReferences,
    durationSec: input.context.durationSec,
    sourceStoryboardId: input.context.sourceStoryboardId,
    sourceShotId: input.context.sourceShotId,
  };
}
