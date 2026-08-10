import { describe, expect, test } from "bun:test";
import type { StoryboardCard } from "./project";
import {
  buildCompactSegmentVideoPrompt,
  buildSegmentVideoPrompt,
  runVideoClipAgent,
  type StoryboardSheet,
} from "./workflow-agents";

function makeCard(
  overrides: Partial<StoryboardCard> & Pick<StoryboardCard, "shotDescription">,
): StoryboardCard {
  return {
    id: "card-1",
    sceneIndex: 0,
    shotIndex: 1,
    title: "Panel 1",
    scriptSegment: "Beat 1",
    storyPurpose: "Hook",
    shotType: "WS",
    cameraAngle: "eye-level",
    cameraMovement: "Static",
    characterAction: "",
    visualSketch: "",
    dialogue: "",
    voiceover: "",
    sfx: "",
    musicCue: "",
    continuity: "",
    estimatedDurationSec: 4,
    transitionOut: "cut",
    generationPrompt: "",
    negativePrompt: "",
    status: "draft",
    ...overrides,
  };
}

describe("buildSegmentVideoPrompt", () => {
  test("does not truncate long shot descriptions or actions", () => {
    const longDescription =
      "Low-angle tracking shot of a motorcycle weaving rapidly through dense traffic on a neon-lit city street. The rider wears a branded food delivery backpack, head ducked low. Tail lights smear into red streaks.";
    const longAction =
      "The rider leans forward, gaze fixed on the traffic light ahead, accelerating harder as the yellow glow shifts to red and the engine note climbs.";

    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: longDescription,
          characterAction: longAction,
        }),
      ],
      4,
    );

    expect(prompt).toContain(longDescription);
    expect(prompt).toContain(longAction);
    expect(prompt).toContain(
      "Match each attached storyboard panel's composition as closely as possible",
    );
    expect(prompt).toContain(
      "If a panel is garbled, incoherent, or contradicts the shot timeline or scene",
    );
    expect(prompt).not.toContain("...");
  });

  test("extracts embedded ACTION from shot description into the action line", () => {
    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription:
            "Over-the-shoulder shot from behind the rider, focused on the traffic light ahead turning from yellow to red. ACTION: He leans forward, gaze fixed on the light, accelerating through the intersection.",
        }),
      ],
      4,
    );

    expect(prompt).toContain(
      "Over-the-shoulder shot from behind the rider, focused on the traffic light ahead turning from yellow to red.",
    );
    expect(prompt).toContain(
      "ACTION: He leans forward, gaze fixed on the light, accelerating through the intersection.",
    );
    expect(prompt).not.toContain("ACTION: T...");
  });

  test("includes dialogue per panel and omits placeholder action lines", () => {
    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Close-up on the rider's face as traffic blurs behind him.",
          characterAction: "Hold the emotional beat with clear blocking.",
          dialogue: '"I can make this light."',
        }),
        makeCard({
          shotDescription: "Wide shot of the intersection.",
          characterAction: "",
          dialogue: '"Not like this."',
        }),
      ],
      8,
    );

    expect(prompt).toContain('DIALOGUE: "I can make this light."');
    expect(prompt).toContain('DIALOGUE: "Not like this."');
    expect(prompt).not.toContain("Hold the emotional beat with clear blocking");
    expect(prompt).not.toContain("ACTION:");
  });

  test("extracts embedded dialogue from shot description", () => {
    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription:
            "Medium shot of the rider gripping the handlebars.\nDIALOGUE (RIDER): \"Hold on.\"",
        }),
      ],
      4,
    );

    expect(prompt).toContain("Medium shot of the rider gripping the handlebars.");
    expect(prompt).toContain('DIALOGUE: RIDER: "Hold on."');
  });
});

