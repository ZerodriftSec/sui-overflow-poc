import { z } from "zod";
import type { StoryboardBlocking2D } from "./project";

const blocking2dSchema = z.object({
  version: z.literal(1),
  summary: z.string().default(""),
  backgroundColor: z.string().default("#111827"),
  boxes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      color: z.string(),
      shape: z
        .enum(["person", "table", "door", "window", "vehicle", "prop", "box"])
        .default("box"),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      depth: z.enum(["foreground", "midground", "background"]),
    }),
  ),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeStoryboardBlocking2D(
  input: StoryboardBlocking2D,
): StoryboardBlocking2D {
  return {
    ...input,
    summary: input.summary.trim(),
    boxes: input.boxes.slice(0, 24).map((box, index) => ({
      ...box,
      id: box.id.trim() || `box-${index + 1}`,
      label: box.label.trim() || `Subject ${index + 1}`,
      shape: box.shape,
      x: clamp(box.x, 0, 1),
      y: clamp(box.y, 0, 1),
      width: clamp(box.width, 0.05, 1),
      height: clamp(box.height, 0.05, 1),
    })),
  };
}

export function parseStoryboardBlocking2DFromUnknown(
  value: unknown,
): StoryboardBlocking2D | null {
  const result = blocking2dSchema.safeParse(value);
  if (!result.success) return null;
  return normalizeStoryboardBlocking2D(result.data);
}

function extractJsonObject(rawText: string): string {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return rawText.slice(start, end + 1);
  }
  return rawText.trim();
}

function parseLenientJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    return JSON.parse(cleaned);
  }
}

export function parseStoryboardBlocking2DFromText(text: string): StoryboardBlocking2D {
  const jsonObject = extractJsonObject(text);
  const parsed = parseLenientJsonObject(jsonObject);
  const blocking = parseStoryboardBlocking2DFromUnknown(parsed);
  if (!blocking) {
    throw new Error("Invalid 2D blocking JSON");
  }
  return blocking;
}
