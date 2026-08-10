import type { StoryboardDocument } from "./project";
import type { WalrusStorageContext } from "./storage/walrus-storage";
import { downloadAndDecryptBytes } from "./walrus/download-decrypt";
import {
  dataUrlToBlob,
  downloadBlob,
  downloadFromObjectUrl,
  downloadText,
  extensionFromMimeType,
  sanitizeDownloadFilename,
  sleep,
} from "./download-file";
import type { DesignGeneratedImage, FilmGeneratedVideo } from "./workspace";

function base64ToUint8Array(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function resolveImageBytes(
  ctx: WalrusStorageContext,
  image: DesignGeneratedImage,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const dataBase64 = image.dataBase64?.trim();
  if (dataBase64) {
    return {
      bytes: base64ToUint8Array(dataBase64),
      mimeType: image.mimeType,
    };
  }

  const imageBlobId = image.imageBlobId?.trim();
  if (imageBlobId) {
    const bytes = await downloadAndDecryptBytes({
      blobId: imageBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      vaultId: ctx.vault.vaultId,
      capId: ctx.vault.capId,
    });
    return { bytes, mimeType: image.mimeType };
  }

  throw new Error("Image is not available to download yet");
}

async function resolveVideoBytes(
  ctx: WalrusStorageContext,
  video: FilmGeneratedVideo,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const dataBase64 = video.dataBase64?.trim();
  if (dataBase64) {
    return {
      bytes: base64ToUint8Array(dataBase64),
      mimeType: video.mimeType,
    };
  }

  const videoBlobId = video.videoBlobId?.trim();
  if (videoBlobId) {
    const bytes = await downloadAndDecryptBytes({
      blobId: videoBlobId,
      sessionKey: ctx.sessionKey,
      sealClient: ctx.sealClient,
      suiClient: ctx.suiClient,
      vaultId: ctx.vault.vaultId,
      capId: ctx.vault.capId,
    });
    return { bytes, mimeType: video.mimeType };
  }

  throw new Error("Video is not available to download yet");
}

export function downloadScriptContent(title: string, content: string): void {
  const filename = `${sanitizeDownloadFilename(title, "script")}.txt`;
  downloadText(content, filename);
}

export function downloadDesignTextAsset(input: {
  title: string;
  prompt: string;
  description?: string;
}): void {
  const filename = `${sanitizeDownloadFilename(input.title, "design")}.txt`;
  const sections = [
    input.description?.trim()
      ? `Description\n${input.description.trim()}`
      : null,
    `Prompt\n${input.prompt.trim()}`,
  ].filter((section): section is string => Boolean(section));
  downloadText(sections.join("\n\n"), filename);
}

export async function downloadDesignImageAsset(input: {
  title: string;
  image: DesignGeneratedImage;
  imageDataUrl?: string | null;
  ctx?: WalrusStorageContext;
}): Promise<void> {
  const extension = extensionFromMimeType(input.image.mimeType, "png");
  const filename = `${sanitizeDownloadFilename(input.title, "design")}.${extension}`;

  if (input.imageDataUrl?.startsWith("data:")) {
    downloadBlob(dataUrlToBlob(input.imageDataUrl), filename);
    return;
  }

  if (!input.ctx) {
    throw new Error("Image is not available to download yet");
  }

  const { bytes, mimeType } = await resolveImageBytes(input.ctx, input.image);
  downloadBlob(
    new Blob([Uint8Array.from(bytes)], { type: mimeType }),
    filename,
  );
}

export async function downloadStoryboardAsset(input: {
  title: string;
  document: StoryboardDocument;
  sheetImageDataUrls?: Record<string, string>;
  ctx?: WalrusStorageContext;
}): Promise<void> {
  const baseName = sanitizeDownloadFilename(input.title, "storyboard");
  const exportDocument = {
    title: input.title,
    updatedAt: input.document.updatedAt,
    cards: input.document.cards,
    sheets: input.document.sheets?.map((sheet) => ({
      segmentId: sheet.segmentId,
      segmentIndex: sheet.segmentIndex,
      segmentTitle: sheet.segmentTitle,
      durationSec: sheet.durationSec,
      shotIds: sheet.shotIds,
      panelCount: sheet.panelCount,
      shotId: sheet.shotId,
      prompt: sheet.prompt,
      panelAspectRatio: sheet.panelAspectRatio,
      imageMimeType: sheet.image.mimeType,
    })),
  };

  downloadText(
    JSON.stringify(exportDocument, null, 2),
    `${baseName}.storyboard.json`,
    "application/json;charset=utf-8",
  );

  const sheets = input.document.sheets ?? [];
  if (sheets.length === 0) {
    return;
  }

  for (const [index, sheet] of sheets.entries()) {
    if (index > 0) {
      await sleep(250);
    }

    const extension = extensionFromMimeType(sheet.image.mimeType, "png");
    const sheetFilename = `${baseName}-sheet-${sheet.segmentIndex + 1}.${extension}`;
    const dataUrl = input.sheetImageDataUrls?.[sheet.segmentId];

    if (dataUrl?.startsWith("data:")) {
      downloadBlob(dataUrlToBlob(dataUrl), sheetFilename);
      continue;
    }

    if (!input.ctx) {
      continue;
    }

    try {
      const { bytes, mimeType } = await resolveImageBytes(input.ctx, sheet.image);
      downloadBlob(
        new Blob([Uint8Array.from(bytes)], { type: mimeType }),
        sheetFilename,
      );
    } catch {
      // Skip sheets that cannot be resolved.
    }
  }
}

export async function downloadFilmVideoAsset(input: {
  title: string;
  video?: FilmGeneratedVideo;
  videoObjectUrl?: string | null;
  ctx?: WalrusStorageContext;
}): Promise<void> {
  const mimeType = input.video?.mimeType ?? "video/mp4";
  const extension = extensionFromMimeType(mimeType, "mp4");
  const filename = `${sanitizeDownloadFilename(input.title, "clip")}.${extension}`;

  if (input.videoObjectUrl) {
    await downloadFromObjectUrl(input.videoObjectUrl, filename);
    return;
  }

  if (!input.video) {
    throw new Error("Video is not available to download yet");
  }

  if (!input.ctx && !input.video.dataBase64?.trim()) {
    throw new Error("Video is not available to download yet");
  }

  const { bytes, mimeType: resolvedMimeType } = input.ctx
    ? await resolveVideoBytes(input.ctx, input.video)
    : {
        bytes: base64ToUint8Array(input.video.dataBase64!),
        mimeType: input.video.mimeType,
      };

  downloadBlob(
    new Blob([Uint8Array.from(bytes)], { type: resolvedMimeType }),
    filename,
  );
}