describe("buildCompactSegmentVideoPrompt", () => {
  test("uses one line per panel and omits (none) dialogue", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription:
            "Wide shot of a peasant lifting a wooden training sword from a rack.",
          characterAction: "Raises the sword to shoulder height.",
          dialogue: "(none)",
          sfx: "Wood scraping.",
        }),
        makeCard({
          shotDescription: "Close-up on hands wrapping leather on the grip.",
          dialogue: '"Keep your grip tight."',
        }),
      ],
      8,
    );

    expect(prompt).toContain("2 hard-cut panels");
    expect(prompt).toContain("P1 WS eye-level");
    expect(prompt).toContain("→ HARD CUT");
    expect(prompt).toContain(
      "Match each attached storyboard panel's composition as closely as possible",
    );
    expect(prompt).toContain(
      "If a panel is garbled, incoherent, or contradicts the shot timeline or scene",
    );
    expect(prompt).toContain(
      "shot: Wide shot of a peasant lifting a wooden training sword from a rack.",
    );
    expect(prompt).toContain("action: Raises the sword to shoulder height.");
    expect(prompt).toContain(
      "shot: Close-up on hands wrapping leather on the grip.",
    );
    expect(prompt).toContain("sfx: Wood scraping.");
    expect(prompt).toContain('dialogue: "Keep your grip tight."');
    expect(prompt).not.toContain("DIALOGUE: (none)");
    expect(prompt).not.toContain("Follow the attached storyboard contact sheet");
    expect(prompt.split("\n").filter((line) => line.startsWith("0:")).length).toBe(
      2,
    );
  });

  test("includes shot description even when character action is missing", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription:
            "Sweaty anime close-up of the striker smirking under stadium floodlights.",
          characterAction: "",
        }),
      ],
      10,
    );

    expect(prompt).toContain(
      "shot: Sweaty anime close-up of the striker smirking under stadium floodlights.",
    );
    expect(prompt).not.toContain("action:");
  });

  test("adds continuation guidance for follow-on clips", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Medium shot as the hero steps through the doorway.",
          characterAction: "Steps forward into the room.",
        }),
      ],
      10,
      {
        continuesFromPrevious: true,
        segmentIndex: 1,
        totalSegments: 2,
      },
    );

    expect(prompt).toContain("Segment 2 of 2");
    expect(prompt).toContain("CONTINUATION:");
    expect(prompt).toContain("seamless narrative continuation");
    expect(prompt).toContain("10s, 1 hard-cut panel");
  });

  test("locks art style on single-clip sequences when a style brief is provided", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Wide establishing shot of the courtyard.",
        }),
      ],
      8,
      {
        continuesFromPrevious: false,
        segmentIndex: 0,
        totalSegments: 1,
        styleBrief: "Anime Style, inspired from kuroko no basket.",
      },
    );

    expect(prompt).toContain("CRITICAL STYLE LOCK");
    expect(prompt).toContain("Anime Style, inspired from kuroko no basket.");
  });

  test("locks art style when a style brief is provided", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Close-up of the striker celebrating.",
        }),
      ],
      12,
      {
        styleBrief: "Anime Style, inspired from kuroko no basket.",
        continuesFromPrevious: true,
        segmentIndex: 1,
        totalSegments: 2,
      },
    );

    expect(prompt).toContain("ART STYLE DIRECTION (MANDATORY)");
    expect(prompt).toContain("Anime Style, inspired from kuroko no basket.");
    expect(prompt).toContain("entire video");
    expect(prompt).toContain("do not switch to photorealism");
    expect(prompt).toContain("CONTINUATION:");
  });

  test("omits art style direction when no style brief is provided", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Wide establishing shot of the courtyard.",
        }),
      ],
      8,
    );

    expect(prompt).not.toContain("ART STYLE DIRECTION");
  });

  test("omits continuation guidance for the first clip", () => {
    const prompt = buildCompactSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Wide establishing shot of the courtyard.",
        }),
      ],
      8,
      {
        continuesFromPrevious: false,
        segmentIndex: 0,
        totalSegments: 2,
      },
    );

    expect(prompt).not.toContain("CONTINUATION:");
  });

  test("is shorter than the full segment prompt for the same cards", () => {
    const cards = [
      makeCard({
        shotDescription:
          "Low-angle tracking shot of a motorcycle weaving rapidly through dense traffic on a neon-lit city street.",
        characterAction: "The rider leans forward and accelerates.",
        dialogue: "(none)",
        sfx: "Engine roar.",
      }),
      makeCard({
        shotDescription: "Close-up on the rider's helmet visor reflecting city lights.",
        dialogue: '"Hold on."',
      }),
    ];

    const compact = buildCompactSegmentVideoPrompt(cards, 8);
    const full = buildSegmentVideoPrompt(cards, 8);

    expect(compact.length).toBeLessThan(full.length);
  });
});

