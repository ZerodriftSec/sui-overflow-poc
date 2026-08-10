import { createDownload, experimental_generateVideo } from "ai";
import { stripImageMentionsFromPrompt } from "./chat-image-mention";
import { imageBytesToDataUrl } from "./chat-image-storage";
import {
  clampVideoDurationSecForModel,
  DEFAULT_VIDEO_ASPECT_RATIO_SETTING,
  DEFAULT_VIDEO_DURATION_SEC,
  DEFAULT_VIDEO_RESOLUTION,
  MIN_VIDEO_DURATION_SEC,
  resolveVideoInputMode,
  supportsOpenRouterVideoReferenceInput,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "./openrouter-models";
import type { AppSettings } from "./settings";
import { createVideoGenerationModel } from "./agent";
import { formatProviderError } from "./provider-error";

export const VIDEO_SCENE_INTEGRITY_RULES = `SCENE INTEGRITY (CRITICAL):
- Keep all motion and physical interactions coherent: respect gravity, momentum, balance, collisions, object contact, footing, and plausible trajectories. No teleporting, sliding feet, intersecting bodies or objects, impossible impacts, or unexplained changes in position.
- Do not duplicate, clone, mirror, or multiply any person within a shot. Each intended person must appear exactly once unless the written scene explicitly requires identical people. Preserve the correct number, identity, appearance, and position of all characters across the clip.`;

export function finalizeVideoGenerationPrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return "";
  }
  if (trimmedPrompt.includes("SCENE INTEGRITY (CRITICAL):")) {
    return trimmedPrompt;
  }
  return `${trimmedPrompt}\n\n${VIDEO_SCENE_INTEGRITY_RULES}`;
}

function normalizeVideoDuration(
  durationSec: number | undefined,
  videoModelId: string,
  inputMode: ReturnType<typeof resolveVideoInputMode>,
): number {
  const value = durationSec ?? DEFAULT_VIDEO_DURATION_SEC;
  if (!Number.isFinite(value) || value < MIN_VIDEO_DURATION_SEC) {
    throw new Error(
      `Video duration must be at least ${MIN_VIDEO_DURATION_SEC} second.`,
    );
  }
  return clampVideoDurationSecForModel(value, videoModelId, inputMode);
}

