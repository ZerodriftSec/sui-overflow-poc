import { describe, expect, test } from "bun:test";
import {
  buildStoryboardGridLayoutPrompt,
  buildStoryboardToVideoInstructionBlock,
  computeStoryboardSheetAspectRatio,
  resolveStoryboardSheetGrid,
  STORYBOARD_SHEET_PANEL_ISOLATION_RULE,
} from "./storyboard-sheet-layout";

describe("buildStoryboardGridLayoutPrompt", () => {
  test("requires a uniform grid for multi-panel sheets", () => {
    const prompt = buildStoryboardGridLayoutPrompt(3, "16:9");

    expect(prompt).toContain("strict 2×2 grid");
    expect(prompt).toContain("identical rectangular cells");
    expect(prompt).toContain("Do not use variable panel sizes");
    expect(prompt).toContain("left-to-right, top-to-bottom");
  });

  test("includes panel isolation rules so subjects do not cross cells", () => {
    const prompt = buildStoryboardGridLayoutPrompt(4, "16:9");

    expect(prompt).toContain(STORYBOARD_SHEET_PANEL_ISOLATION_RULE);
    expect(prompt).toContain("Do NOT let characters");
    expect(prompt).toContain("Do NOT split a single wide shot");
  });

  test("leaves unused cells empty when the square grid has spare capacity", () => {
    const prompt = buildStoryboardGridLayoutPrompt(2, "16:9");
    const { cols, rows } = resolveStoryboardSheetGrid(2);

    expect(cols).toBe(2);
    expect(rows).toBe(2);
    expect(prompt).toContain("row 2 column 1");
    expect(prompt).toContain("row 2 column 2");
    expect(prompt).toContain("empty (plain white)");
  });
});

describe("buildStoryboardToVideoInstructionBlock", () => {
  test("requires close composition matching with override for broken panels", () => {
    const prompt = buildStoryboardToVideoInstructionBlock(4);

    expect(prompt).toContain("not the opening frame");
    expect(prompt).toContain("2×2 grid");
    expect(prompt).toContain("Match each panel's composition as closely as possible");
    expect(prompt).toContain("override that panel's composition");
    expect(prompt).toContain("garbled, incoherent, or contradicts");
  });
});

describe("resolveStoryboardSheetGrid", () => {
  test("uses square grids so sheet aspect matches panel aspect", () => {
    expect(resolveStoryboardSheetGrid(1)).toEqual({ cols: 1, rows: 1 });
    expect(resolveStoryboardSheetGrid(2)).toEqual({ cols: 2, rows: 2 });
    expect(resolveStoryboardSheetGrid(3)).toEqual({ cols: 2, rows: 2 });
    expect(resolveStoryboardSheetGrid(4)).toEqual({ cols: 2, rows: 2 });
    expect(resolveStoryboardSheetGrid(5)).toEqual({ cols: 3, rows: 3 });
    expect(resolveStoryboardSheetGrid(8)).toEqual({ cols: 3, rows: 3 });
  });
});

describe("computeStoryboardSheetAspectRatio", () => {
  test("keeps 16:9 sheet ratio across different panel counts", () => {
    for (let panelCount = 1; panelCount <= 8; panelCount += 1) {
      expect(computeStoryboardSheetAspectRatio("16:9", panelCount)).toBe("16:9");
    }
  });
});
