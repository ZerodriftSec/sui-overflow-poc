export type OpenRouterModelType = "text" | "image" | "video";

export interface OpenRouterModelOption {
  id: string;
  label: string;
  provider: string;
  type: OpenRouterModelType;
}

export type VideoGenerationInputMode =
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video";

/** Per-model clip duration constraints (from OpenRouter video model metadata). */
export interface VideoModelDurationLimits {
  minDurationSec: number;
  maxDurationSec: number;
  /** When set, only these discrete durations are valid (e.g. Veo 3.1). */
  supportedDurations?: readonly number[];
  /** Stricter max when using input_references (reference-to-video). */
  maxReferenceToVideoDurationSec?: number;
}

const VIDEO_MODEL_DURATION_LIMITS: Record<string, VideoModelDurationLimits> = {
  "bytedance/seedance-2.0": {
    minDurationSec: 4,
    maxDurationSec: 15,
  },
  "x-ai/grok-imagine-video": {
    minDurationSec: 1,
    maxDurationSec: 15,
    maxReferenceToVideoDurationSec: 10,
  },
  "kwaivgi/kling-v3.0-pro": {
    minDurationSec: 3,
    maxDurationSec: 15,
  },
  "google/veo-3.1": {
    minDurationSec: 4,
    maxDurationSec: 8,
    supportedDurations: [4, 6, 8],
  },
};

export const OPENROUTER_MODEL_TYPE_LABELS: Record<OpenRouterModelType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
};

const TEXT_MODELS: OpenRouterModelOption[] = [
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    label: "Nemotron 3 Ultra 550B (Free)",
    provider: "Free",
    type: "text",
  },
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B (Free)",
    provider: "Free",
    type: "text",
  },
  {
    id: "moonshotai/kimi-k2.6:free",
    label: "Kimi K2.6 (Free)",
    provider: "Free",
    type: "text",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    label: "Nemotron 3 Ultra 550B",
    provider: "NVIDIA",
    type: "text",
  },
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    type: "text",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    type: "text",
  },
  {
    id: "anthropic/claude-3-haiku",
    label: "Claude 3 Haiku",
    provider: "Anthropic",
    type: "text",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    type: "text",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "OpenAI",
    type: "text",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    type: "text",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    type: "text",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
    type: "text",
  },
  {
    id: "meta-llama/llama-4-maverick",
    label: "Llama 4 Maverick",
    provider: "Meta",
    type: "text",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    type: "text",
  },
];

const IMAGE_MODELS: OpenRouterModelOption[] = [
  {
    id: "bytedance-seed/seedream-4.5",
    label: "Seedream 4.5",
    provider: "ByteDance",
    type: "image",
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Gemini 3.1 Flash Image",
    provider: "Google",
    type: "image",
  },
  {
    id: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    provider: "Google",
    type: "image",
  },
  {
    id: "openai/gpt-image-2",
    label: "GPT Image 2",
    provider: "OpenAI",
    type: "image",
  },
  {
    id: "x-ai/grok-imagine-image-quality",
    label: "Grok Imagine (Quality)",
    provider: "xAI",
    type: "image",
  },
  {
    id: "black-forest-labs/flux.2-pro",
    label: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    type: "image",
  },
  {
    id: "black-forest-labs/flux.2-max",
    label: "FLUX.2 Max",
    provider: "Black Forest Labs",
    type: "image",
  },
];

const VIDEO_MODELS: OpenRouterModelOption[] = [
  {
    id: "bytedance/seedance-2.0",
    label: "Seedance 2.0",
    provider: "ByteDance",
    type: "video",
  },
  {
    id: "bytedance/seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    provider: "ByteDance",
    type: "video",
  },
  {
    id: "x-ai/grok-imagine-video",
    label: "Grok Imagine Video",
    provider: "xAI",
    type: "video",
  },
  {
    id: "kwaivgi/kling-v3.0-pro",
    label: "Kling v3.0 Pro",
    provider: "Kuaishou",
    type: "video",
  },
  {
    id: "google/veo-3.1",
    label: "Veo 3.1",
    provider: "Google",
    type: "video",
  },
];

export const OPENROUTER_MODEL_GROUPS: Record<
  OpenRouterModelType,
  OpenRouterModelOption[]
> = {
  text: TEXT_MODELS,
  image: IMAGE_MODELS,
  video: VIDEO_MODELS,
};

export const OPENROUTER_MODELS = TEXT_MODELS;
export const OPENROUTER_IMAGE_MODELS = IMAGE_MODELS;
export const OPENROUTER_VIDEO_MODELS = VIDEO_MODELS;

export const ALL_OPENROUTER_MODELS: OpenRouterModelOption[] = [
  ...TEXT_MODELS,
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
];

