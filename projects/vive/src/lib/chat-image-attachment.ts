import { imageBytesToDataUrl } from "./chat-image-storage";
import {
  extractVideoFrame,
  type VideoFramePosition,
} from "./extract-video-frame";

export const MAX_CHAT_IMAGE_ATTACHMENTS = 4;

const ACCEPTED_IMAGE_PREFIX = "image/";
const ACCEPTED_VIDEO_PREFIX = "video/";
const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

export type ChatMediaKind = "image" | "video";
export type { VideoFramePosition };

export interface ChatVideoFrameSource {
  dataUrl: string;
  mimeType: string;
  name: string;
  position: VideoFramePosition;
}

export interface ChatImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  dataUrl: string;
  /** Defaults to image when omitted for backward compatibility. */
  mediaKind?: ChatMediaKind;
  /**
   * When set, this still was extracted from a video clip and the source
   * can be re-sampled as the first or last frame.
   */
  videoFrameSource?: ChatVideoFrameSource;
}

export interface StoredChatImage {
  name: string;
  dataUrl: string;
  mimeType?: string;
}

export function isAcceptedImageFile(file: File): boolean {
  return file.type.startsWith(ACCEPTED_IMAGE_PREFIX);
}

export function isAcceptedVideoFile(file: File): boolean {
  if (file.type.startsWith(ACCEPTED_VIDEO_PREFIX)) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_VIDEO_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
}

export function isVideoChatAttachment(
  attachment: Pick<ChatImageAttachment, "mimeType" | "mediaKind" | "dataUrl">,
): boolean {
  if (attachment.mediaKind === "video") {
    return true;
  }
  if (attachment.mimeType.startsWith(ACCEPTED_VIDEO_PREFIX)) {
    return true;
  }
  return attachment.dataUrl.trim().toLowerCase().startsWith("data:video/");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read media file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read media file"));
    reader.readAsDataURL(file);
  });
}