describe("buildSegmentVideoPrompt continuation", () => {
  test("adds continuation guidance for follow-on clips", () => {
    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Close-up as the hero looks toward the window.",
        }),
      ],
      6,
      { continuesFromPrevious: true, segmentIndex: 2, totalSegments: 3 },
    );

    expect(prompt).toContain("CONTINUATION:");
    expect(prompt).toContain("Segment 3 of 3");
  });

  test("locks art style when a style brief is provided", () => {
    const prompt = buildSegmentVideoPrompt(
      [
        makeCard({
          shotDescription: "Close-up as the hero looks toward the window.",
        }),
      ],
      6,
      {
        styleBrief: "Chinese kung fu drama, 1990s.",
        continuesFromPrevious: true,
        segmentIndex: 1,
        totalSegments: 2,
      },
    );

    expect(prompt).toContain("ART STYLE DIRECTION (MANDATORY)");
    expect(prompt).toContain("Chinese kung fu drama, 1990s.");
    expect(prompt).toContain("entire video");
  });
});

describe("runVideoClipAgent", () => {
  test("includes style brief in every clip prompt", async () => {
    const sheets: StoryboardSheet[] = [
      {
        segmentId: "seg-1",
        segmentIndex: 0,
        segmentTitle: "Opening",
        durationSec: 5,
        shotIds: ["card-1"],
        panelCount: 1,
        shotId: "card-1",
        shotTitle: "Opening",
        mimeType: "image/png",
        dataBase64: "aaa",
        prompt: "sheet-1",
        panelAspectRatio: "16:9",
      },
      {
        segmentId: "seg-2",
        segmentIndex: 1,
        segmentTitle: "Continuation",
        durationSec: 5,
        shotIds: ["card-2"],
        panelCount: 1,
        shotId: "card-2",
        shotTitle: "Continuation",
        mimeType: "image/png",
        dataBase64: "bbb",
        prompt: "sheet-2",
        panelAspectRatio: "16:9",
      },
    ];
    const prompts: string[] = [];

    await runVideoClipAgent(
      sheets,
      [
        makeCard({ id: "card-1", shotDescription: "Wide shot" }),
        makeCard({ id: "card-2", shotDescription: "Close-up" }),
      ],
      {
        openRouterApiKey: "test",
      } as never,
      {
        projectId: "project-1",
        styleBrief: "Anime Style, inspired from kuroko no basket.",
        generateClip: async ({ prompt }) => {
          prompts.push(prompt);
          return crypto.randomUUID();
        },
      },
    );

    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("ART STYLE DIRECTION (MANDATORY)");
      expect(prompt).toContain("Anime Style, inspired from kuroko no basket.");
    }
    expect(prompts[1]).toContain("CONTINUATION:");
  });

  test("throws when every clip generation fails", async () => {
    const sheet: StoryboardSheet = {
      segmentId: "seg-1",
      segmentIndex: 0,
      segmentTitle: "Opening",
      durationSec: 5,
      shotIds: ["card-1"],
      panelCount: 1,
      shotId: "card-1",
      shotTitle: "Opening",
      mimeType: "image/png",
      dataBase64: "aaaa",
      prompt: "storyboard",
      panelAspectRatio: "16:9",
    };

    await expect(
      runVideoClipAgent([sheet], [makeCard({ id: "card-1", shotDescription: "Wide shot" })], {
        openRouterApiKey: "test",
      } as never, {
        projectId: "project-1",
        generateClip: async () => {
          throw new Error(
            'Video generation failed for model "bytedance/seedance-2.0-fast": copyright restrictions',
          );
        },
      }),
    ).rejects.toThrow(/copyright restrictions/);
  });
});
