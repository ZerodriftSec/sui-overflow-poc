import { describe, expect, test } from "bun:test";
import { isStoryboardCompanionMediaPath } from "./on-chain-catalog";

describe("isStoryboardCompanionMediaPath", () => {
  test("matches storyboard contact-sheet image paths", () => {
    expect(
      isStoryboardCompanionMediaPath(
        "Storyboard/Assets/seg-abc/sheet.png",
      ),
    ).toBe(true);
    expect(
      isStoryboardCompanionMediaPath(
        "project/proj-1/Storyboard/Assets/seg-abc/sheet.webp",
      ),
    ).toBe(true);
  });

  test("does not match storyboard document paths", () => {
    expect(
      isStoryboardCompanionMediaPath(
        "Storyboard/Assets/sb-1/v1.json",
      ),
    ).toBe(false);
  });

  test("does not match design companion or unrelated paths", () => {
    expect(
      isStoryboardCompanionMediaPath(
        "Design/Characters/Assets/char-1/image.png",
      ),
    ).toBe(false);
    expect(isStoryboardCompanionMediaPath("")).toBe(false);
    expect(isStoryboardCompanionMediaPath("Film/Assets/clip-1/video.mp4")).toBe(
      false,
    );
  });
});
