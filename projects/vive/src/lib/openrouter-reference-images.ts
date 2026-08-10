/** MIME types accepted for OpenRouter multimodal image inputs. */
export const OPENROUTER_INPUT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type OpenRouterInputImageMimeType =
  (typeof OPENROUTER_INPUT_IMAGE_MIME_TYPES)[number];

const DEFAULT_MAX_REFERENCE_EDGE_PX = 768;
const DEFAULT_JPEG_QUALITY = 0.82;

export function isOpenRouterInputImageMimeType(
  mimeType: string,
): mimeType is OpenRouterInputImageMimeType {
  return OPENROUTER_INPUT_IMAGE_MIME_TYPES.includes(
    mimeType as OpenRouterInputImageMimeType,
  );
}

export interface OpenRouterReferenceImagePayload {
  mimeType: OpenRouterInputImageMimeType;
  dataBase64: string;
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode reference image"));
    image.src = dataUrl;
  });
}

/**
 * Downscale raster reference images so multi-image storyboard requests stay
 * within OpenRouter payload limits. See:
 * https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
 */
export async function compressReferenceImageForOpenRouter(input: {
  mimeType: string;
  dataBase64: string;
  maxEdgePx?: number;
  quality?: number;
}): Promise<OpenRouterReferenceImagePayload | null> {
  if (!isOpenRouterInputImageMimeType(input.mimeType)) {
    return null;
  }

  const maxEdgePx = input.maxEdgePx ?? DEFAULT_MAX_REFERENCE_EDGE_PX;
  const quality = input.quality ?? DEFAULT_JPEG_QUALITY;
  const sourceDataUrl = `data:${input.mimeType};base64,${input.dataBase64}`;

  if (typeof document === "undefined") {
    return {
      mimeType: input.mimeType,
      dataBase64: input.dataBase64,
    };
  }

  try {
    const image = await loadImageElement(sourceDataUrl);
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale =
      longestEdge > maxEdgePx ? maxEdgePx / Math.max(longestEdge, 1) : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return {
        mimeType: input.mimeType,
        dataBase64: input.dataBase64,
      };
    }

    context.drawImage(image, 0, 0, width, height);
    const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    const match = /^data:image\/jpeg;base64,(.+)$/i.exec(compressedDataUrl);
    if (!match) {
      return null;
    }

    return {
      mimeType: "image/jpeg",
      dataBase64: match[1],
    };
  } catch {
    return {
      mimeType: input.mimeType,
      dataBase64: input.dataBase64,
    };
  }
}

export function openRouterReferenceImageDataUrl(
  image: OpenRouterReferenceImagePayload,
): string {
  return `data:${image.mimeType};base64,${image.dataBase64}`;
}
