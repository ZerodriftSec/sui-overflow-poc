import type { AssetFolderId, CatalogFileType } from "./asset-catalog";
import type { Project } from "./project";
import { isFallbackDesignImage } from "./design-llm";
import type { WalrusStorageContext } from "./storage/walrus-storage";
import {
  listDesignAssetsForProject,
  listFilmAssetsForProject,
  listScriptAssetsForProject,
  listStoryboardAssetsForProject,
  loadDesignAssetDocument,
  loadDesignImageDataUrl,
  loadFilmAssetDocument,
  loadFilmVideoDataUrl,
  loadScriptAssetContent,
  loadStoryboardAssetDocument,
  type DesignAsset,
  type FilmAsset,
  type ScriptAsset,
} from "./workspace";
import type { StoryboardAsset } from "./project";

export interface LoadedAssetReference {
  id: string;
  title: string;
  content: string;
  fileType: CatalogFileType;
  imageDataUrl?: string;
  /** Data URL for a film clip used as a video generation reference. */
  videoDataUrl?: string;
}

export interface AssetReferenceLookup {
  folderId?: AssetFolderId;
  fileType?: CatalogFileType;
}

export interface AssetReferenceResolvers {
  getScriptAsset: (id: string) => ScriptAsset | null;
  getDesignAsset: (id: string) => DesignAsset | null;
  getStoryboardAsset: (id: string) => StoryboardAsset | null;
  getVideoAsset: (id: string) => FilmAsset | null;
}

function formatStoryboardCards(
  cards: Array<{
    title: string;
    shotDescription: string;
    storyPurpose: string;
    characterAction: string;
    visualSketch: string;
    scriptSegment?: string;
  }>,
): string {
  if (cards.length === 0) {
    return "(empty storyboard)";
  }

  return cards
    .map((card, index) => {
      const lines = [
        `Shot ${index + 1}: ${card.title}`,
        card.scriptSegment ? `Script: ${card.scriptSegment}` : null,
        `Purpose: ${card.storyPurpose}`,
        `Description: ${card.shotDescription}`,
        `Action: ${card.characterAction}`,
        `Visual: ${card.visualSketch}`,
      ].filter((line): line is string => Boolean(line));
      return lines.join("\n");
    })
    .join("\n\n");
}

async function loadScriptReference(
  ctx: WalrusStorageContext,
  project: Project,
  id: string,
  resolvers: AssetReferenceResolvers,
): Promise<LoadedAssetReference | null> {
  let asset = resolvers.getScriptAsset(id);
  if (!asset) {
    const scripts = await listScriptAssetsForProject(ctx, project);
    asset = scripts.find((item) => item.id === id) ?? null;
  }
  if (!asset) return null;

  const content = await loadScriptAssetContent(ctx, project, asset);
  return {
    id: asset.id,
    title: asset.title,
    content,
    fileType: "text",
  };
}

async function loadDesignReference(
  ctx: WalrusStorageContext,
  project: Project,
  id: string,
  resolvers: AssetReferenceResolvers,
  fileType: CatalogFileType,
): Promise<LoadedAssetReference | null> {
  let asset = resolvers.getDesignAsset(id);
  if (!asset) {
    const assets = await listDesignAssetsForProject(ctx, project);
    asset = assets.find((item) => item.id === id) ?? null;
  }
  if (!asset) return null;

  const document = await loadDesignAssetDocument(ctx, project, asset);
  const item = document.assets[0];
  const prompt = item?.prompt.trim() ?? "";
  const description = item?.description.trim() ?? "";
  const content = prompt || description || "(empty design asset)";

  let imageDataUrl: string | undefined;
  if (
    fileType === "image" &&
    item?.image &&
    !isFallbackDesignImage(item.image)
  ) {
    imageDataUrl = await loadDesignImageDataUrl(ctx, item.image);
  }

  return {
    id: asset.id,
    title: asset.title,
    content,
    fileType: asset.primaryFileType ?? fileType,
    imageDataUrl,
  };
}