export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v4-pro";
/** Paid text model used by the agent workflow (script + storyboard planning). */
export const DEFAULT_AGENT_SCRIPT_MODEL = "deepseek/deepseek-v4-pro";
export const DEFAULT_STORYBOARD_OPENROUTER_MODEL = "deepseek/deepseek-v4-pro";
/** Default agent-mode text model for script, design analysis, and storyboard planning. */
export const DEFAULT_AGENT_TEXT_MODEL = "openai/gpt-5.4";
export const DEFAULT_DESIGN_ANALYSIS_MODEL = "openai/gpt-5.4"
export const DEFAULT_DESIGN_IMAGE_MODEL = "openai/gpt-image-2";
export const DEFAULT_VIDEO_MODEL = "bytedance/seedance-2.0-fast";

/** OpenRouter `duration` field — seconds, integer >= 1. */
export const DEFAULT_VIDEO_DURATION_SEC = 5;
export const MIN_VIDEO_DURATION_SEC = 1;
export const MAX_VIDEO_DURATION_SEC = 15;
export const VIDEO_DURATION_PRESETS = [4, 5, 6, 8, 10, 12, 15] as const;

/**
 * Agent mode supports longer total duration (up to 60 seconds / 1 minute).
 * The workflow breaks the content into chunks of up to 15 seconds each
 * for storyboard cards and video generation.
 */
export const AGENT_MODE_MAX_TOTAL_DURATION_SEC = 60;
export const AGENT_MODE_DEFAULT_TOTAL_DURATION_SEC = 15;
export const AGENT_MODE_CHUNK_DURATION_SEC = 15;

export const VIDEO_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
  "9:21",
] as const;

export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

/** Aspect ratios shown in the Output popup (matches common video presets). */
export const VIDEO_OUTPUT_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
] as const satisfies readonly VideoAspectRatio[];

export type VideoAspectRatioSetting = (typeof VIDEO_OUTPUT_ASPECT_RATIOS)[number];

export const VIDEO_RESOLUTIONS = [
  "480p",
  "720p",
  "1080p",
  "1K",
  "2K",
  "4K",
] as const;

export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/** Resolutions shown in the Output popup. */
export const VIDEO_OUTPUT_RESOLUTIONS = ["480p", "720p", "1080p"] as const satisfies
  readonly VideoResolution[];

export const DEFAULT_VIDEO_ASPECT_RATIO: VideoAspectRatio = "16:9";
export const DEFAULT_VIDEO_ASPECT_RATIO_SETTING: VideoAspectRatioSetting =
  DEFAULT_VIDEO_ASPECT_RATIO;
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = "720p";

export const IMAGE_GENERATION_SIZES = ["1K", "2K", "4K"] as const;
export type ImageGenerationSize = (typeof IMAGE_GENERATION_SIZES)[number];
export const DEFAULT_IMAGE_GENERATION_SIZE: ImageGenerationSize = "2K";
/** @deprecated Use {@link DEFAULT_IMAGE_GENERATION_SIZE}. */
export const DEFAULT_STORYBOARD_SHEET_IMAGE_SIZE = DEFAULT_IMAGE_GENERATION_SIZE;

export function formatVideoOutputSummary(
  aspectRatio: VideoAspectRatioSetting,
  resolution: VideoResolution,
): string {
  return `${aspectRatio} | ${resolution}`;
}

export function getVideoModelDurationLimits(
  modelId: string,
): VideoModelDurationLimits {
  return (
    VIDEO_MODEL_DURATION_LIMITS[modelId] ?? {
      minDurationSec: MIN_VIDEO_DURATION_SEC,
      maxDurationSec: MAX_VIDEO_DURATION_SEC,
    }
  );
}

export function resolveVideoInputMode(options: {
  hasInputReferences?: boolean;
  hasFrameImages?: boolean;
}): VideoGenerationInputMode {
  if (options.hasInputReferences) {
    return "reference-to-video";
  }
  if (options.hasFrameImages) {
    return "image-to-video";
  }
  return "text-to-video";
}

export function getMaxVideoDurationSec(
  modelId: string,
  inputMode: VideoGenerationInputMode = "text-to-video",
): number {
  const limits = getVideoModelDurationLimits(modelId);
  if (
    inputMode === "reference-to-video" &&
    limits.maxReferenceToVideoDurationSec != null
  ) {
    return limits.maxReferenceToVideoDurationSec;
  }
  return limits.maxDurationSec;
}

/** Max per-clip duration for agent workflow (always uses reference images). */
export function getAgentModeMaxClipDurationSec(modelId: string): number {
  return Math.min(
    AGENT_MODE_CHUNK_DURATION_SEC,
    getMaxVideoDurationSec(modelId, "reference-to-video"),
  );
}

