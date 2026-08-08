import { generateObject, generateText, NoObjectGeneratedError } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { formatProviderError } from "./provider-error";
import type { AppSettings } from "./settings";
import type { DesignAsset } from "./workspace";
import {
  DEFAULT_IMAGE_GENERATION_SIZE,
  type ImageGenerationSize,
} from "./openrouter-models";
import { generateOpenRouterImage } from "./openrouter-images";

const DESIGN_ASSET_EXTRACT_MAX_ATTEMPTS = 3;

export type DesignGenerationStatus =
  | "idle"
  | "analyzing"
  | "extracting-assets"
  | "generating-assets"
  | "saving"
  | "done"
  | "error";

export type DesignAssetProgressPhase = "prompt" | "image";

export interface DesignAssetBrief {
  title: string;
  kind: DesignAsset["kind"];
  description: string;
  scriptReferences: string;
}

export interface DesignAssetWithPrompt extends DesignAssetBrief {
  imagePrompt: string;
}

export interface GeneratedDesignAsset extends DesignAssetWithPrompt {
  image: {
    mimeType: string;
    dataBase64: string;
  };
  generationModelId?: string;
}

export const AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS = 1;

export interface GenerateDesignAssetsInput {
  scriptContent: string;
  styleBrief: string;
  settings: AppSettings;
  analysisModelId: string;
  imageModelId: string;
  imageResolution?: ImageGenerationSize;
  maxEnvironmentAssets?: number;
  /** When true, image provider failures throw instead of SVG placeholders. */
  throwOnImageError?: boolean;
  signal?: AbortSignal;
  onStatus?: (status: DesignGenerationStatus) => void;
  onAssetProgress?: (
    current: number,
    total: number,
    title: string,
    phase: DesignAssetProgressPhase,
  ) => void;
}

function buildExtractSystemPrompt(maxEnvironmentAssets?: number): string {
  const environmentRule =
    maxEnvironmentAssets === 1
      ? `- environment: exactly ONE production design reference frame for the film's overall visual world (lighting, palette, atmosphere, set dressing). Synthesize multiple script locations into this single reference when needed.`
      : `- environment: key locations/sets that need a production design keyframe`;

  const environmentCountRule =
    maxEnvironmentAssets === 1
      ? "- Include exactly one environment asset."
      : "- Include every distinct key location as an environment asset.";

  return `You are a production design supervisor for film pre-production.
Read the full visual beat sheet (or script) and identify every visual design asset required before storyboarding.

Input format:
- The source may be a visual beat sheet with STYLE, Beat N (SHOT, Xs), ACTION, DIALOGUE, and TONE lines.
- Extract recurring characters and environments from beat descriptions and dialogue, not from metadata lines.

Asset types:
- character: recurring named characters needing a four-column turnaround reference sheet (front, left profile, right profile, back — full-body row plus matching face close-ups in a separate row below)
${environmentRule}

Rules:
- Return ONLY valid JSON.
- Include every recurring character.
${environmentCountRule}
- For environment assets: describe only architecture, props, lighting, palette, and atmosphere. Never mention people, crowds, or character names in the environment description.
- Prefer 3-12 assets total; merge minor one-off extras into the environment card when appropriate.
- Titles must be production-friendly (e.g. "Maya Chen — Character Sheet", "Rooftop Alley — Night").
- description explains what must stay visually consistent across the film.
- scriptReferences cites beat numbers or story beats where the asset appears (e.g. "Beat 1-3", "Beat 5 dialogue").
- Ignore STYLE, TONE, title lines, scene labels, transitions, and other non-visual metadata.
- Do NOT write image prompts in this step.`;
}

const stringOrStringArraySchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    Array.isArray(value)
      ? value.map((entry) => entry.trim()).filter((entry) => entry.length > 0).join("; ")
      : value.trim(),
  );

const extractedAssetGenerationSchema = z.object({
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  description: z.string(),
  scriptReferences: z.union([z.string(), z.array(z.string())]),
});

