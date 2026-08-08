import type { Phase } from "../../components/workspace/types";
import type { ConversationScope } from "../chat-scope";
import { conversationBucketKey, legacyConversationBucketKeys } from "../chat-scope";

export function projectMetaPath(_projectId: string): string {
  return "project.json";
}

export function manifestPath(_projectId: string): string {
  return "manifest.json";
}

export function directoryMetadataPath(_projectId: string): string {
  return "directory-metadata.json";
}

function phaseDir(phase: Phase): string {
  switch (phase) {
    case "script":
      return "Script";
    case "design":
      return "Design";
    case "storyboard":
      return "Storyboard";
    case "film":
      return "Film";
  }
}

export function conversationIndexPath(_projectId: string, phase: Phase): string {
  return `${phaseDir(phase)}/Conversations/_index.json`;
}

export function conversationScopeIndexPath(
  _projectId: string,
  scope: ConversationScope,
): string {
  return `Conversations/${conversationBucketKey(scope)}/_index.json`;
}

export function conversationScopePath(
  _projectId: string,
  scope: ConversationScope,
  conversationId: string,
): string {
  return `Conversations/${conversationBucketKey(scope)}/${conversationId}.json`;
}

export function conversationScopeAttachmentPath(
  _projectId: string,
  scope: ConversationScope,
  conversationId: string,
  imageId: string,
  extension: string,
): string {
  return `Conversations/${conversationBucketKey(scope)}/${conversationId}/attachments/${imageId}.${extension}`;
}

export function legacyConversationScopeIndexPath(
  _projectId: string,
  bucketKey: string,
): string {
  return `Conversations/${bucketKey}/_index.json`;
}

export function legacyConversationScopePath(
  _projectId: string,
  bucketKey: string,
  conversationId: string,
): string {
  return `Conversations/${bucketKey}/${conversationId}.json`;
}

export function legacyConversationScopePaths(
  projectId: string,
  scope: ConversationScope,
  conversationId: string,
): string[] {
  return legacyConversationBucketKeys(scope).map((bucketKey) =>
    legacyConversationScopePath(projectId, bucketKey, conversationId),
  );
}

/** @deprecated Use conversationScopeIndexPath */
export function workflowConversationIndexPath(
  _projectId: string,
  workflowStep: string,
): string {
  return `Workflow/Conversations/${workflowStep}/_index.json`;
}

/** @deprecated Use conversationScopePath */
export function workflowConversationPath(
  _projectId: string,
  workflowStep: string,
  conversationId: string,
): string {
  return `Workflow/Conversations/${workflowStep}/${conversationId}.json`;
}

export function conversationPath(
  _projectId: string,
  phase: Phase,
  conversationId: string,
): string {
  return `${phaseDir(phase)}/Conversations/${conversationId}.json`;
}

export function scriptAssetPath(
  _projectId: string,
  assetId: string,
  version: number,
): string {
  return `Script/Assets/${assetId}/v${version}.txt`;
}

export type DesignPathKind = "character" | "environment";

function designKindDir(kind: DesignPathKind): string {
  return kind === "environment" ? "Environments" : "Characters";
}

/** Current layout: Design/Characters|Environments/Assets/... → on-chain folder dirs. */
export function designAssetPath(
  _projectId: string,
  assetId: string,
  version: number,
  kind: DesignPathKind,
): string {
  return `Design/${designKindDir(kind)}/Assets/${assetId}/v${version}.json`;
}

/** Pre-folder-kind layout (files often landed on vault root Directory). */
export function legacyDesignAssetPath(
  _projectId: string,
  assetId: string,
  version: number,
): string {
  return `Design/Assets/${assetId}/v${version}.json`;
}

export function storyboardAssetPath(
  _projectId: string,
  assetId: string,
  version: number,
): string {
  return `Storyboard/Assets/${assetId}/v${version}.json`;
}

export function filmAssetPath(
  _projectId: string,
  assetId: string,
  version: number,
): string {
  return `Film/Assets/${assetId}/v${version}.json`;
}

export function storyboardSheetImagePath(
  _projectId: string,
  segmentId: string,
  extension: string,
): string {
  return `Storyboard/Assets/${segmentId}/sheet.${extension}`;
}

export function designImagePath(
  _projectId: string,
  assetId: string,
  extension: string,
  kind: DesignPathKind,
): string {
  return `Design/${designKindDir(kind)}/Assets/${assetId}/image.${extension}`;
}

export function legacyDesignImagePath(
  _projectId: string,
  assetId: string,
  extension: string,
): string {
  return `Design/Assets/${assetId}/image.${extension}`;
}

export function filmVideoPath(
  _projectId: string,
  clipId: string,
  extension: string,
): string {
  return `Film/Assets/${clipId}/video.${extension}`;
}

export function chatAttachmentPath(
  _projectId: string,
  phase: Phase,
  conversationId: string,
  imageId: string,
  extension: string,
): string {
  return `${phaseDir(phase)}/Conversations/${conversationId}/attachments/${imageId}.${extension}`;
}

/** @deprecated Use conversationScopeAttachmentPath */
export function workflowChatAttachmentPath(
  _projectId: string,
  workflowStep: string,
  conversationId: string,
  imageId: string,
  extension: string,
): string {
  return `Workflow/Conversations/${workflowStep}/${conversationId}/attachments/${imageId}.${extension}`;
}

export function skillsIndexPath(): string {
  return "Skills/_index.json";
}

export function skillRecordPath(skillId: string): string {
  return `Skills/${skillId}.json`;
}
