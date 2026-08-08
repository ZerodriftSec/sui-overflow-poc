import { describe, expect, test } from "bun:test";
import {
  assetFolderSegmentForLogicalPath,
  fileEntryNameKey,
  segmentForAssetFolderId,
  stripProjectPathPrefix,
} from "./folder-placement";

describe("folder-placement", () => {
  test("maps Script paths to the script Directory segment", () => {
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Script/Assets/script-1/v1.txt",
      ),
    ).toBe("script");
    expect(segmentForAssetFolderId("scripts")).toBe("script");
  });

  test("maps Conversations paths to the conversations Directory segment", () => {
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Conversations/text:_default/conv-1.json",
      ),
    ).toBe("conversations");
  });

  test("keeps workspace docs on the root Directory", () => {
    expect(assetFolderSegmentForLogicalPath("project/abc/manifest.json")).toBeNull();
    expect(assetFolderSegmentForLogicalPath("registry.json")).toBeNull();
  });

  test("maps Design character/environment paths to folder Directories", () => {
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Design/Characters/Assets/c1/v1.json",
      ),
    ).toBe("characters");
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Design/Environments/Assets/e1/image.png",
      ),
    ).toBe("environments");
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Design/Assets/legacy/v1.json",
      ),
    ).toBe("characters");
  });

  test("maps Film paths to the video clip Directory", () => {
    expect(
      assetFolderSegmentForLogicalPath(
        "project/abc/Film/Assets/clip-1/v1.json",
      ),
    ).toBe("video clip");
  });

  test("strips project prefix and normalizes entry keys", () => {
    expect(stripProjectPathPrefix("project/abc/Script/Assets/x/v1.txt")).toBe(
      "Script/Assets/x/v1.txt",
    );
    expect(fileEntryNameKey("/project/abc/manifest.json/")).toBe(
      "project/abc/manifest.json",
    );
  });
});
