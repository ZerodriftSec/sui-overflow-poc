import { describe, expect, test } from "bun:test";
import type { StoryboardCard } from "./project";
import {
  groupStoryboardCardsIntoSegments,
  resolveAgentSegmentPlan,
} from "./workflow-options";

function makeCard(index: number, durationSec = 4): StoryboardCard {
  return {
    id: `card-${index}`,
    sceneIndex: 0,
    shotIndex: index,
    title: `Beat ${index}`,
    scriptSegment: `Beat ${index}`,
    storyPurpose: `Beat ${index}`,
    shotDescription: `Shot ${index}`,
    shotType: "MS",
    cameraAngle: "eye-level",
    cameraMovement: "Static",
    characterAction: "",
    visualSketch: "",
    sceneGraph: null,
    blocking2d: null,
    dialogue: "",
    voiceover: "",
    sfx: "",
    musicCue: "",
    continuity: "",
    estimatedDurationSec: durationSec,
    transitionOut: "cut",
    negativePrompt: "",
    status: "draft",
    generationPrompt: "",
  };
}

describe("resolveAgentSegmentPlan", () => {
  test("uses duration-only segments when shots fit on one sheet", () => {
    const plan = resolveAgentSegmentPlan({
      totalDurationSec: 30,
      shotCount: 6,
      maxClipDurationSec: 15,
    });

    expect(plan.segmentCount).toBe(2);
    expect(plan.minSegmentsByDuration).toBe(2);
    expect(plan.minSegmentsByShots).toBe(1);
    expect(plan.segmentDurations).toEqual([15, 15]);
  });

  test("adds segments when shot count exceeds the per-sheet panel cap", () => {
    const plan = resolveAgentSegmentPlan({
      totalDurationSec: 15,
      shotCount: 10,
      maxClipDurationSec: 15,
      maxShotsPerSheet: 8,
    });

    expect(plan.segmentCount).toBe(2);
    expect(plan.minSegmentsByShots).toBe(2);
    expect(plan.minSegmentsByDuration).toBe(1);
    expect(plan.segmentDurations.reduce((sum, value) => sum + value, 0)).toBe(
      15,
    );
  });

  test("creates enough segments for long runtimes with many beats", () => {
    const plan = resolveAgentSegmentPlan({
      totalDurationSec: 60,
      shotCount: 16,
      maxClipDurationSec: 15,
      maxShotsPerSheet: 8,
    });

    expect(plan.segmentCount).toBe(4);
    expect(plan.minSegmentsByShots).toBe(2);
    expect(plan.minSegmentsByDuration).toBe(4);
  });
});

describe("groupStoryboardCardsIntoSegments", () => {
  test("assigns all 8 beats evenly across two 15s segments", () => {
    const cards = Array.from({ length: 8 }, (_, index) => makeCard(index + 1));
    const segments = groupStoryboardCardsIntoSegments(cards, [15, 15], 15);

    expect(segments).toHaveLength(2);
    expect(segments[0].cards).toHaveLength(4);
    expect(segments[1].cards).toHaveLength(4);
    expect(
      segments[0].cards.length + segments[1].cards.length,
    ).toBe(8);
  });

  test("does not drop beats when one duration-based segment is insufficient", () => {
    const cards = Array.from({ length: 10 }, (_, index) => makeCard(index + 1));
    const segments = groupStoryboardCardsIntoSegments(cards, [15], 15);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    const assigned = segments.reduce(
      (sum, segment) => sum + segment.cards.length,
      0,
    );
    expect(assigned).toBe(10);
    for (const segment of segments) {
      expect(segment.cards.length).toBeLessThanOrEqual(8);
    }
  });

  test("splits 7 beats across two segments as 4 and 3", () => {
    const cards = Array.from({ length: 7 }, (_, index) => makeCard(index + 1));
    const segments = groupStoryboardCardsIntoSegments(cards, [8, 7], 15);

    expect(segments).toHaveLength(2);
    expect(segments[0].cards).toHaveLength(4);
    expect(segments[1].cards).toHaveLength(3);
  });
});
