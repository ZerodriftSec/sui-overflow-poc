import { describe, expect, test } from "bun:test";
import {
  extensionFromMimeType,
  sanitizeDownloadFilename,
} from "./download-file";

describe("sanitizeDownloadFilename", () => {
  test("removes unsafe characters", () => {
    expect(sanitizeDownloadFilename('My "Script" / Draft')).toBe("My -Script- - Draft");
  });

  test("falls back when empty", () => {
    expect(sanitizeDownloadFilename("   ", "script")).toBe("script");
  });
});

describe("extensionFromMimeType", () => {
  test("maps common mime types", () => {
    expect(extensionFromMimeType("text/plain")).toBe("txt");
    expect(extensionFromMimeType("image/png")).toBe("png");
    expect(extensionFromMimeType("video/mp4")).toBe("mp4");
  });
});