function snapToSupportedDuration(
  value: number,
  supportedDurations: readonly number[],
  min: number,
  max: number,
): number {
  const eligible = supportedDurations.filter(
    (duration) => duration >= min && duration <= max,
  );
  if (eligible.length === 0) {
    return Math.min(max, Math.max(min, Math.round(value)));
  }
  return eligible.reduce((closest, duration) =>
    Math.abs(duration - value) < Math.abs(closest - value) ? duration : closest,
  );
}

export function clampVideoDurationSecForModel(
  value: number,
  modelId: string,
  inputMode: VideoGenerationInputMode = "text-to-video",
): number {
  const limits = getVideoModelDurationLimits(modelId);
  const max = getMaxVideoDurationSec(modelId, inputMode);
  const min = limits.minDurationSec;
  const rounded = Math.min(max, Math.max(min, Math.round(value)));

  if (limits.supportedDurations?.length) {
    return snapToSupportedDuration(rounded, limits.supportedDurations, min, max);
  }
  return rounded;
}

export interface VideoDurationSliderConfig {
  minDurationSec: number;
  maxDurationSec: number;
  /** When set, the slider steps through these values only. */
  discreteDurations?: number[];
  hint?: string;
}

export function getVideoDurationSliderConfig(
  modelId: string,
  inputMode: VideoGenerationInputMode,
): VideoDurationSliderConfig {
  const limits = getVideoModelDurationLimits(modelId);
  const maxDurationSec = getMaxVideoDurationSec(modelId, inputMode);
  const minDurationSec = limits.minDurationSec;

  let discreteDurations: number[] | undefined;
  if (limits.supportedDurations?.length) {
    const eligible = limits.supportedDurations.filter(
      (duration) => duration >= minDurationSec && duration <= maxDurationSec,
    );
    if (eligible.length > 0) {
      discreteDurations = eligible;
    }
  }

  let hint: string | undefined;
  if (
    inputMode === "reference-to-video" &&
    limits.maxReferenceToVideoDurationSec != null &&
    limits.maxReferenceToVideoDurationSec < limits.maxDurationSec
  ) {
    hint = `Max ${limits.maxReferenceToVideoDurationSec}s with reference images`;
  }

  return {
    minDurationSec: discreteDurations?.[0] ?? minDurationSec,
    maxDurationSec:
      discreteDurations?.[discreteDurations.length - 1] ?? maxDurationSec,
    discreteDurations,
    hint,
  };
}

export function clampVideoDurationSec(value: number): number {
  return Math.min(
    MAX_VIDEO_DURATION_SEC,
    Math.max(MIN_VIDEO_DURATION_SEC, Math.round(value)),
  );
}

export function parseVideoDurationDraft(draft: string): number {
  const parsed = Number.parseInt(draft.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_VIDEO_DURATION_SEC;
  }
  return clampVideoDurationSec(parsed);
}

export function getOpenRouterModelLabel(modelId: string): string {
  return (
    ALL_OPENROUTER_MODELS.find((model) => model.id === modelId)?.label ?? modelId
  );
}

export function isFreeOpenRouterModel(modelId: string): boolean {
  if (modelId.endsWith(":free")) return true;
  const model = ALL_OPENROUTER_MODELS.find((entry) => entry.id === modelId);
  return model?.provider === "Free";
}

const FREE_MODEL_PAID_ALTERNATIVES: Record<string, string> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": "nvidia/nemotron-3-ultra-550b-a55b",
  "openai/gpt-oss-120b:free": "openai/gpt-4o-mini",
  "moonshotai/kimi-k2.6:free": DEFAULT_AGENT_SCRIPT_MODEL,
};

/** Agent workflow must not use free-tier models — they often fail with provider errors. */
export function resolveAgentWorkflowModelId(
  modelId: string,
  fallback = DEFAULT_AGENT_SCRIPT_MODEL,
): string {
  if (!isFreeOpenRouterModel(modelId)) return modelId;
  return FREE_MODEL_PAID_ALTERNATIVES[modelId] ?? fallback;
}

/** Paid text models shown in the agent-mode Text picker. */
export function getAgentWorkflowTextModels(): OpenRouterModelOption[] {
  return OPENROUTER_MODELS.filter((model) => !isFreeOpenRouterModel(model.id));
}

export function getOpenRouterModelsByType(
  type: OpenRouterModelType,
): OpenRouterModelOption[] {
  return OPENROUTER_MODEL_GROUPS[type];
}

/** Aspect ratios accepted by OpenRouter shared `aspect_ratio`. */
export const OPENROUTER_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

/** Aspect ratios accepted by xAI Grok Imagine via OpenRouter `image_config`. */
export const XAI_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "9:19.5",
  "19.5:9",
  "9:20",
  "20:9",
  "1:2",
  "2:1",
] as const;

