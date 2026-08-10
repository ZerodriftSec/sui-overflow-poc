import { describe, expect, test } from "bun:test";
import {
  isOpenRouterInputImageMimeType,
  openRouterReferenceImageDataUrl,
} from "./openrouter-reference-images";

describe("openrouter-reference-images", () => {
  test("accepts OpenRouter-supported input MIME types", () => {
    expect(isOpenRouterInputImageMimeType("image/png")).toBe(true);
    expect(isOpenRouterInputImageMimeType("image/jpeg")).toBe(true);
    expect(isOpenRouterInputImageMimeType("image/webp")).toBe(true);
    expect(isOpenRouterInputImageMimeType("image/gif")).toBe(true);
    expect(isOpenRouterInputImageMimeType("image/svg+xml")).toBe(false);
  });

  test("builds data URLs for image_url content parts", () => {
    expect(
      openRouterReferenceImageDataUrl({
        mimeType: "image/jpeg",
        dataBase64: "abc123",
      }),
    ).toBe("data:image/jpeg;base64,abc123");
  });
});