async function loadStoryboardReference(
  ctx: WalrusStorageContext,
  project: Project,
  id: string,
  resolvers: AssetReferenceResolvers,
): Promise<LoadedAssetReference | null> {
  let asset = resolvers.getStoryboardAsset(id);
  if (!asset) {
    const assets = await listStoryboardAssetsForProject(ctx, project);
    asset = assets.find((item) => item.id === id) ?? null;
  }
  if (!asset) return null;

  const document = await loadStoryboardAssetDocument(ctx, project, asset);
  const content = formatStoryboardCards(document.cards);

  const sheetWithImage = document.sheets?.find(
    (sheet) =>
      sheet.image.dataBase64?.trim() ||
      sheet.image.imageBlobId?.trim(),
  );

  let imageDataUrl: string | undefined;
  if (sheetWithImage?.image) {
    try {
      imageDataUrl = await loadDesignImageDataUrl(ctx, sheetWithImage.image);
    } catch {
      imageDataUrl = undefined;
    }
  }

  return {
    id: asset.id,
    title: asset.title,
    content,
    fileType: imageDataUrl ? "image" : "text",
    imageDataUrl,
  };
}

async function loadVideoReference(
  ctx: WalrusStorageContext,
  project: Project,
  id: string,
  resolvers: AssetReferenceResolvers,
): Promise<LoadedAssetReference | null> {
  let asset = resolvers.getVideoAsset(id);
  if (!asset) {
    const assets = await listFilmAssetsForProject(ctx, project);
    asset = assets.find((item) => item.id === id) ?? null;
  }
  if (!asset) return null;

  const document = await loadFilmAssetDocument(ctx, project, asset);
  const content = document.prompt.trim() || "(no video prompt saved)";

  let videoDataUrl: string | undefined;
  if (document.video) {
    try {
      videoDataUrl = await loadFilmVideoDataUrl(ctx, document.video);
    } catch {
      videoDataUrl = undefined;
    }
  }

  return {
    id: asset.id,
    title: asset.title,
    content,
    fileType: videoDataUrl ? "video" : "text",
    videoDataUrl,
  };
}

function folderImpliesFileType(folderId: AssetFolderId): CatalogFileType {
  switch (folderId) {
    case "scripts":
    case "character_prompts":
    case "environment_prompts":
      return "text";
    case "character_sheets":
    case "environment_sheets":
    case "storyboards":
      return "image";
    case "videos":
      return "video";
  }
}

export async function loadAssetReference(
  ctx: WalrusStorageContext,
  project: Project,
  assetId: string,
  resolvers: AssetReferenceResolvers,
  lookup: AssetReferenceLookup = {},
): Promise<LoadedAssetReference | null> {
  const folderId = lookup.folderId;
  const fileType = lookup.fileType ?? (folderId ? folderImpliesFileType(folderId) : "text");

  try {
    if (folderId === "scripts" || (!folderId && resolvers.getScriptAsset(assetId))) {
      const loaded = await loadScriptReference(ctx, project, assetId, resolvers);
      if (loaded) return loaded;
      if (folderId === "scripts") return null;
    }

    if (
      folderId === "character_prompts" ||
      folderId === "character_sheets" ||
      folderId === "environment_prompts" ||
      folderId === "environment_sheets" ||
      (!folderId && resolvers.getDesignAsset(assetId))
    ) {
      const loaded = await loadDesignReference(
        ctx,
        project,
        assetId,
        resolvers,
        fileType,
      );
      if (loaded) return loaded;
      if (
        folderId === "character_prompts" ||
        folderId === "character_sheets" ||
        folderId === "environment_prompts" ||
        folderId === "environment_sheets"
      ) {
        return null;
      }
    }

    if (folderId === "storyboards" || (!folderId && resolvers.getStoryboardAsset(assetId))) {
      const loaded = await loadStoryboardReference(ctx, project, assetId, resolvers);
      if (loaded) return loaded;
      if (folderId === "storyboards") return null;
    }

    if (folderId === "videos" || (!folderId && resolvers.getVideoAsset(assetId))) {
      const loaded = await loadVideoReference(ctx, project, assetId, resolvers);
      if (loaded) return loaded;
      if (folderId === "videos") return null;
    }

    if (folderId) return null;

    return (
      (await loadScriptReference(ctx, project, assetId, resolvers)) ??
      (await loadDesignReference(ctx, project, assetId, resolvers, fileType)) ??
      (await loadStoryboardReference(ctx, project, assetId, resolvers)) ??
      (await loadVideoReference(ctx, project, assetId, resolvers))
    );
  } catch {
    return null;
  }
}
