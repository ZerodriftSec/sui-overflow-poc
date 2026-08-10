import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AppSettings } from "./settings";

export function createVideoGenerationModel(
  settings: AppSettings,
  modelId: string,
) {
  const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });
  return openrouter.videoModel(modelId, {
    pollIntervalMs: 3_000,
    maxPollTimeMs: 600_000,
  });
}

export function createAgentModel(settings: AppSettings, modelId: string) {
  const openrouter = createOpenRouter({ apiKey: settings.openRouterApiKey });
  return openrouter.chat(modelId);
}
