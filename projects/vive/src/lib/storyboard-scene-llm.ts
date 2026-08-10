import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { StoryboardCard, StoryboardSceneGraph } from "./project";
import type { AppSettings } from "./settings";
import { parseStoryboardSceneGraphFromText } from "./storyboard-scene-graph";

const SYSTEM_PROMPT = `You are a previs assistant. Produce a compact 3D scene graph for one storyboard shot.

Rules:
- Output ONLY a raw JSON object (no markdown)
- The object must match the exact schema below
- Keep the graph simple and editable: 2 to 12 objects
- Use only primitive types: box, sphere, capsule, cylinder, cone, plane
- Keep scale positive and realistic
- Place key subjects near camera target so composition reads clearly

Schema:
{
  "version": 1,
  "summary": "One sentence visual summary",
  "camera": {
    "projection": "perspective",
    "position": { "x": 0, "y": 2, "z": 8 },
    "target": { "x": 0, "y": 1, "z": 0 },
    "fov": 45
  },
  "lights": [
    { "id": "ambient", "type": "ambient", "color": "#ffffff", "intensity": 0.5 },
    { "id": "key", "type": "directional", "color": "#ffffff", "intensity": 1.1, "position": { "x": 4, "y": 6, "z": 2 } }
  ],
  "objects": [
    {
      "id": "hero",
      "label": "Hero",
      "primitive": "capsule",
      "color": "#7aa2ff",
      "position": { "x": 0, "y": 1, "z": 0 },
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "scale": { "x": 0.6, "y": 1.8, "z": 0.6 }
    }
  ],
  "ground": { "enabled": true, "color": "#2b2d31", "size": 24 }
}`;

function buildUserPrompt(card: StoryboardCard): string {
  return [
    "Create a scene graph for this storyboard shot.",
    `Title: ${card.title}`,
    `Scene index: ${card.sceneIndex}`,
    `Shot type: ${card.shotType}`,
    `Camera angle: ${card.cameraAngle}`,
    `Camera movement: ${card.cameraMovement || "Static"}`,
    `Description: ${card.shotDescription}`,
    card.characterAction ? `Character action: ${card.characterAction}` : "",
    card.dialogue ? `Dialogue: ${card.dialogue}` : "",
    card.storyPurpose ? `Story purpose: ${card.storyPurpose}` : "",
    "Keep composition aligned with the intended framing.",
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

export async function generateSceneGraphForStoryboardCard(
  card: StoryboardCard,
  settings: AppSettings,
  modelId: string,
  signal?: AbortSignal,
): Promise<{ sceneGraph: StoryboardSceneGraph; usedModelId?: string }> {
  const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });

  const { text } = await generateText({
    model: openrouter.chat(modelId),
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(card),
    temperature: 0.2,
    abortSignal: signal,
  });
  const sceneGraph = parseStoryboardSceneGraphFromText(text);
  return {
    sceneGraph,
    usedModelId: modelId,
  };
}