const extractPlanGenerationSchema = z.object({
  assets: z.array(extractedAssetGenerationSchema).min(1),
});

const extractedAssetSchema = z.object({
  title: z.string(),
  kind: z.enum(["character", "environment"]),
  description: z.string(),
  scriptReferences: stringOrStringArraySchema,
});

const extractPlanSchema = z.object({
  assets: z.array(extractedAssetSchema).min(1),
});

const ENVIRONMENT_PROMPT_SYSTEM = `You are an expert production designer writing image-generation prompts for EMPTY environment reference frames.
Write one detailed, self-contained prompt for an uninhabited location/set.

Rules:
- Output ONLY the prompt text. No markdown, no JSON, no preamble.
- Describe ONLY the location: architecture, props, furniture, set dressing, materials, lighting, color palette, atmosphere, and time of day.
- The image must be completely empty of people — no characters, no crowds, no silhouettes, no faces, no hands, no figures of any kind.
- Do not name or describe cast members. Characters will be composited in later; this is a set reference only.
- Establishing frame with depth, scale, and clear production-design detail — expressed through the STYLE BRIEF's rendering language, not live-action cinematography defaults.
- The STYLE BRIEF is mandatory art direction and the required rendering language. Lead with it, then describe the location in vocabulary that reinforces that look.
- When the STYLE BRIEF calls for anime, illustration, cel-shading, painterly, comic, or other non-photoreal looks: write the scene as stylized background art (crisp linework, cel or flat shading, graphic color fields, painted lighting, vivid color separation). Describe materials as illustrated surfaces, not physically simulated ones.
- In those non-photoreal cases, do NOT use photoreal / CGI / sports-broadcast wording such as: ray-traced, DSLR, architectural visualization, video-game cinematic still, moisture sheen on individual grass blades, subsurface scattering, specular micro-detail, lens flare photography jargon, or "photorealistic" materials — unless the STYLE BRIEF explicitly asks for realism.
- Prefer composition, graphic clarity, and style-faithful lighting over physical material simulation.`;

const CHARACTER_DESCRIPTION_SYSTEM = `You are an expert character designer writing the visual description paragraph for a professional character reference sheet.
Write 2–4 sentences describing ONLY the character's appearance and wardrobe.

Rules:
- Output ONLY the description text. No markdown, no JSON, no preamble.
- Cover: identity, age impression, build, hair, face, skin, costume, materials, and wear/condition.
- Props and held items: mention ONLY signature identity-defining items permanently associated with this character (e.g. iconic weapon, trademark accessory, prosthetic). Omit incidental props, scene objects, furniture, and generic clutter.
- Mention plain/neutral background is desired, but do NOT describe layout, columns, panels, or camera angles.
- Ignore screenplay metadata and front-matter lines; describe only visually observable character details.
- The STYLE BRIEF is mandatory art direction. Keep the visual traits aligned to that style and avoid conflicting genre/era cues.`;

const CHARACTER_SHEET_CONSISTENCY_RULES = `CHARACTER CONSISTENCY (CRITICAL):
- Every panel depicts the exact same individual — identical face, hair, skin tone, body proportions, costume, colors, materials, and wear.
- Do not change hairstyle, outfit details, accessories, age, eye, eye color, or body type between panels.
CHARACTER ONLY:
- Show only the character on a plain neutral background. No environments, scenery, furniture, or scene props.
- Include a held or worn item ONLY when it is a signature identity-defining part of this character (e.g. iconic sword, trademark hat). Omit all other props, weapons, bags, and objects.`;

