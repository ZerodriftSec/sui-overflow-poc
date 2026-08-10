import type { ConversationScope } from "./chat-scope";
import { downloadAndDecryptBytes } from "./walrus/download-decrypt";
import {
  writeProjectBytesAtPath,
  type WalrusStorageContext,
} from "./storage/walrus-storage";
import { conversationScopeAttachmentPath } from "./storage/paths";

export interface PersistedChatImage {
  name: string;
  mimeType?: string;
  dataUrl?: string;
  imageBlobId?: string;
  imageBlobObjectId?: string;
}

export function imageBytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      if (mimeType.startsWith("video/")) {
        return "mp4";
      }
      return "png";
  }
}

function parseDataUrl(
  dataUrl: string,
): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    bytes: base64ToUint8Array(match[2]),
  };
}

function hasBlobReference(image: PersistedChatImage): boolean {
  return (image.imageBlobId?.trim().length ?? 0) > 0;
}

export async function prepareChatImageForPersistence(
  ctx: WalrusStorageContext,
  image: PersistedChatImage,
  input: {
    projectId: string;
    walrusPathPrefix: string;
    scope: ConversationScope;
    conversationId: string;
    messageId: string;
    imageIndex: number;
  },
): Promise<PersistedChatImage> {
  if (hasBlobReference(image)) {
    return {
      name: image.name,
      mimeType: image.mimeType,
      imageBlobId: image.imageBlobId,
      imageBlobObjectId: image.imageBlobObjectId,
    };
  }

  const dataUrl = image.dataUrl?.trim();
  if (!dataUrl) {
    return { name: image.name };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error(`Failed to parse attached image "${image.name}" for storage`);
  }

  const imageId = `chat-${input.messageId.slice(0, 8)}-${input.imageIndex}`;
  const extension = extensionForMimeType(parsed.mimeType);
  const blobRef = await writeProjectBytesAtPath(
    ctx,
    input.walrusPathPrefix,
    conversationScopeAttachmentPath(
      input.projectId,
      input.scope,
      input.conversationId,
      imageId,
      extension,
    ),
    parsed.bytes,
  );

  return {
    name: image.name,
    mimeType: parsed.mimeType,
    imageBlobId: blobRef.blobId,
    imageBlobObjectId: blobRef.blobObjectId,
  };
}

export async function loadStoredChatImageBytes(
  ctx: WalrusStorageContext,
  image: PersistedChatImage,
): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const inline = image.dataUrl?.trim();
  if (inline) {
    const parsed = parseDataUrl(inline);
    if (parsed) return parsed;
  }

  const blobId = image.imageBlobId?.trim();
  if (!blobId) {
    return null;
  }

  const bytes = await downloadAndDecryptBytes({
    blobId,
    sessionKey: ctx.sessionKey,
    sealClient: ctx.sealClient,
    suiClient: ctx.suiClient,
    projectId: ctx.vault.projectId,
    accessRegistryId: ctx.vault.accessRegistryId,
  });

  return {
    mimeType: image.mimeType ?? "image/png",
    bytes,
  };
}

export async function loadStoredChatImageDataUrl(
  ctx: WalrusStorageContext,
  image: PersistedChatImage,
): Promise<string | null> {
  const loaded = await loadStoredChatImageBytes(ctx, image);
  if (!loaded) {
    return null;
  }
  return imageBytesToDataUrl(loaded.bytes, loaded.mimeType);
}
