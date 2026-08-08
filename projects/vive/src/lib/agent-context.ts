import type { AssetFolderId, CatalogFileType } from "./asset-catalog";

export const MAX_ATTACHED_REFERENCES = 3;

export const ASSET_DRAG_MIME = "application/x-workspace-asset";
/** @deprecated Use ASSET_DRAG_MIME */
export const SCRIPT_DRAG_MIME = ASSET_DRAG_MIME;

export interface AssetDragPayload {
  id: string;
  title: string;
  folderId: AssetFolderId;
  fileType: CatalogFileType;
}

/** @deprecated Use AssetDragPayload */
export type ScriptDragPayload = AssetDragPayload;

export function serializeAssetDragPayload(payload: AssetDragPayload): string {
  return JSON.stringify(payload);
}

/** @deprecated Use serializeAssetDragPayload */
export const serializeScriptDragPayload = serializeAssetDragPayload;

export function parseAssetDragPayload(raw: string): AssetDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      "title" in parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.title === "string"
    ) {
      const record = parsed as Record<string, unknown>;
      const folderId = record.folderId;
      const fileType = record.fileType;
      return {
        id: parsed.id as string,
        title: parsed.title as string,
        folderId:
          typeof folderId === "string"
            ? (folderId as AssetFolderId)
            : "scripts",
        fileType:
          fileType === "text" || fileType === "image" || fileType === "video"
            ? fileType
            : "text",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated Use parseAssetDragPayload */
export const parseScriptDragPayload = parseAssetDragPayload;

export interface ContextReference {
  id: string;
  title: string;
  content: string;
  kind: "primary" | "attached";
}

export interface PrimaryContext {
  id: string | null;
  title: string;
  content: string;
}

export type AttachedReferenceStatus = "loading" | "ready" | "error";

export interface AttachedReferenceMeta {
  id: string;
  title: string;
  folderId?: AssetFolderId;
  fileType?: CatalogFileType;
  status: AttachedReferenceStatus;
  content?: string;
}

export function findAttachedStoryboardReference(
  references: AttachedReferenceMeta[],
): AttachedReferenceMeta | null {
  return (
    references.find(
      (reference) =>
        reference.folderId === "storyboards" && reference.status === "ready",
    ) ??
    references.find((reference) => reference.folderId === "storyboards") ??
    null
  );
}

export function formatContextBody(content: string): string {
  return content.trim() || "(empty)";
}

export function buildScriptContextSection(
  references: ContextReference[],
): string {
  const primary = references.find((ref) => ref.kind === "primary");
  const attached = references.filter((ref) => ref.kind === "attached");

  if (!primary) {
    if (attached.length === 0) {
      return "No script is attached. Work from the user's description; they may optionally drag a script from the asset panel for additional context.";
    }

    const attachedSections = attached
      .map(
        (ref) => `"${ref.title}":
---
${formatContextBody(ref.content)}
---`,
      )
      .join("\n\n");

    if (attached.length === 1) {
      return `Attached script ("${attached[0]!.title}"):
---
${formatContextBody(attached[0]!.content)}
---`;
    }

    return `Attached scripts:

${attachedSections}`;
  }

  const primarySection = `Primary script being edited ("${primary.title}"):
---
${formatContextBody(primary.content)}
---`;

  if (attached.length === 0) {
    return primarySection;
  }

  const attachedSections = attached
    .map(
      (ref) => `"${ref.title}":
---
${formatContextBody(ref.content)}
---`,
    )
    .join("\n\n");

  return `${primarySection}

Additional reference scripts (read-only context — do not rewrite these unless explicitly asked):

${attachedSections}`;
}