const CHARACTER_SHEET_LAYOUT = `Layout: a strict 2-row × 4-column grid on a plain background. Two clearly separated horizontal bands — do NOT blend, overlap, or mix content between rows.

ROW 1 (top band, exactly 75% of total image height):
- Four equal vertical columns (left → right): front, left profile, right profile, back.
- The body should appear proportional and realistic, with no exaggerated or distorted features unless it is the intended effect (e.g. a cartoon character).
- Each cell is ONE complete full-body turnaround only — head to toe, feet fully visible, no cropping at thighs or knees.
- Character centered in each column with consistent scale across all four views.
- No portraits, faces-only crops, or close-ups in this row.
- Full-body facing per column (left → right):
  Column 1: front view — character faces the camera, both eyes visible.
  Column 2: left profile — character's body turned 90° so the LEFT side faces the camera; nose points toward the LEFT edge of the panel; only the left ear, left cheek, and left side of the body visible.
  Column 3: right profile — character's body turned 90° the OPPOSITE way from column 2; the RIGHT side faces the camera; nose points toward the RIGHT edge of the panel; only the right ear, right cheek, and right side of the body visible. This pose must NOT match column 2.
  Column 4: back view — character faces away from the camera; back of head, hair, shoulders, and costume visible; no face.

A thin horizontal divider line separates the two rows. Nothing crosses this line.

ROW 2 (bottom band, exactly 25% of total image height):
- Four equal vertical columns aligned directly beneath row 1.
- Each cell is ONE face close-up only — neck or shoulders up, cropped tight on the head.
- No full body, no legs, no feet, no torso in this row.
- Head facing direction per column (left → right) — must match the body orientation of the column directly above:
  Column 1: face looking straight at the viewer (0° front view, both eyes visible, nose centered).
  Column 2: left profile — head turned 90° so the character looks toward the LEFT edge of the image; 
  Column 3: right profile — head turned 90° so the character looks toward the RIGHT edge of the image;
  Column 4: back of head — character facing away from the viewer.

Keep even column spacing, identical character design across all eight panels, and clean panel borders.`;

export function buildStyleArtDirectionDirective(
  styleBrief: string,
  options?: { subject?: "image" | "video" },
): string {
  const trimmed = styleBrief.trim();
  if (!trimmed) {
    return "";
  }
  const subject = options?.subject ?? "image";
  return `ART STYLE DIRECTION (MANDATORY): ${trimmed}. Treat this as the required visual language for the entire ${subject}. Render in this style only — do not switch to photorealism, live-action photography, CGI sports-game footage, architectural visualization, or a different era/genre unless the style brief explicitly asks for that look.`;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) {
      return inner;
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
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

function mapExtractedAssetsToBriefs(
  assets: z.infer<typeof extractPlanSchema>["assets"],
): DesignAssetBrief[] {
  return assets.slice(0, 12).map((asset) => ({
    title: asset.title.trim(),
    kind: asset.kind,
    description: asset.description.trim(),
    scriptReferences: asset.scriptReferences.trim(),
  }));
}

/**
 * Parses LLM text into validated design asset briefs.
 * Never throws raw JSON SyntaxError — always a clear Error.
 */
export function parseDesignAssetPlanFromText(rawText: string): DesignAssetBrief[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error(
      "Design asset extraction returned an empty response. The model produced no JSON.",
    );
  }

  const jsonObject = extractJsonObject(trimmed);
  if (!jsonObject.startsWith("{")) {
    throw new Error(
      "Design asset extraction returned no JSON object. The model response could not be parsed.",
    );
  }

  let parsed: unknown;
  try {
    parsed = parseLenientJsonObject(jsonObject);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(
      `Design asset extraction returned malformed JSON (${detail}).`,
    );
  }

  const result = extractPlanSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => issue.message)
      .slice(0, 3)
      .join("; ");
    throw new Error(
      `Design asset extraction JSON failed validation: ${issues}`,
    );
  }

  return mapExtractedAssetsToBriefs(result.data.assets);
}

