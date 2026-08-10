import { z } from "zod";
import type {
  StoryboardSceneGraph,
  StoryboardSceneVector3,
} from "./project";

const MIN_OBJECT_SCALE = 0.1;

const vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const sceneGraphSchema = z.object({
  version: z.literal(1),
  summary: z.string().default(""),
  camera: z.object({
    projection: z.literal("perspective").default("perspective"),
    position: vector3Schema,
    target: vector3Schema,
    fov: z.number(),
  }),
  lights: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["ambient", "directional"]),
      color: z.string(),
      intensity: z.number(),
      position: vector3Schema.optional(),
    }),
  ),
  objects: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      primitive: z.enum(["box", "sphere", "capsule", "cylinder", "cone", "plane"]),
      color: z.string(),
      position: vector3Schema,
      rotation: vector3Schema,
      scale: vector3Schema,
    }),
  ),
  ground: z
    .object({
      enabled: z.boolean().default(true),
      color: z.string().default("#2b2d31"),
      size: z.number().default(24),
    })
    .optional(),
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeVector(input: StoryboardSceneVector3): StoryboardSceneVector3 {
  return {
    x: clamp(input.x, -50, 50),
    y: clamp(input.y, -50, 50),
    z: clamp(input.z, -50, 50),
  };
}

function sanitizeScale(input: StoryboardSceneVector3): StoryboardSceneVector3 {
  return {
    x: clamp(Math.abs(input.x), MIN_OBJECT_SCALE, 20),
    y: clamp(Math.abs(input.y), MIN_OBJECT_SCALE, 20),
    z: clamp(Math.abs(input.z), MIN_OBJECT_SCALE, 20),
  };
}

export function normalizeStoryboardSceneGraph(
  graph: StoryboardSceneGraph,
): StoryboardSceneGraph {
  const lights = graph.lights.slice(0, 6).map((light, index) => ({
    ...light,
    id: light.id.trim() || `light-${index + 1}`,
    intensity: clamp(light.intensity, 0, 8),
    position: light.position ? sanitizeVector(light.position) : undefined,
  }));

  const objects = graph.objects.slice(0, 48).map((object, index) => ({
    ...object,
    id: object.id.trim() || `object-${index + 1}`,
    label: object.label.trim() || `Object ${index + 1}`,
    position: sanitizeVector(object.position),
    rotation: {
      x: clamp(object.rotation.x, -Math.PI * 4, Math.PI * 4),
      y: clamp(object.rotation.y, -Math.PI * 4, Math.PI * 4),
      z: clamp(object.rotation.z, -Math.PI * 4, Math.PI * 4),
    },
    scale: sanitizeScale(object.scale),
  }));

  return {
    ...graph,
    summary: graph.summary.trim(),
    camera: {
      projection: "perspective",
      position: sanitizeVector(graph.camera.position),
      target: sanitizeVector(graph.camera.target),
      fov: clamp(graph.camera.fov, 20, 100),
    },
    lights,
    objects,
    ground: graph.ground
      ? {
          enabled: graph.ground.enabled,
          color: graph.ground.color,
          size: clamp(graph.ground.size, 4, 120),
        }
      : undefined,
  };
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

export function parseStoryboardSceneGraphFromUnknown(
  value: unknown,
): StoryboardSceneGraph | null {
  const result = sceneGraphSchema.safeParse(value);
  if (!result.success) {
    return null;
  }
  return normalizeStoryboardSceneGraph(result.data);
}

export function parseStoryboardSceneGraphFromText(
  rawText: string,
): StoryboardSceneGraph {
  const jsonObject = extractJsonObject(rawText);
  const parsed = parseLenientJsonObject(jsonObject);
  const sceneGraph = parseStoryboardSceneGraphFromUnknown(parsed);
  if (!sceneGraph) {
    throw new Error("Invalid scene graph JSON");
  }
  return sceneGraph;
}