function mimeTypeForVideoFile(file: File): string {
  if (file.type.startsWith(ACCEPTED_VIDEO_PREFIX)) {
    return file.type;
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".webm")) return "video/webm";
  if (lowerName.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

export async function fileToChatImageAttachment(
  file: File,
): Promise<ChatImageAttachment> {
  if (!isAcceptedImageFile(file)) {
    throw new Error("Only image files can be attached");
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: crypto.randomUUID(),
    name: file.name || "image",
    mimeType: file.type,
    previewUrl: dataUrl,
    dataUrl,
    mediaKind: "image",
  };
}

export async function fileToChatVideoAttachment(
  file: File,
): Promise<ChatImageAttachment> {
  if (!isAcceptedVideoFile(file)) {
    throw new Error("Only video files can be attached");
  }

  const mimeType = mimeTypeForVideoFile(file);
  const dataUrl = await readFileAsDataUrl(file);
  const previewUrl = URL.createObjectURL(file);
  return {
    id: crypto.randomUUID(),
    name: file.name || "video",
    mimeType,
    previewUrl,
    dataUrl,
    mediaKind: "video",
  };
}

export async function filesToChatImageAttachments(
  files: File[],
): Promise<ChatImageAttachment[]> {
  const imageFiles = files.filter(isAcceptedImageFile);
  return Promise.all(imageFiles.map((file) => fileToChatImageAttachment(file)));
}

export async function filesToChatMediaAttachments(
  files: File[],
  options?: { allowVideo?: boolean },
): Promise<ChatImageAttachment[]> {
  const allowVideo = options?.allowVideo ?? false;
  const attachments: ChatImageAttachment[] = [];
  for (const file of files) {
    if (isAcceptedImageFile(file)) {
      attachments.push(await fileToChatImageAttachment(file));
      continue;
    }
    if (allowVideo && isAcceptedVideoFile(file)) {
      attachments.push(await fileToChatVideoAttachment(file));
    }
  }
  return attachments;
}

export function revokeChatImageAttachment(attachment: ChatImageAttachment): void {
  if (attachment.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

export function revokeChatImageAttachments(
  attachments: ChatImageAttachment[],
): void {
  for (const attachment of attachments) {
    revokeChatImageAttachment(attachment);
  }
}

export function dataUrlToChatImageAttachment(
  name: string,
  dataUrl: string,
): ChatImageAttachment {
  const mimeMatch = dataUrl.match(/^data:([^;]+);/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const mediaKind: ChatMediaKind = mimeType.startsWith(ACCEPTED_VIDEO_PREFIX)
    ? "video"
    : "image";
  return {
    id: crypto.randomUUID(),
    name,
    mimeType,
    previewUrl: dataUrl,
    dataUrl,
    mediaKind,
  };
}

function parseDataUrlBytes(
  dataUrl: string,
): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mimeType: match[1], bytes };
}

function frameFileName(videoName: string, position: VideoFramePosition): string {
  const base = videoName.replace(/\.[^.]+$/, "") || "frame";
  return `${base}-${position}-frame.jpg`;
}

async function attachmentFromExtractedFrame(input: {
  id?: string;
  frameBytes: Uint8Array;
  frameMimeType: string;
  source: ChatVideoFrameSource;
}): Promise<ChatImageAttachment> {
  const dataUrl = imageBytesToDataUrl(input.frameBytes, input.frameMimeType);
  return {
    id: input.id ?? crypto.randomUUID(),
    name: frameFileName(input.source.name, input.source.position),
    mimeType: input.frameMimeType,
    previewUrl: dataUrl,
    dataUrl,
    mediaKind: "image",
    videoFrameSource: input.source,
  };
}

/**
 * Extract a still from a video file for use as a start/end keyframe.
 */
export async function videoFileToFrameAttachment(
  file: File,
  position: VideoFramePosition = "first",
): Promise<ChatImageAttachment> {
  if (!isAcceptedVideoFile(file)) {
    throw new Error("Only video files can be used as frame sources");
  }

  const videoDataUrl = await readFileAsDataUrl(file);
  return videoDataUrlToFrameAttachment(
    file.name || "video",
    videoDataUrl,
    position,
  );
}

/**
 * Extract a still from a video data URL for use as a start/end keyframe.
 */
export async function videoDataUrlToFrameAttachment(
  name: string,
  dataUrl: string,
  position: VideoFramePosition = "first",
): Promise<ChatImageAttachment> {
  const parsed = parseDataUrlBytes(dataUrl);
  if (!parsed) {
    throw new Error("Failed to read video for frame extraction");
  }

  const mimeType = parsed.mimeType.startsWith("video/")
    ? parsed.mimeType
    : "video/mp4";
  const extracted = await extractVideoFrame({
    bytes: parsed.bytes,
    mimeType,
    position,
  });

  return attachmentFromExtractedFrame({
    frameBytes: extracted.bytes,
    frameMimeType: extracted.mimeType,
    source: {
      dataUrl,
      mimeType,
      name: name || "video",
      position,
    },
  });
}

/**
 * Re-extract the first or last frame from a video-sourced keyframe attachment.
 */
export async function retargetVideoFrameAttachment(
  attachment: ChatImageAttachment,
  position: VideoFramePosition,
): Promise<ChatImageAttachment> {
  const source = attachment.videoFrameSource;
  if (!source) {
    throw new Error("Frame attachment has no video source to retarget");
  }
  if (source.position === position) {
    return attachment;
  }

  const parsed = parseDataUrlBytes(source.dataUrl);
  if (!parsed) {
    throw new Error("Failed to read video source for frame retargeting");
  }

  const extracted = await extractVideoFrame({
    bytes: parsed.bytes,
    mimeType: source.mimeType || parsed.mimeType,
    position,
  });

  return attachmentFromExtractedFrame({
    id: attachment.id,
    frameBytes: extracted.bytes,
    frameMimeType: extracted.mimeType,
    source: {
      ...source,
      position,
    },
  });
}

export function userMessagePreviewText(
  text: string,
  imageCount: number,
  options?: { videoCount?: number },
): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  const videoCount = options?.videoCount ?? 0;
  if (videoCount > 0 && imageCount === 0) {
    return videoCount === 1 ? "Sent a video" : `Sent ${videoCount} videos`;
  }
  if (videoCount > 0 && imageCount > 0) {
    return `Sent ${imageCount + videoCount} references`;
  }
  if (imageCount === 1) return "Sent an image";
  if (imageCount > 1) return `Sent ${imageCount} images`;
  return "";
}