async function repairDesignAssetJsonText(text: string): Promise<string | null> {
  try {
    const briefs = parseDesignAssetPlanFromText(text);
    return JSON.stringify({
      assets: briefs.map((asset) => ({
        title: asset.title,
        kind: asset.kind,
        description: asset.description,
        scriptReferences: asset.scriptReferences,
      })),
    });
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function aspectRatioForKind(_kind: DesignAsset["kind"]): string {
  // Character sheets use a wide four-column layout; environments are widescreen.
  return "16:9";
}

export function buildEnvironmentImagePrompt(input: {
  promptBody: string;
  styleBrief: string;
}): string {
  const trimmedStyle = input.styleBrief.trim();
  const styleDirection = buildStyleArtDirectionDirective(trimmedStyle);

  return [
    styleDirection,
    input.promptBody.trim(),
    "Empty uninhabited environment reference frame.",
    "No people, no characters, no figures, no silhouettes, no crowds anywhere in the image.",
    "RENDERING LOCK: Match the art style direction exactly across lighting, palette, materials, and rendering. Prefer illustrated / stylized production design over realism. Do not render as photoreal photography, CGI sports-game footage, architectural visualization, or live-action broadcast stills unless the style brief explicitly requests that look.",
    trimmedStyle
      ? `Final reminder — keep the entire image in this art style: ${trimmedStyle}.`
      : "",
  ]
    .filter((line) => line.length > 0)
    .join(" ");
}

export function buildCharacterSheetImagePrompt(input: {
  characterDescription: string;
  styleBrief: string;
}): string {
  const styleDirection = buildStyleArtDirectionDirective(input.styleBrief);

  return [
    `Create a professional character reference sheet. ${input.characterDescription.trim()} Plain background.`,
    styleDirection,
    "Preserve the exact same art style treatment in all eight panels.",
    "",
    CHARACTER_SHEET_CONSISTENCY_RULES,
    "",
    CHARACTER_SHEET_LAYOUT,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

async function generateCharacterDescriptionForSheet(input: {
  asset: DesignAssetBrief;
  styleBrief: string;
  allAssets: DesignAssetBrief[];
  settings: AppSettings;
  analysisModelId: string;
  signal?: AbortSignal;
}): Promise<string> {
  const openrouter = createOpenRouter({ apiKey: input.settings.openRouterApiKey });
  const otherAssets = input.allAssets
    .filter((item) => item.title !== input.asset.title)
    .map((item) => `- ${item.title} (${item.kind})`)
    .join("\n");

  const prompt = [
    `STYLE BRIEF:\n${input.styleBrief || "Cinematic, cohesive production design."}`,
    "",
    `CHARACTER: ${input.asset.title}`,
    `DESCRIPTION: ${input.asset.description}`,
    `SCRIPT REFERENCES: ${input.asset.scriptReferences}`,
    "",
    otherAssets ? `OTHER PROJECT ASSETS:\n${otherAssets}` : "",
    "",
    "Write the character visual description now.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  try {
    const { text, finishReason } = await generateText({
      model: openrouter.chat(input.analysisModelId),
      system: CHARACTER_DESCRIPTION_SYSTEM,
      prompt,
      temperature: 0.5,
      abortSignal: input.signal,
    });

    const description = text.trim();
    if (!description) {
      const finishDetail = finishReason ? ` Finish reason: ${finishReason}.` : "";
      const message = `Failed to generate character description for "${input.asset.title}" (model: ${input.analysisModelId}): model returned empty text.${finishDetail}`;
      console.error(message, { finishReason, responseLength: text.length });
      throw new Error(message);
    }
    return description;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    if (
      error instanceof Error &&
      error.message.includes("Failed to generate character description")
    ) {
      throw error;
    }

    const detail = formatProviderError(error, "Unknown provider error");
    const message = `Failed to generate character description for "${input.asset.title}" (model: ${input.analysisModelId}): ${detail}`;
    console.error(message, error);
    throw new Error(message);
  }
}

const DESIGN_ASSET_CONCURRENCY = 4;

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      await worker();
    }),
  );
  return results;
}

function limitEnvironmentAssets(
  assets: DesignAssetBrief[],
  maxEnvironments: number,
): DesignAssetBrief[] {
  let environmentCount = 0;
  return assets.filter((asset) => {
    if (asset.kind !== "environment") {
      return true;
    }
    environmentCount += 1;
    return environmentCount <= maxEnvironments;
  });
}