function createOpenRouterVideoDownload(apiKey: string) {
  const baseDownload = createDownload();

  return async (options: {
    url: URL;
    abortSignal?: AbortSignal;
  }): Promise<{ data: Uint8Array; mediaType: string | undefined }> => {
    if (!options.url.hostname.endsWith("openrouter.ai")) {
      return baseDownload(options);
    }

    const response = await fetch(options.url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Failed to download generated video (${response.status})${
          detail ? `: ${detail.slice(0, 200)}` : ""
        }`,
      );
    }

    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mediaType: response.headers.get("content-type") ?? undefined,
    };
  };
}

export type FilmGenerationStatus =
  | "submitting"
  | "generating"
  | "downloading"
  | "done";

export type FilmVideoReferenceKind =
  | "storyboard"
  | "character"
  | "environment"
  | "video";

export interface FilmVideoImageBytes {
  name?: string;
  kind?: FilmVideoReferenceKind;
  mimeType: string;
  bytes: Uint8Array;
}

interface OpenRouterFrameImage {
  type: "image_url";
  image_url: { url: string };
  frame_type: "first_frame" | "last_frame";
}

type OpenRouterInputReference =
  | {
      type: "image_url";
      image_url: { url: string };
    }
  | {
      type: "video_url";
      video_url: { url: string };
    }
  | {
      type: "audio_url";
      audio_url: { url: string };
    };

export function isVideoReferenceMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith("video/");
}

export function isAudioReferenceMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith("audio/");
}

export function resolveFilmReferenceMediaKind(
  reference: Pick<FilmVideoImageBytes, "mimeType" | "kind">,
): "image" | "video" | "audio" {
  if (reference.kind === "video" || isVideoReferenceMimeType(reference.mimeType)) {
    return "video";
  }
  if (isAudioReferenceMimeType(reference.mimeType)) {
    return "audio";
  }
  return "image";
}

function buildFrameImage(
  image: FilmVideoImageBytes,
  frameType: "first_frame" | "last_frame",
): OpenRouterFrameImage {
  return {
    type: "image_url",
    image_url: {
      url: imageBytesToDataUrl(image.bytes, image.mimeType),
    },
    frame_type: frameType,
  };
}

export function buildOpenRouterVideoInputReferences(
  references: FilmVideoImageBytes[],
): OpenRouterInputReference[] {
  return references.map((reference) => {
    const url = imageBytesToDataUrl(reference.bytes, reference.mimeType);
    const mediaKind = resolveFilmReferenceMediaKind(reference);
    if (mediaKind === "video") {
      return {
        type: "video_url" as const,
        video_url: { url },
      };
    }
    if (mediaKind === "audio") {
      return {
        type: "audio_url" as const,
        audio_url: { url },
      };
    }
    return {
      type: "image_url" as const,
      image_url: { url },
    };
  });
}

export interface GenerateFilmVideoInput {
  prompt: string;
  settings: AppSettings;
  videoModelId: string;
  inputReferences?: FilmVideoImageBytes[];
  firstFrame?: FilmVideoImageBytes;
  lastFrame?: FilmVideoImageBytes;
  aspectRatio?: VideoAspectRatioSetting;
  resolution?: VideoResolution;
  generateAudio?: boolean;
  duration?: number;
  signal?: AbortSignal;
  onStatus?: (status: FilmGenerationStatus) => void;
}

export interface GeneratedFilmVideo {
  mimeType: string;
  bytes: Uint8Array;
}

export async function generateFilmVideo(
  input: GenerateFilmVideoInput,
): Promise<GeneratedFilmVideo> {
  const inputReferences = input.inputReferences ?? [];
  const mentionNames = inputReferences
    .map((image) => image.name)
    .filter((name): name is string => Boolean(name));

  const apiPrompt = stripImageMentionsFromPrompt(
    input.prompt.trim(),
    mentionNames.map((name) => ({ name })),
  );
  if (!apiPrompt) {
    throw new Error("Enter a prompt describing the clip to generate.");
  }
  const finalApiPrompt = finalizeVideoGenerationPrompt(apiPrompt);

  if (!input.settings.openRouterApiKey.trim()) {
    throw new Error("Add your OpenRouter API key in settings first.");
  }

  input.onStatus?.("submitting");

  const model = createVideoGenerationModel(input.settings, input.videoModelId);

  const frameImages: OpenRouterFrameImage[] = [];
  if (input.firstFrame && input.firstFrame.bytes.byteLength > 0) {
    frameImages.push(buildFrameImage(input.firstFrame, "first_frame"));
  }
  if (input.lastFrame && input.lastFrame.bytes.byteLength > 0) {
    frameImages.push(buildFrameImage(input.lastFrame, "last_frame"));
  }

  const inputMode = resolveVideoInputMode({
    hasInputReferences: inputReferences.length > 0,
    hasFrameImages: frameImages.length > 0,
  });
  const durationSec = normalizeVideoDuration(
    input.duration,
    input.videoModelId,
    inputMode,
  );
  const resolution = input.resolution ?? DEFAULT_VIDEO_RESOLUTION;
  const aspectRatioSetting = input.aspectRatio ?? DEFAULT_VIDEO_ASPECT_RATIO_SETTING;

  const openrouterBody: Record<string, unknown> = {
    generate_audio: input.generateAudio ?? false,
    resolution,
  };

  if (frameImages.length > 0) {
    openrouterBody.frame_images = frameImages;
  }

  const hasVideoOrAudioReferences = inputReferences.some((reference) => {
    const mediaKind = resolveFilmReferenceMediaKind(reference);
    return mediaKind === "video" || mediaKind === "audio";
  });
  if (
    hasVideoOrAudioReferences &&
    !supportsOpenRouterVideoReferenceInput(input.videoModelId)
  ) {
    throw new Error(
      `Model "${input.videoModelId}" does not support video or audio input references. Switch to Seedance 2.0 (or Seedance 2.0 Fast), or remove video/audio attachments.`,
    );
  }

  if (inputReferences.length > 0) {
    openrouterBody.input_references =
      buildOpenRouterVideoInputReferences(inputReferences);
  }

  input.onStatus?.("generating");

  let result: Awaited<ReturnType<typeof experimental_generateVideo>>;
  try {
    result = await experimental_generateVideo({
      model,
      prompt: finalApiPrompt,
      aspectRatio: aspectRatioSetting,
      duration: durationSec,
      abortSignal: input.signal,
      providerOptions: {
        openrouter: openrouterBody,
      } as Parameters<typeof experimental_generateVideo>[0]["providerOptions"],
      download: createOpenRouterVideoDownload(input.settings.openRouterApiKey),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    const detail = formatProviderError(error, "OpenRouter video request failed");
    const genericBadRequest =
      /openrouter\.ai\/api\/v1\/videos/i.test(detail) && /400\b/i.test(detail);
    const guidance = genericBadRequest
      ? " Check model compatibility with selected aspect ratio/resolution and prompt/reference constraints."
      : "";
    const message = `Video generation failed for model "${input.videoModelId}" (${durationSec}s, ${aspectRatioSetting}, ${resolution}): ${detail}.${guidance}`;
    console.error(message, {
      modelId: input.videoModelId,
      durationSec,
      aspectRatio: aspectRatioSetting,
      resolution,
      generateAudio: input.generateAudio ?? false,
      referenceCount: inputReferences.length,
      error,
    });
    throw new Error(message);
  }

  input.onStatus?.("downloading");

  const video = result.video;
  if (!video) {
    throw new Error("Video model returned no video in response");
  }

  input.onStatus?.("done");

  return {
    mimeType: video.mediaType || "video/mp4",
    bytes: video.uint8Array,
  };
}
