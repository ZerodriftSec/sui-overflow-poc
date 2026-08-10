import { buildStoryboardPrompt, renumberStoryboardCards } from "./storyboard";
import type {
  StoryboardAsset,
  StoryboardCard,
  StoryboardDocument,
  StoryboardSheetEntry,
} from "./project";

export function withPrompt(card: StoryboardCard): StoryboardCard {
  return {
    ...card,
    generationPrompt: buildStoryboardPrompt(card),
  };
}

export function buildStoryboardDocument(
  cards: StoryboardCard[],
  source: {
    scriptId: string;
    version: number;
    blobId: string;
  } | null,
  sheets: StoryboardSheetEntry[] = [],
): StoryboardDocument {
  return {
    ...(source
      ? {
          sourceScriptId: source.scriptId,
          sourceScriptVersion: source.version,
          sourceScriptBlobId: source.blobId,
        }
      : {}),
    updatedAt: new Date().toISOString(),
    cards: renumberStoryboardCards(cards.map(withPrompt)),
    ...(sheets.length > 0 ? { sheets } : {}),
  };
}

export function nextStoryboardTitle(assets: StoryboardAsset[]): string {
  let index = assets.length + 1;
  while (assets.some((asset) => asset.title === `Storyboard ${index}`)) {
    index += 1;
  }
  return `Storyboard ${index}`;
}