export type OpenRouterImageAspectRatio =
  (typeof OPENROUTER_IMAGE_ASPECT_RATIOS)[number];

export type XaiImageAspectRatio = (typeof XAI_IMAGE_ASPECT_RATIOS)[number];

export type ResolvedImageAspectRatio =
  | OpenRouterImageAspectRatio
  | XaiImageAspectRatio
  | "auto";

function isXaiImageModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.startsWith("x-ai/") || normalized.includes("grok-imagine")
  );
}

function parseAspectRatioNumeric(ratio: string): number {
  const [rawWidth, rawHeight] = ratio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 16 / 9;
  }
  return width / height;
}

function closestAspectRatio(
  aspectRatio: string,
  candidates: readonly string[],
): string {
  if (candidates.includes(aspectRatio)) {
    return aspectRatio;
  }

  const target = parseAspectRatioNumeric(aspectRatio);
  let closest = candidates[0];
  let closestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const delta = Math.abs(parseAspectRatioNumeric(candidate) - target);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = candidate;
    }
  }

  return closest;
}

/**
 * Map arbitrary ratios (e.g. storyboard contact sheets) to a supported OpenRouter value.
 * For xAI, unsupported ratios use `auto` so the model can follow the prompt layout
 * instead of snapping to a mismatched fixed ratio (e.g. 48:9 → 20:9).
 */
export function resolveOpenRouterImageAspectRatio(
  aspectRatio: string,
  modelId?: string,
): ResolvedImageAspectRatio {
  if (modelId && isXaiImageModel(modelId)) {
    if (
      XAI_IMAGE_ASPECT_RATIOS.includes(aspectRatio as XaiImageAspectRatio)
    ) {
      return aspectRatio as XaiImageAspectRatio;
    }
    return "auto";
  }

  return closestAspectRatio(
    aspectRatio,
    OPENROUTER_IMAGE_ASPECT_RATIOS,
  ) as OpenRouterImageAspectRatio;
}

/** Whether the model can accept reference images via Images API `input_references`. */
export function supportsOpenRouterReferenceImageInput(
  _modelId: string,
): boolean {
  // All current OpenRouter image models accept input_references on /api/v1/images.
  return true;
}

/**
 * Whether the video model honors video (and audio) assets in
 * `/api/v1/videos` `input_references`. Image references work across providers;
 * video/audio are currently Seedance 2.0 only.
 */
export function supportsOpenRouterVideoReferenceInput(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return (
    normalized === "bytedance/seedance-2.0" ||
    normalized === "bytedance/seedance-2.0-fast" ||
    normalized.startsWith("bytedance/seedance-2.0")
  );
}

function resolveOpenRouterImageSize(
  modelId: string,
  imageSize: ImageGenerationSize,
): ImageGenerationSize {
  // xAI Grok Imagine only supports 1K and 2K.
  if (isXaiImageModel(modelId) && imageSize === "4K") {
    return "2K";
  }
  return imageSize;
}

function isOpenAiGptImageModel(modelId: string): boolean {
  return modelId.toLowerCase().includes("gpt-image");
}

function isFluxImageModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes("/flux") || normalized.includes("black-forest-labs/")
  );
}

/** OpenAI GPT Image and Flux endpoints omit aspect_ratio / resolution on /api/v1/images. */
function supportsImagesApiAspectRatio(modelId: string): boolean {
  return !isOpenAiGptImageModel(modelId) && !isFluxImageModel(modelId);
}

function supportsImagesApiResolution(modelId: string): boolean {
  if (!supportsImagesApiAspectRatio(modelId)) {
    return false;
  }
  // Gemini 2.5 Flash Image supports aspect_ratio but not resolution.
  const normalized = modelId.toLowerCase();
  if (normalized.includes("gemini-2.5") && normalized.includes("image")) {
    return false;
  }
  return true;
}

/**
 * Build top-level `/api/v1/images` params for aspect ratio and resolution.
 * Omits fields unsupported by the target model to avoid 400s.
 */
export function buildOpenRouterImagesParams(
  modelId: string,
  options: { aspectRatio: string; imageSize?: ImageGenerationSize },
): { aspect_ratio?: string; resolution?: string } {
  const params: { aspect_ratio?: string; resolution?: string } = {};

  if (supportsImagesApiAspectRatio(modelId)) {
    params.aspect_ratio = resolveOpenRouterImageAspectRatio(
      options.aspectRatio,
      modelId,
    );
  }

  if (supportsImagesApiResolution(modelId)) {
    params.resolution = resolveOpenRouterImageSize(
      modelId,
      options.imageSize ?? DEFAULT_IMAGE_GENERATION_SIZE,
    );
  }

  return params;
}
