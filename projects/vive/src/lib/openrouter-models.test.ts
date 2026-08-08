import { describe, expect, test } from "bun:test";
import {
  computeStoryboardSheetAspectRatio,
  resolveStoryboardSheetGrid,
} from "./storyboard-sheet-layout";
import {
  OPENROUTER_IMAGE_ASPECT_RATIOS,
  XAI_IMAGE_ASPECT_RATIOS,
  buildOpenRouterImagesParams,
  resolveOpenRouterImageAspectRatio,
  supportsOpenRouterReferenceImageInput,
  supportsOpenRouterVideoReferenceInput,
} from "./openrouter-models";

const XAI_IMAGE_MODEL = "x-ai/grok-imagine-image-quality";

describe("resolveOpenRouterImageAspectRatio", () => {
  test("passes through supported ratios unchanged", () => {
    for (const ratio of OPENROUTER_IMAGE_ASPECT_RATIOS) {
      expect(resolveOpenRouterImageAspectRatio(ratio)).toBe(ratio);
    }
  });

  test("maps storyboard contact-sheet ratios to supported values", () => {
    expect(resolveOpenRouterImageAspectRatio("16:9")).toBe("16:9");
    expect(resolveOpenRouterImageAspectRatio("32:9")).toBe("21:9");
    expect(resolveOpenRouterImageAspectRatio("48:9")).toBe("21:9");
    expect(resolveOpenRouterImageAspectRatio("8:3")).toBe("21:9");
  });

  test("uses auto for xAI when the ratio is not an exact match", () => {
    expect(resolveOpenRouterImageAspectRatio("16:9", XAI_IMAGE_MODEL)).toBe(
      "16:9",
    );
    expect(resolveOpenRouterImageAspectRatio("21:9", XAI_IMAGE_MODEL)).toBe(
      "auto",
    );
    expect(resolveOpenRouterImageAspectRatio("48:9", XAI_IMAGE_MODEL)).toBe(
      "auto",
    );
    expect(resolveOpenRouterImageAspectRatio("4:5", XAI_IMAGE_MODEL)).toBe(
      "auto",
    );
  });

  test("maps computed panel grids to supported OpenRouter ratios", () => {
    for (let panelCount = 1; panelCount <= 8; panelCount += 1) {
      const computed = computeStoryboardSheetAspectRatio("16:9", panelCount);
      const resolved = resolveOpenRouterImageAspectRatio(computed);
      expect(OPENROUTER_IMAGE_ASPECT_RATIOS).toContain(resolved);
      const xaiResolved = resolveOpenRouterImageAspectRatio(
        computed,
        XAI_IMAGE_MODEL,
      );
      expect(
        xaiResolved === "auto" ||
          XAI_IMAGE_ASPECT_RATIOS.includes(
            xaiResolved as (typeof XAI_IMAGE_ASPECT_RATIOS)[number],
          ),
      ).toBe(true);
      resolveStoryboardSheetGrid(panelCount);
    }
  });
});

describe("buildOpenRouterImagesParams", () => {
  test("uses auto for unsupported xAI ratios and clamps 4K size", () => {
    expect(
      buildOpenRouterImagesParams(XAI_IMAGE_MODEL, {
        aspectRatio: "48:9",
        imageSize: "4K",
      }),
    ).toEqual({
      aspect_ratio: "auto",
      resolution: "2K",
    });
  });

  test("omits aspect_ratio and resolution for GPT Image models", () => {
    expect(
      buildOpenRouterImagesParams("openai/gpt-image-2", {
        aspectRatio: "16:9",
        imageSize: "2K",
      }),
    ).toEqual({});
  });

  test("omits resolution for Gemini 2.5 Flash Image", () => {
    expect(
      buildOpenRouterImagesParams("google/gemini-2.5-flash-image", {
        aspectRatio: "16:9",
        imageSize: "2K",
      }),
    ).toEqual({
      aspect_ratio: "16:9",
    });
  });
});

describe("supportsOpenRouterReferenceImageInput", () => {
  test("allows reference images for OpenRouter image models", () => {
    expect(
      supportsOpenRouterReferenceImageInput(
        "google/gemini-2.5-flash-image",
      ),
    ).toBe(true);
    expect(
      supportsOpenRouterReferenceImageInput("openai/gpt-image-2"),
    ).toBe(true);
    expect(
      supportsOpenRouterReferenceImageInput("bytedance-seed/seedream-4.5"),
    ).toBe(true);
  });
});

describe("supportsOpenRouterVideoReferenceInput", () => {
  test("allows video references for Seedance 2.0 models only", () => {
    expect(
      supportsOpenRouterVideoReferenceInput("bytedance/seedance-2.0"),
    ).toBe(true);
    expect(
      supportsOpenRouterVideoReferenceInput("bytedance/seedance-2.0-fast"),
    ).toBe(true);
    expect(
      supportsOpenRouterVideoReferenceInput("google/veo-3.1"),
    ).toBe(false);
    expect(
      supportsOpenRouterVideoReferenceInput("kwaivgi/kling-v3.0-pro"),
    ).toBe(false);
  });
});
