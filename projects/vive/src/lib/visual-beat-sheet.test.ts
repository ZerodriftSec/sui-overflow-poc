import { describe, expect, test } from "bun:test";
import {
  applyStyleBriefToBeatSheet,
  buildBriefAdaptationGuidance,
  buildBeatSheetSystemPrompt,
  buildBriefDurationGuidance,
  extractStyleBriefFromBeatSheet,
  resolveBriefAdaptationMode,
  validateBeatSheetForTarget,
} from "./visual-beat-sheet";

describe("applyStyleBriefToBeatSheet", () => {
  test("replaces an existing STYLE line with the user brief", () => {
    const sheet = [
      "STYLE: Neon cyberpunk alley at night.",
      "",
      "Beat 1 (WS, 4s): A courier skids into frame.",
      "TONE: Urgent.",
    ].join("\n");

    const result = applyStyleBriefToBeatSheet(
      sheet,
      "Hand-drawn watercolor, soft daylight, pastoral mood",
    );

    expect(extractStyleBriefFromBeatSheet(result)).toBe(
      "Hand-drawn watercolor, soft daylight, pastoral mood",
    );
    expect(result).toContain("Beat 1 (WS, 4s): A courier skids into frame.");
  });

  test("inserts a STYLE line when missing", () => {
    const sheet = [
      "Beat 1 (WS, 4s): A courier skids into frame.",
      "TONE: Urgent.",
    ].join("\n");

    const result = applyStyleBriefToBeatSheet(sheet, "Claymation, warm studio light");

    expect(result.startsWith("STYLE: Claymation, warm studio light")).toBe(true);
  });

  test("leaves content unchanged when style brief is empty", () => {
    const sheet = "STYLE: Keep me.\n\nBeat 1 (WS, 4s): Action.";
    expect(applyStyleBriefToBeatSheet(sheet, "   ")).toBe(sheet);
  });
});

describe("buildBeatSheetSystemPrompt", () => {
  test("includes required art direction when a style brief is provided", () => {
    const prompt = buildBeatSheetSystemPrompt(
      15,
      "Ink wash illustration, misty mountains",
    );
    expect(prompt).toContain("Required art direction (mandatory):");
    expect(prompt).toContain("Ink wash illustration, misty mountains");
    expect(prompt).toContain("Do not invent a conflicting style.");
  });

  test("discourages fixed beat counts", () => {
    const prompt = buildBeatSheetSystemPrompt(15);
    expect(prompt).toContain("Never default to 8 beats");
    expect(prompt).toContain("determined by story content");
  });
});

describe("buildBriefDurationGuidance", () => {
  test("advises expansion for short briefs with long runtimes", () => {
    const guidance = buildBriefDurationGuidance("A cat chases a mouse", 45);
    expect(guidance).toContain("brief is short");
    expect(guidance).toContain("45s");
  });

  test("advises compression for detailed briefs with short runtimes", () => {
    const longBrief = Array.from({ length: 90 }, (_, index) => `event-${index}`).join(
      " ",
    );
    const guidance = buildBriefDurationGuidance(longBrief, 15);
    expect(guidance).toContain("detailed");
    expect(guidance).toContain("15s");
  });
});

describe("brief adaptation guidance", () => {
  test("uses preserve mode for detailed structured source material", () => {
    const detailedBrief = [
      "Make a high quality production Japanese anime, using japanese dialogue, and relevant background music and SFX",
      "",
      "### [France]",
      "**ANNOUNCER:** \"Leading the charge for France... KYLIAN MBAPPE!\"",
      "DIALOGUE (MBAPPE): \"Come on.\"",
      "SFX: Stadium crowd roaring.",
      "### [Final Shot]",
      "Freeze frame before contact. CUT TO BLACK.",
    ].join("\n");

    expect(resolveBriefAdaptationMode(detailedBrief)).toBe("preserve");
    expect(buildBriefAdaptationGuidance(detailedBrief, 15)).toContain(
      "preserve, not a loose vibe to replace",
    );
  });

  test("uses expand mode for sparse one-line prompts", () => {
    const brief = "Make a high quality production Japanese anime.";

    expect(resolveBriefAdaptationMode(brief)).toBe("expand");
    expect(buildBriefAdaptationGuidance(brief, 15)).toContain(
      "brief is sparse",
    );
  });
});

describe("validateBeatSheetForTarget", () => {
  test("flags fixed-template eight-beat sheets", () => {
    const sheet = [
      "STYLE: Anime sports drama.",
      ...Array.from({ length: 8 }, (_, index) =>
        `Beat ${index + 1} (MS, 4s): Player ${index + 1} drives to the basket.`,
      ),
      "TONE: Triumphant.",
    ].join("\n");

    const validation = validateBeatSheetForTarget(sheet, 15);
    expect(validation.beatCount).toBe(8);
    expect(validation.issues.some((issue) => issue.includes("fixed template"))).toBe(
      true,
    );
  });
});
