import { describe, expect, test } from "bun:test";
import {
  buildFileMetadataDocument,
  serializeFileMetadataDocument,
} from "./file-metadata";

describe("file metadata document", () => {
  test("builds the encrypted Walrus metadata payload", () => {
    const document = buildFileMetadataDocument({
      logicalPath: "project/abc/Script/Assets/id/v1.txt",
      contentSize: 42,
      mimeType: "text/plain",
    });

    expect(document).toEqual({
      filename: "v1.txt",
      logicalPath: "project/abc/Script/Assets/id/v1.txt",
      content_type: "text/plain",
      original_size: 42,
    });

    const bytes = serializeFileMetadataDocument(document);
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(document);
  });
});
