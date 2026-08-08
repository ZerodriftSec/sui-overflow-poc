import { describe, expect, test } from "bun:test";
import {
  buildOpenRouterVideoInputReferences,
  finalizeVideoGenerationPrompt,
  resolveFilmReferenceMediaKind,
} from "./film-llm";

describe("finalizeVideoGenerationPrompt", () => {
  test("appends physics and person-duplication guardrails", () => {
    const prompt = finalizeVideoGenerationPrompt(
      "A striker sprints toward the ball.",
    );

    expect(prompt).toContain("A striker sprints toward the ball.");
    expect(prompt).toContain("respect gravity, momentum, balance, collisions");
    expect(prompt).toContain(
      "Do not duplicate, clone, mirror, or multiply any person",
    );
    expect(prompt).toContain("Each intended person must appear exactly once");
  });

  test("does not append the integrity block more than once", () => {
    const once = finalizeVideoGenerationPrompt("A striker approaches the ball.");
    const twice = finalizeVideoGenerationPrompt(once);

    expect(twice).toBe(once);
    expect(twice.match(/SCENE INTEGRITY \(CRITICAL\):/g)).toHaveLength(1);
  });

  test("keeps an empty prompt empty", () => {
    expect(finalizeVideoGenerationPrompt("   ")).toBe("");
  });
});

describe("buildOpenRouterVideoInputReferences", () => {
  test("maps image, video, and audio mime types to the correct OpenRouter shape", () => {
    const references = buildOpenRouterVideoInputReferences([
      {
        name: "hero sheet",
        kind: "character",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        name: "motion ref",
        kind: "video",
        mimeType: "video/mp4",
        bytes: new Uint8Array([4, 5, 6]),
      },
      {
        name: "sfx bed",
        mimeType: "audio/mpeg",
        bytes: new Uint8Array([7, 8, 9]),
      },
    ]);

    expect(references).toHaveLength(3);
    expect(references[0]).toEqual({
      type: "image_url",
      image_url: {
        url: "data:image/png;base64,AQID",
      },
    });
    expect(references[1]).toEqual({
      type: "video_url",
      video_url: {
        url: "data:video/mp4;base64,BAUG",
      },
    });
    expect(references[2]).toEqual({
      type: "audio_url",
      audio_url: {
        url: "data:audio/mpeg;base64,BwgJ",
      },
    });
  });

  test("resolves media kind from mime type when kind is omitted", () => {
    expect(
      resolveFilmReferenceMediaKind({
        mimeType: "video/webm",
      }),
    ).toBe("video");
    expect(
      resolveFilmReferenceMediaKind({
        mimeType: "image/jpeg",
      }),
    ).toBe("image");
  });
});