function consolidateEnvironmentAssetsToOne(
  assets: DesignAssetBrief[],
): DesignAssetBrief[] {
  const environments = assets.filter((asset) => asset.kind === "environment");
  if (environments.length <= 1) {
    return assets;
  }

  const nonEnvironments = assets.filter((asset) => asset.kind !== "environment");
  const mergedEnvironment: DesignAssetBrief = {
    title: environments[0].title,
    kind: "environment",
    description: environments
      .map((asset) => asset.description.trim())
      .filter((description) => description.length > 0)
      .join(" "),
    scriptReferences: environments
      .map((asset) => asset.scriptReferences.trim())
      .filter((reference) => reference.length > 0)
      .join("; "),
  };

  return [...nonEnvironments, mergedEnvironment];
}

async function extractDesignAssetsFromScript(input: {
  scriptContent: string;
  styleBrief: string;
  settings: AppSettings;
  analysisModelId: string;
  maxEnvironmentAssets?: number;
  signal?: AbortSignal;
}): Promise<DesignAssetBrief[]> {
  const openrouter = createOpenRouter({ apiKey: input.settings.openRouterApiKey });
  const model = openrouter.chat(input.analysisModelId, {
    plugins: [{ id: "response-healing" }],
  });
  const system = buildExtractSystemPrompt(input.maxEnvironmentAssets);
  const prompt = [
    `STYLE BRIEF:\n${input.styleBrief || "Infer visual style from beat sheet tone."}`,
    "",
    "VISUAL BEAT SHEET:",
    input.scriptContent,
    "",
    'Return JSON: { "assets": [{ "title", "kind", "description", "scriptReferences" }] }',
  ].join("\n");

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= DESIGN_ASSET_EXTRACT_MAX_ATTEMPTS; attempt += 1) {
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const { object } = await generateObject({
        model,
        schema: extractPlanGenerationSchema,
        schemaName: "DesignAssetPlan",
        schemaDescription:
          "Visual design assets (characters and environments) extracted from a script or beat sheet",
        system,
        prompt,
        temperature: 0.2,
        abortSignal: input.signal,
        experimental_repairText: async ({ text }) =>
          repairDesignAssetJsonText(text),
      });

      const parsed = extractPlanSchema.parse(object);
      return mapExtractedAssetsToBriefs(parsed.assets);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      // Some models reject structured-object mode; fall back to free-form JSON text.
      const shouldFallbackToText =
        NoObjectGeneratedError.isInstance(error) ||
        (error instanceof Error &&
          /structured|json schema|response_format|tool/i.test(error.message));

      if (shouldFallbackToText) {
        try {
          const { text } = await generateText({
            model,
            system,
            prompt,
            temperature: 0.2,
            abortSignal: input.signal,
          });
          return parseDesignAssetPlanFromText(text);
        } catch (fallbackError) {
          if (isAbortError(fallbackError)) {
            throw fallbackError;
          }
          lastError =
            fallbackError instanceof Error
              ? fallbackError
              : new Error(String(fallbackError));
        }
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw new Error(
    `Failed to extract design assets after ${DESIGN_ASSET_EXTRACT_MAX_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown error"
    }`,
  );
}

async function generateImagePromptForAsset(input: {
  asset: DesignAssetBrief;
  styleBrief: string;
  allAssets: DesignAssetBrief[];
  settings: AppSettings;
  analysisModelId: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (input.asset.kind === "character") {
    const characterDescription = await generateCharacterDescriptionForSheet(input);
    return buildCharacterSheetImagePrompt({
      characterDescription,
      styleBrief: input.styleBrief,
    });
  }

  const openrouter = createOpenRouter({ apiKey: input.settings.openRouterApiKey });
  const otherAssets = input.allAssets
    .filter((item) => item.title !== input.asset.title)
    .map((item) => `- ${item.title} (${item.kind})`)
    .join("\n");

  const { text } = await generateText({
    model: openrouter.chat(input.analysisModelId),
    system: ENVIRONMENT_PROMPT_SYSTEM,
    prompt: [
      `STYLE BRIEF:\n${input.styleBrief || "Cohesive stylized production design."}`,
      "",
      `ENVIRONMENT: ${input.asset.title}`,
      `DESCRIPTION: ${input.asset.description}`,
      `SCRIPT REFERENCES: ${input.asset.scriptReferences}`,
      "",
      otherAssets ? `OTHER PROJECT ASSETS (characters — do not include in this environment image):\n${otherAssets}` : "",
      "",
      "Write the empty environment image generation prompt now.",
      "Lead with style-faithful rendering cues from the STYLE BRIEF, then describe the location.",
      "Avoid photorealistic / CGI / sports-broadcast wording unless the STYLE BRIEF explicitly requests realism.",
    ]
      .filter((line) => line.length > 0)
      .join("\n"),
    temperature: 0.5,
    abortSignal: input.signal,
  });

  const promptBody = text.trim();
  if (!promptBody) {
    throw new Error(`Failed to generate image prompt for "${input.asset.title}"`);
  }
  return buildEnvironmentImagePrompt({
    promptBody,
    styleBrief: input.styleBrief,
  });
}

async function generateImageForAsset(
  input: {
    imageModelId: string;
    imageResolution: ImageGenerationSize;
    prompt: string;
    kind: DesignAsset["kind"];
    aspectRatio?: string;
    apiKey: string;
  },
  signal?: AbortSignal,
): Promise<{ mimeType: string; dataBase64: string }> {
  return generateOpenRouterImage({
    apiKey: input.apiKey,
    modelId: input.imageModelId,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio ?? aspectRatioForKind(input.kind),
    imageSize: input.imageResolution,
    signal,
    operation: "design image generation",
  });
}

function fallbackImageBase64(
  title: string,
  description: string,
): { mimeType: string; dataBase64: string } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="100%" height="100%" fill="#10131a"/><text x="50%" y="44%" dominant-baseline="middle" text-anchor="middle" fill="#f5f7ff" font-size="42" font-family="Arial">${title.replace(/&/g, "&amp;")}</text><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="24" font-family="Arial">${description.slice(0, 100).replace(/&/g, "&amp;")}</text></svg>`;
  return {
    mimeType: "image/svg+xml",
    dataBase64: btoa(unescape(encodeURIComponent(svg))),
  };
}

export function createPlaceholderDesignImage(
  title: string,
  description: string,
): { mimeType: string; dataBase64: string } {
  return fallbackImageBase64(title, description);
}

export function isFallbackDesignImage(image: {
  mimeType: string;
}): boolean {
  return image.mimeType === "image/svg+xml";
}

export interface GenerateCharacterSheetImageInput {
  characterPrompt: string;
  styleBrief?: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
  apiKey: string;
  signal?: AbortSignal;
}

export interface GenerateCharacterSheetImageResult {
  imagePrompt: string;
  image: { mimeType: string; dataBase64: string };
}

export async function generateCharacterSheetImage(
  input: GenerateCharacterSheetImageInput,
): Promise<GenerateCharacterSheetImageResult> {
  const imagePrompt = buildCharacterSheetImagePrompt({
    characterDescription: input.characterPrompt.trim(),
    styleBrief: input.styleBrief?.trim() ?? "",
  });

  const image = await generateImageForAsset(
    {
      imageModelId: input.imageModelId,
      imageResolution: input.imageResolution,
      prompt: imagePrompt,
      kind: "character",
      apiKey: input.apiKey,
    },
    input.signal,
  );

  return { imagePrompt, image };
}

export interface GenerateEnvironmentSheetImageInput {
  environmentPrompt: string;
  styleBrief?: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
  apiKey: string;
  signal?: AbortSignal;
}

export interface GenerateDesignImageInput {
  prompt: string;
  styleBrief?: string;
  imageModelId: string;
  imageResolution: ImageGenerationSize;
  aspectRatio: string;
  kind: DesignAsset["kind"];
  apiKey: string;
  signal?: AbortSignal;
}

export async function generateDesignImage(
  input: GenerateDesignImageInput,
): Promise<GenerateCharacterSheetImageResult> {
  const trimmedPrompt = input.prompt.trim();
  const styleBrief = input.styleBrief?.trim() ?? "";
  const styleDirection = buildStyleArtDirectionDirective(styleBrief);
  const imagePrompt = styleDirection
    ? `${styleDirection} ${trimmedPrompt}`
    : trimmedPrompt;

  const image = await generateImageForAsset(
    {
      imageModelId: input.imageModelId,
      imageResolution: input.imageResolution,
      prompt: imagePrompt,
      kind: input.kind,
      aspectRatio: input.aspectRatio,
      apiKey: input.apiKey,
    },
    input.signal,
  );

  return { imagePrompt, image };
}

export async function generateEnvironmentSheetImage(
  input: GenerateEnvironmentSheetImageInput,
): Promise<GenerateCharacterSheetImageResult> {
  const imagePrompt = buildEnvironmentImagePrompt({
    promptBody: input.environmentPrompt.trim(),
    styleBrief: input.styleBrief?.trim() ?? "",
  });

  const image = await generateImageForAsset(
    {
      imageModelId: input.imageModelId,
      imageResolution: input.imageResolution,
      prompt: imagePrompt,
      kind: "environment",
      apiKey: input.apiKey,
    },
    input.signal,
  );

  return { imagePrompt, image };
}

export async function generateDesignAssetsFromScript(
  input: GenerateDesignAssetsInput,
): Promise<GeneratedDesignAsset[]> {
  const maxEnvironmentAssets =
    input.maxEnvironmentAssets ?? AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS;
  const imageResolution = input.imageResolution ?? DEFAULT_IMAGE_GENERATION_SIZE;

  input.onStatus?.("analyzing");

  input.onStatus?.("extracting-assets");
  const extractedAssetBriefs = await extractDesignAssetsFromScript({
    scriptContent: input.scriptContent,
    styleBrief: input.styleBrief,
    settings: input.settings,
    analysisModelId: input.analysisModelId,
    maxEnvironmentAssets,
    signal: input.signal,
  });

  const assetBriefs = limitEnvironmentAssets(
    consolidateEnvironmentAssetsToOne(extractedAssetBriefs),
    maxEnvironmentAssets,
  );

  if (assetBriefs.length === 0) {
    throw new Error("No design assets were identified in the script");
  }

  input.onStatus?.("generating-assets");
  let assetsCompleted = 0;
  const generatedAssets = await mapWithConcurrency(
    assetBriefs,
    DESIGN_ASSET_CONCURRENCY,
    async (asset) => {
      input.onAssetProgress?.(
        assetsCompleted + 1,
        assetBriefs.length,
        asset.title,
        "prompt",
      );

      const imagePrompt = await generateImagePromptForAsset({
        asset,
        styleBrief: input.styleBrief,
        allAssets: assetBriefs,
        settings: input.settings,
        analysisModelId: input.analysisModelId,
        signal: input.signal,
      });

      input.onAssetProgress?.(
        assetsCompleted + 1,
        assetBriefs.length,
        asset.title,
        "image",
      );

      try {
        const image = await generateImageForAsset(
          {
            imageModelId: input.imageModelId,
            imageResolution,
            prompt: imagePrompt,
            kind: asset.kind,
            apiKey: input.settings.openRouterApiKey,
          },
          input.signal,
        );
        return {
          ...asset,
          imagePrompt,
          image,
          generationModelId: input.imageModelId,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Image generation failed";
        console.error(
          `Design image generation failed for "${asset.title}" (${input.imageModelId}):`,
          message,
        );
        if (input.throwOnImageError) {
          throw error instanceof Error
            ? error
            : new Error(message);
        }
        return {
          ...asset,
          imagePrompt,
          image: fallbackImageBase64(asset.title, `${asset.description} — ${message}`),
          generationModelId: input.imageModelId,
        };
      } finally {
        assetsCompleted += 1;
        input.onAssetProgress?.(
          assetsCompleted,
          assetBriefs.length,
          asset.title,
          "image",
        );
      }
    },
  );

  return generatedAssets;
}
