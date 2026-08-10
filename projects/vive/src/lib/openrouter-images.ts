import {
  formatOpenRouterHttpError,
  logOpenRouterHttpError,
} from "./openrouter-http-error";
import {
  buildOpenRouterImagesParams,
  type ImageGenerationSize,
} from "./openrouter-models";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

export type OpenRouterInputReference = {
  type: "image_url";
  image_url: { url: string };
};

interface OpenRouterImagesResponse {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
  }>;
  error?: { message?: string };
}

export async function generateOpenRouterImage(input: {
  apiKey: string;
  modelId: string;
  prompt: string;
  aspectRatio: string;
  imageSize?: ImageGenerationSize;
  inputReferences?: OpenRouterInputReference[];
  signal?: AbortSignal;
  operation?: string;
}): Promise<{ mimeType: string; dataBase64: string }> {
  const operation = input.operation ?? "image generation";
  const params = buildOpenRouterImagesParams(input.modelId, {
    aspectRatio: input.aspectRatio,
    imageSize: input.imageSize,
  });

  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
    ...params,
  };

  if (input.inputReferences && input.inputReferences.length > 0) {
    body.input_references = input.inputReferences;
  }

  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    logOpenRouterHttpError({
      operation,
      status: response.status,
      modelId: input.modelId,
      bodyText,
    });
    throw new Error(
      formatOpenRouterHttpError(response.status, bodyText, "Image generation:"),
    );
  }

  const parsed = JSON.parse(bodyText) as OpenRouterImagesResponse;
  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  const firstImage = parsed.data?.[0];
  const dataBase64 = firstImage?.b64_json;
  if (!dataBase64) {
    throw new Error("Image model returned no image in response");
  }

  return {
    mimeType: firstImage.media_type ?? "image/png",
    dataBase64,
  };
}
