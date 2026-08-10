import { describe, expect, test } from "bun:test";
import { parseLegacyBlobRefMarker } from "./agent-conversation";

describe("parseLegacyBlobRefMarker", () => {
  test("detects legacy blob-ref pointer files", () => {
    expect(
      parseLegacyBlobRefMarker(
        JSON.stringify({ type: "blob-ref", blobId: "abc123" }),
      ),
    ).toBe("abc123");
  });

  test("returns null for regular conversation JSON", () => {
    expect(
      parseLegacyBlobRefMarker(
        JSON.stringify({ type: "agent-conversation", id: "conv-1" }),
      ),
    ).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    expect(parseLegacyBlobRefMarker("not-json")).toBeNull();
  });
});
