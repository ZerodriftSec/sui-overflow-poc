import { describe, expect, test } from "bun:test";
import {
  buildCharacterSheetImagePrompt,
  buildEnvironmentImagePrompt,
  buildStyleArtDirectionDirective,
  parseDesignAssetPlanFromText,
} from "./design-llm";

describe("buildStyleArtDirectionDirective", () => {
  test("returns empty string when no style brief is provided", () => {
    expect(buildStyleArtDirectionDirective("")).toBe("");
  });

  test("builds a mandatory art-direction instruction when style exists", () => {
    const directive = buildStyleArtDirectionDirective("Chinese kung fu drama, 1990s.");

    expect(directive).toContain("ART STYLE DIRECTION (MANDATORY)");
    expect(directive).toContain("Chinese kung fu drama, 1990s.");
    expect(directive).toContain("required visual language");
    expect(directive).toContain("entire image");
    expect(directive).toContain("do not switch to photorealism");
  });

  test("can target video wording for clip generation", () => {
    const directive = buildStyleArtDirectionDirective(
      "Anime Style, inspired from kuroko no basket.",
      { subject: "video" },
    );

    expect(directive).toContain("entire video");
    expect(directive).toContain("Anime Style, inspired from kuroko no basket.");
  });
});

describe("buildCharacterSheetImagePrompt", () => {
  test("injects style as explicit mandatory art direction", () => {
    const prompt = buildCharacterSheetImagePrompt({
      characterDescription: "Lean fighter with worn red sash and scarred knuckles.",
      styleBrief: "Chinese kung fu drama, 1990s.",
    });

    expect(prompt).toContain("ART STYLE DIRECTION (MANDATORY)");
    expect(prompt).toContain("Chinese kung fu drama, 1990s.");
    expect(prompt).toContain("Preserve the exact same art style treatment in all eight panels.");
  });
});

describe("buildEnvironmentImagePrompt", () => {
  test("locks style against photoreal / CGI sports-game defaults", () => {
    const prompt = buildEnvironmentImagePrompt({
      promptBody:
        "Empty stadium penalty-area establishing frame at night with green turf and floodlights.",
      styleBrief: "Anime Style, inspired from kuroko no basket.",
    });

    expect(prompt).toContain("ART STYLE DIRECTION (MANDATORY)");
    expect(prompt).toContain("Anime Style, inspired from kuroko no basket.");
    expect(prompt).toContain("RENDERING LOCK");
    expect(prompt).toContain("Do not render as photoreal photography");
    expect(prompt).toContain(
      "Final reminder — keep the entire image in this art style: Anime Style, inspired from kuroko no basket.",
    );
  });
});

describe("parseDesignAssetPlanFromText", () => {
  const validPlan = {
    assets: [
      {
        title: "Maya Chen — Character Sheet",
        kind: "character",
        description: "Young detective in a charcoal coat.",
        scriptReferences: "Beat 1-3",
      },
      {
        title: "Rooftop Alley — Night",
        kind: "environment",
        description: "Rain-slick rooftop alley with neon spill.",
        scriptReferences: ["Beat 2", "Beat 5"],
      },
    ],
  };

  test("parses a valid JSON object", () => {
    const briefs = parseDesignAssetPlanFromText(JSON.stringify(validPlan));
    expect(briefs).toHaveLength(2);
    expect(briefs[0]?.kind).toBe("character");
    expect(briefs[1]?.scriptReferences).toBe("Beat 2; Beat 5");
  });

  test("parses JSON wrapped in a markdown fence", () => {
    const briefs = parseDesignAssetPlanFromText(
      `Here you go:\n\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\`\n`,
    );
    expect(briefs).toHaveLength(2);
    expect(briefs[0]?.title).toContain("Maya Chen");
  });

  test("repairs trailing commas before parsing", () => {
    const briefs = parseDesignAssetPlanFromText(`{
      "assets": [
        {
          "title": "Maya Chen — Character Sheet",
          "kind": "character",
          "description": "Young detective in a charcoal coat.",
          "scriptReferences": "Beat 1-3",
        },
      ],
    }`);
    expect(briefs).toHaveLength(1);
  });

  test("throws a clear error for empty input instead of SyntaxError", () => {
    expect(() => parseDesignAssetPlanFromText("")).toThrow(
      /empty response/i,
    );
    expect(() => parseDesignAssetPlanFromText("   \n\t  ")).toThrow(
      /empty response/i,
    );

    try {
      parseDesignAssetPlanFromText("");
      throw new Error("expected parseDesignAssetPlanFromText to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SyntaxError);
      expect((error as Error).message).not.toMatch(/Unexpected end of JSON/i);
    }
  });

  test("throws a clear error for truncated JSON instead of SyntaxError", () => {
    expect(() =>
      parseDesignAssetPlanFromText('{"assets":[{"title":"Maya"'),
    ).toThrow(/malformed JSON|no JSON object/i);

    try {
      parseDesignAssetPlanFromText('{"assets":[{"title":"Maya"');
      throw new Error("expected parseDesignAssetPlanFromText to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(SyntaxError);
    }
  });

  test("throws a clear error when JSON has no assets", () => {
    expect(() => parseDesignAssetPlanFromText('{"assets":[]}')).toThrow(
      /validation/i,
    );
  });
});
