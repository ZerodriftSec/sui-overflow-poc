import type { Phase } from "../components/workspace/types";
import type { WorkflowOptions } from "./workflow-options";
import type { WorkflowStage } from "./workflow";

export type WorkflowOutputKind =
  | "script_text"
  | "design_prompt"
  | "design_image"
  | "storyboard_cards"
  | "storyboard_sheet"
  | "film_clip";

export type WorkflowInputKind =
  | "none"
  | "script"
  | "design_assets"
  | "storyboard"
  | "storyboard_sheet"
  | "images";

export interface WorkflowStepParamsSchema {
  modelKeys?: Array<keyof WorkflowOptions>;
  durationKeys?: Array<"agentModeTotalDurationSec" | "videoDurationSec">;
}

export interface WorkflowStepCapabilityFlags {
  supportsChat: boolean;
  supportsRegenerate: boolean;
  requiresPrimaryContext: boolean;
  supportsScriptDrop: boolean;
  supportsImageAttachments: boolean;
  supportsVideoGeneration: boolean;
  checkpointEligible: boolean;
}

export interface WorkflowStepDefinition {
  id: WorkflowStage;
  label: string;
  shortLabel: string;
  storagePhase: Phase;
  outputKind: WorkflowOutputKind;
  requiredInputs: WorkflowInputKind[];
  paramsSchema: WorkflowStepParamsSchema;
  capabilities: WorkflowStepCapabilityFlags;
}

export const WORKFLOW_STEP_DEFINITIONS: WorkflowStepDefinition[] = [
  {
    id: "script",
    label: "Write Script",
    shortLabel: "Script",
    storagePhase: "script",
    outputKind: "script_text",
    requiredInputs: ["none"],
    paramsSchema: { modelKeys: ["scriptModelId"] },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: false,
      supportsImageAttachments: false,
      supportsVideoGeneration: false,
      checkpointEligible: true,
    },
  },
  {
    id: "characters",
    label: "Character Prompts",
    shortLabel: "Char Prompts",
    storagePhase: "design",
    outputKind: "design_prompt",
    requiredInputs: ["script"],
    paramsSchema: {
      modelKeys: ["imageModelId", "styleBrief"],
    },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: true,
      supportsImageAttachments: false,
      supportsVideoGeneration: false,
      checkpointEligible: true,
    },
  },
  {
    id: "environments",
    label: "Environment Prompts",
    shortLabel: "Env Prompts",
    storagePhase: "design",
    outputKind: "design_prompt",
    requiredInputs: ["script"],
    paramsSchema: {
      modelKeys: ["imageModelId", "styleBrief"],
    },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: true,
      supportsImageAttachments: false,
      supportsVideoGeneration: false,
      checkpointEligible: false,
    },
  },
  {
    id: "storyboard_plan",
    label: "Design Storyboard",
    shortLabel: "Storyboard",
    storagePhase: "storyboard",
    outputKind: "storyboard_cards",
    requiredInputs: ["script", "design_assets"],
    paramsSchema: {
      modelKeys: ["storyboardModelId", "styleBrief"],
      durationKeys: ["agentModeTotalDurationSec"],
    },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: false,
      supportsImageAttachments: false,
      supportsVideoGeneration: false,
      checkpointEligible: true,
    },
  },
  {
    id: "storyboard_sheets",
    label: "Storyboard Sheets",
    shortLabel: "Sheets",
    storagePhase: "storyboard",
    outputKind: "storyboard_sheet",
    requiredInputs: ["storyboard", "design_assets"],
    paramsSchema: {
      modelKeys: ["imageModelId", "imageResolution"],
    },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: false,
      supportsImageAttachments: false,
      supportsVideoGeneration: false,
      checkpointEligible: true,
    },
  },
  {
    id: "video_clips",
    label: "Video Generation",
    shortLabel: "Video",
    storagePhase: "film",
    outputKind: "film_clip",
    requiredInputs: ["storyboard_sheet"],
    paramsSchema: {
      modelKeys: ["videoModelId", "videoAspectRatio", "videoResolution"],
      durationKeys: ["videoDurationSec"],
    },
    capabilities: {
      supportsChat: true,
      supportsRegenerate: true,
      requiresPrimaryContext: false,
      supportsScriptDrop: false,
      supportsImageAttachments: true,
      supportsVideoGeneration: true,
      checkpointEligible: true,
    },
  },
];

const stepById = new Map(
  WORKFLOW_STEP_DEFINITIONS.map((step) => [step.id, step]),
);

export function getWorkflowStepDefinition(
  step: WorkflowStage,
): WorkflowStepDefinition {
  const definition = stepById.get(step);
  if (!definition) {
    throw new Error(`Unknown workflow step: ${step}`);
  }
  return definition;
}

export function getWorkflowStepIndex(step: WorkflowStage): number {
  return WORKFLOW_STEP_DEFINITIONS.findIndex((item) => item.id === step);
}

export function getAdjacentWorkflowStep(
  step: WorkflowStage,
  direction: "prev" | "next",
): WorkflowStage | null {
  const index = getWorkflowStepIndex(step);
  if (index < 0) return null;
  const nextIndex = direction === "prev" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= WORKFLOW_STEP_DEFINITIONS.length) {
    return null;
  }
  return WORKFLOW_STEP_DEFINITIONS[nextIndex]!.id;
}

export function getWorkflowStepsForStoragePhase(phase: Phase): WorkflowStepDefinition[] {
  return WORKFLOW_STEP_DEFINITIONS.filter((step) => step.storagePhase === phase);
}
