import { describe, expect, test } from "bun:test";
import {
  finalizeStoryboardToVideoPrompt,
  mergeFilmGenerationRequest,
  mergeStoryboardContextPrompt,
} from "./film-generation-context";

describe("mergeStoryboardContextPrompt", () => {
  test("returns context prompt when user prompt is empty", () => {
    expect(mergeStoryboardContextPrompt("TIMELINE:\nPanel 1", "")).toBe(
      "TIMELINE:\nPanel 1",
    );
  });

  test("appends user prompt instead of replacing context", () => {
    const merged = mergeStoryboardContextPrompt(
      "TIMELINE:\nPanel 1",
      "Make the lighting warmer.",
    );
    expect(merged).toContain("TIMELINE:\nPanel 1");
    expect(merged).toContain("Additional direction from the user:");
    expect(merged).toContain("Make the lighting warmer.");
  });
});

describe("mergeFilmGenerationRequest", () => {
  test("keeps storyboard shot timeline when user adds their own prompt", () => {
    const merged = mergeFilmGenerationRequest({
      requestPrompt: "Emphasize the rain on the window.",
      requestReferences: [],
      context: {
        storyboardId: "sb-1",
        segmentIndex: 0,
        prompt: "TIMELINE:\n00:00-00:04 [Panel 1]: MS - Hero enters.",
        durationSec: 10,
        inputReferences: [],
        attachments: [],
        sourceStoryboardId: "sb-1",
        sourceShotId: "shot-1",
      },
    });

    expect(merged.prompt).toContain("TIMELINE:");
    expect(merged.prompt).toContain("Hero enters.");
    expect(merged.prompt).toContain("Emphasize the rain on the window.");
  });

  test("storyboard-to-video uses only storyboard references in the API payload", () => {
    const merged = mergeFilmGenerationRequest({
      requestPrompt: "Make the rain heavier.",
      requestReferences: [],
      generationSkillId: "storyboard-to-video",
      context: {
        storyboardId: "sb-1",
        segmentIndex: 0,
        prompt: "TIMELINE:\nPanel 1",
        durationSec: 15,
        inputReferences: [
          {
            name: "Segment 1 storyboard sheet",
            kind: "storyboard",
            mimeType: "image/png",
            bytes: new Uint8Array([1]),
          },
          {
            name: "Environment",
            kind: "environment",
            mimeType: "image/png",
            bytes: new Uint8Array([2]),
          },
        ],
        attachments: [],
        sourceStoryboardId: "sb-1",
        sourceShotId: "shot-1",
        storyboardPanelCount: 8,
      },
    });

    expect(merged.inputReferences).toHaveLength(1);
    expect(merged.inputReferences[0]?.kind).toBe("storyboard");
    expect(merged.prompt).not.toContain("Image 1 (the first attached image)");
    expect(merged.prompt).not.toContain("Image 2 (the second attached image)");
  });
});

describe("finalizeStoryboardToVideoPrompt", () => {
  test("labels each attached image by type without verbose repetition", () => {
    const prompt = finalizeStoryboardToVideoPrompt({
      basePrompt:
        "TIMELINE:\nPanel 1\n\nAdditional direction from the user:\nGenerate a video clip from the storyboard.",
      inputReferences: [
        {
          name: "Segment 1 storyboard sheet",
          kind: "storyboard",
          mimeType: "image/png",
          bytes: new Uint8Array([1]),
        },
      ],
      panelCount: 8,
    });

    expect(prompt).toContain("TIMELINE:");
    expect(prompt).toContain("Attached images in order:");
    expect(prompt).toContain(
      'Image 1: Storyboard contact sheet "Segment 1 storyboard sheet"',
    );
    expect(prompt).toContain("not the opening frame");
    expect(prompt).toContain("left-to-right, top-to-bottom");
    expect(prompt).toContain("Match each panel's composition as closely as possible");
    expect(prompt).toContain("override that panel's composition");
    expect(prompt).toContain(
      "primary visual target for shot order and panel composition",
    );
    expect(prompt).not.toContain("Attached reference images are provided");
    expect(prompt).not.toContain("Follow the attached storyboard contact sheet");
    expect(prompt.match(/not the opening frame/g)?.length).toBe(1);
    expect(prompt.match(/left-to-right, top-to-bottom/g)?.length).toBe(1);
  });

  test("labels storyboard, character, environment, and video attachments", () => {
    const prompt = finalizeStoryboardToVideoPrompt({
      basePrompt: "TIMELINE:\nPanel 1",
      inputReferences: [
        {
          name: "Segment 1 storyboard sheet",
          kind: "storyboard",
          mimeType: "image/png",
          bytes: new Uint8Array([1]),
        },
        {
          name: "Courtyard",
          kind: "environment",
          mimeType: "image/png",
          bytes: new Uint8Array([2]),
        },
        {
          name: "Peasant hero",
          kind: "character",
          mimeType: "image/png",
          bytes: new Uint8Array([3]),
        },
        {
          name: "Prior clip",
          kind: "video",
          mimeType: "video/mp4",
          bytes: new Uint8Array([4]),
        },
      ],
      panelCount: 4,
    });

    expect(prompt).toContain('Image 1: Storyboard contact sheet');
    expect(prompt).toContain('Image 2: Environment reference "Courtyard"');
    expect(prompt).toContain('Image 3: Character sheet "Peasant hero"');
    expect(prompt).toContain('Video 4: Video reference "Prior clip"');
  });
});
