import type { AssetFolderId } from "./asset-catalog";
import type { StoryboardSource } from "./project";
import type { DesignAsset, DesignDocument } from "./workspace";

export function promptTitleFromText(
  prompt: string,
  kind: DesignAsset["kind"],
): string {
  const firstLine = prompt.split(/\n/)[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/^["']|["']$/g, "");
  const fallback =
    kind === "character" ? "Character Prompt" : "Environment Prompt";
  if (!cleaned) {
    return fallback;
  }
  if (cleaned.length <= 48) {
    return cleaned;
  }
  return `${cleaned.slice(0, 45).trim()}…`;
}

export function designFolderForKind(kind: DesignAsset["kind"]): AssetFolderId {
  return kind === "character" ? "character_sheets" : "environment_sheets";
}

export function resolveDesignKind(input: {
  folderId: AssetFolderId | null;
  assetKind?: DesignAsset["kind"];
  skillId?: string | null;
}): DesignAsset["kind"] {
  if (input.skillId === "environment" || input.skillId === "environment-sheet") {
    return "environment";
  }
  if (input.skillId === "character" || input.skillId === "character-sheet") {
    return "character";
  }
  if (input.assetKind) return input.assetKind;
  if (
    input.folderId === "environment_sheets" ||
    input.folderId === "environment_prompts"
  ) {
    return "environment";
  }
  return "character";
}

export function singleAssetDocument(
  source: StoryboardSource | null,
  styleBrief: string,
  asset: {
    id: string;
    title: string;
    kind: DesignAsset["kind"];
    description: string;
    prompt: string;
    generationModelId?: string;
    image: { mimeType: string; dataBase64: string };
  },
): DesignDocument {
  return {
    ...(source
      ? {
          sourceScriptId: source.scriptId,
          sourceScriptVersion: source.version,
          sourceScriptBlobId: source.blobId,
        }
      : {}),
    styleBrief,
    updatedAt: new Date().toISOString(),
    assets: [
      {
        id: asset.id,
        title: asset.title,
        kind: asset.kind,
        description: asset.description,
        prompt: asset.prompt,
        notes: "",
        generationModelId: asset.generationModelId?.trim() ?? "",
        image: asset.image,
      },
    ],
  };
}
