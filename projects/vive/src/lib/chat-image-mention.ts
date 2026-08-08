import type { ChatImageAttachment } from "./chat-image-attachment";
import type { StoredChatImage } from "./agent-conversation";

type NamedImage = Pick<ChatImageAttachment, "id" | "name"> | StoredChatImage;

export const IMAGE_MENTION_TOKEN_REGEX = /@\[image:([^\]]+)\]/g;

function sameNameCount(image: NamedImage, all: NamedImage[]): number {
  return all.filter((item) => item.name === image.name).length;
}

function sameNameIndex(image: NamedImage, all: NamedImage[]): number {
  let index = 0;
  for (const item of all) {
    if (item.name === image.name) {
      index += 1;
      if (item === image) {
        return index;
      }
    }
  }
  return 1;
}

export function getImageMentionLabel(
  image: NamedImage,
  all: NamedImage[],
): string {
  if (sameNameCount(image, all) > 1) {
    return `${image.name} (${sameNameIndex(image, all)})`;
  }
  return image.name;
}

export function buildImageMentionTokenId(attachmentId: string): string {
  return `@[image:${attachmentId}]`;
}

export function buildImageMentionDisplayToken(
  image: NamedImage,
  all: NamedImage[],
): string {
  return `@${getImageMentionLabel(image, all)}`;
}

export function buildImageMentionToken(
  image: ChatImageAttachment,
): string {
  return buildImageMentionTokenId(image.id);
}

export function expandImageMentionTokens<T extends NamedImage>(
  text: string,
  images: T[],
): string {
  return text.replace(IMAGE_MENTION_TOKEN_REGEX, (_match, attachmentId: string) => {
    const image = images.find(
      (item) => "id" in item && item.id === attachmentId,
    );
    if (!image) {
      return _match;
    }
    return buildImageMentionDisplayToken(image, images);
  });
}

export function filterImagesByMentionQuery<T extends NamedImage>(
  images: T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return images;
  }

  return images.filter((image) => {
    const label = getImageMentionLabel(image, images).toLowerCase();
    return label.includes(normalized) || image.name.toLowerCase().includes(normalized);
  });
}

function isCursorInsideCompletedMention(
  text: string,
  cursorPosition: number,
): boolean {
  const completedPattern = /@\[image:[^\]]+\]/g;
  let match: RegExpExecArray | null;
  while ((match = completedPattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (cursorPosition > start && cursorPosition <= end) {
      return true;
    }
  }
  return false;
}

export function resolveReferencedImageIndex<T extends NamedImage>(
  text: string,
  images: T[],
): number {
  if (images.length === 0) {
    return -1;
  }

  const tokenMatch = text.match(IMAGE_MENTION_TOKEN_REGEX);
  if (tokenMatch) {
    const fullMatch = tokenMatch[0];
    const idMatch = fullMatch.match(/@\[image:([^\]]+)\]/);
    const attachmentId = idMatch?.[1];
    if (attachmentId) {
      const index = images.findIndex(
        (item) => "id" in item && item.id === attachmentId,
      );
      if (index >= 0) {
        return index;
      }
    }
  }

  const expanded = expandImageMentionTokens(text, images);

  if (images.length === 1) {
    return 0;
  }

  const labels = images
    .map((image) => ({
      image,
      label: getImageMentionLabel(image, images),
    }))
    .sort((left, right) => right.label.length - left.label.length);

  for (const { image, label } of labels) {
    const token = `@${label}`;
    if (expanded.includes(token)) {
      return images.indexOf(image);
    }
  }

  return 0;
}

export interface ActiveImageMentionQuery {
  query: string;
  start: number;
}

export function getActiveImageMentionQuery(
  text: string,
  cursorPosition: number,
): ActiveImageMentionQuery | null {
  if (isCursorInsideCompletedMention(text, cursorPosition)) {
    return null;
  }

  const beforeCursor = text.slice(0, cursorPosition);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }

  const sliceFromAt = beforeCursor.slice(atIndex);
  if (/^@\[image:[^\]]*\]/.test(sliceFromAt)) {
    return null;
  }
  if (/^@\[image:[^\]]*$/.test(sliceFromAt)) {
    return null;
  }

  if (atIndex > 0 && !/\s/.test(beforeCursor[atIndex - 1] ?? "")) {
    return null;
  }

  const query = beforeCursor.slice(atIndex + 1);
  if (/[\n\r\[\]]/.test(query)) {
    return null;
  }

  return { query, start: atIndex };
}

export function insertImageMention(
  text: string,
  mentionStart: number,
  cursorPosition: number,
  token: string,
): { nextText: string; nextCursor: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(cursorPosition);
  const nextText = `${before}${token} ${after}`;
  const nextCursor = before.length + token.length + 1;
  return { nextText, nextCursor };
}

export function appendImageMentionLegend<T extends NamedImage>(
  text: string,
  images: T[],
): string {
  if (images.length <= 1) {
    return text;
  }

  const legend = images
    .map((image) => `- ${buildImageMentionDisplayToken(image, images)}`)
    .join("\n");

  const trimmed = text.trim();
  if (!trimmed) {
    return `Attached images:\n${legend}`;
  }

  return `Attached images:\n${legend}\n\n${trimmed}`;
}

export function stripImageMentionsFromPrompt(
  text: string,
  images: NamedImage[] = [],
): string {
  let result = text.replace(IMAGE_MENTION_TOKEN_REGEX, " ");
  for (const image of images) {
    const token = buildImageMentionDisplayToken(image, images);
    result = result.split(token).join(" ");
  }
  return result.replace(/\s+/g, " ").trim();
}

export interface ParsedInputSegment {
  type: "text" | "mention";
  value: string;
  attachmentId?: string;
}

export function parseInputWithMentions(value: string): ParsedInputSegment[] {
  const segments: ParsedInputSegment[] = [];
  const pattern = /@\[image:([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: value.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "mention",
      value: match[0],
      attachmentId: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    segments.push({
      type: "text",
      value: value.slice(lastIndex),
    });
  }

  return segments;
}
