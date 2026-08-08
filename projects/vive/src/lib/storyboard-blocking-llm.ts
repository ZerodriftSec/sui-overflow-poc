import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { StoryboardBlocking2D, StoryboardCard } from "./project";
import type { AppSettings } from "./settings";
import { parseStoryboardBlocking2DFromText } from "./storyboard-blocking-2d";

const SYSTEM_PROMPT = `You are a storyboard blocking assistant.
Produce a 2D composition layout for a single shot.

Return ONLY a raw JSON object. No markdown.

Schema:
{
  "version": 1,
  "summary": "One sentence composition summary",
  "backgroundColor": "#111827",
  "boxes": [
    {
      "id": "subject-a",
      "label": "Character A",
      "color": "#60a5fa",
      "shape": "person",
      "x": 0.2,
      "y": 0.55,
      "width": 0.18,
      "height": 0.34,
      "depth": "midground"
    }
  ]
}

Rules:
- x,y,width,height are normalized values from 0 to 1
- box coordinates represent box centers
- keep between 2 and 12 boxes
- each box must include shape from: person, table, door, window, vehicle, prop, box
- label all key figures and important props
- reflect the intended framing from shot type and camera angle
- ensure readable composition (left/right/foreground separation)`;

function buildPrompt(card: StoryboardCard): string {
  return [
    "Create 2D blocking for this shot.",
    `Title: ${card.title}`,
    `Shot type: ${card.shotType}`,
    `Camera angle: ${card.cameraAngle}`,
    `Camera movement: ${card.cameraMovement || "Static"}`,
    `Description: ${card.shotDescription}`,
    card.characterAction ? `Character action: ${card.characterAction}` : "",
    card.dialogue ? `Dialogue: ${card.dialogue}` : "",
    card.storyPurpose ? `Story purpose: ${card.storyPurpose}` : "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export async function generateBlocking2DForStoryboardCard(
  card: StoryboardCard,
  settings: AppSettings,
  modelId: string,
  signal?: AbortSignal,
): Promise<{ blocking2d: StoryboardBlocking2D; usedModelId?: string }> {
  const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });
  const candidateModels = [modelId, "anthropic/claude-sonnet-4", "openai/gpt-4o-mini"]
    .filter((candidate, index, list) => list.indexOf(candidate) === index);
  let lastError: Error | null = null;

  for (const candidate of candidateModels) {
    try {
      const { text } = await generateText({
        model: openrouter.chat(candidate),
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(card),
        temperature: 0.2,
        abortSignal: signal,
      });
      const blocking2d = parseStoryboardBlocking2DFromText(text);
      return {
        blocking2d,
        usedModelId: candidate,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      lastError =
        error instanceof Error
          ? error
          : new Error("Failed to generate 2D blocking with model");
    }
  }

  throw lastError ?? new Error("Failed to generate 2D blocking");
}
