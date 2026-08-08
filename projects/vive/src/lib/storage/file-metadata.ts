/** Seal-encrypted Walrus metadata JSON (architecture §3 tier 2). */
export interface FileMetadataDocument {
  filename: string;
  logicalPath: string;
  content_type: string;
  original_size: number;
}

export function buildFileMetadataDocument(input: {
  logicalPath: string;
  contentSize: number;
  mimeType: string;
}): FileMetadataDocument {
  return {
    filename: input.logicalPath.split("/").pop() ?? input.logicalPath,
    logicalPath: input.logicalPath,
    content_type: input.mimeType,
    original_size: input.contentSize,
  };
}

export function serializeFileMetadataDocument(
  document: FileMetadataDocument,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document));
}
