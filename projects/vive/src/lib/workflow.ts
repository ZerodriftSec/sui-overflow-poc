export type WorkspaceMode = "control" | "agent";

export type WorkflowRunStatus =
  | "idle"
  | "running"
  | "awaiting_review"
  | "paused"
  | "completed"
  | "failed";

export type WorkflowStageStatus =
  | "queued"
  | "working"
  | "preview"
  | "done"
  | "failed";

export type WorkflowStage =
  | "script"
  | "characters"
  | "environments"
  | "storyboard_plan"
  | "storyboard_sheets"
  | "video_clips";

export const WORKFLOW_STAGES: { id: WorkflowStage; label: string }[] = [
  { id: "script", label: "Script" },
  { id: "characters", label: "Characters" },
  { id: "environments", label: "Environments" },
  { id: "storyboard_plan", label: "Storyboard Plan" },
  { id: "storyboard_sheets", label: "Storyboard Sheets" },
  { id: "video_clips", label: "Video Clips" },
];

export interface WorkflowStageState {
  status: WorkflowStageStatus;
  assetIds: string[];
  error?: string;
  messageId?: string;
}

export interface WorkflowRun {
  id: string;
  brief: string;
  status: WorkflowRunStatus;
  currentStage: WorkflowStage;
  stages: Record<WorkflowStage, WorkflowStageState>;
  createdAt: string;
  updatedAt: string;
}

export type CheckpointPolicy = "hands_on" | "balanced" | "full_run";

export function createInitialWorkflowStages(): Record<
  WorkflowStage,
  WorkflowStageState
> {
  return {
    script: { status: "queued", assetIds: [] },
    characters: { status: "queued", assetIds: [] },
    environments: { status: "queued", assetIds: [] },
    storyboard_plan: { status: "queued", assetIds: [] },
    storyboard_sheets: { status: "queued", assetIds: [] },
    video_clips: { status: "queued", assetIds: [] },
  };
}

export function createWorkflowRun(brief: string): WorkflowRun {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    brief,
    status: "idle",
    currentStage: "script",
    stages: createInitialWorkflowStages(),
    createdAt: now,
    updatedAt: now,
  };
}

export function workflowStageToPhase(
  stage: WorkflowStage,
): "script" | "design" | "storyboard" | "film" | null {
  switch (stage) {
    case "script":
      return "script";
    case "characters":
    case "environments":
      return "design";
    case "storyboard_plan":
    case "storyboard_sheets":
      return "storyboard";
    case "video_clips":
      return "film";
    default:
      return null;
  }
}

export function isWorkflowStageVisible(
  state: WorkflowStageState,
): boolean {
  return state.status !== "queued";
}

export function workflowProgressPercent(
  stages: Record<WorkflowStage, WorkflowStageState>,
): number {
  const total = WORKFLOW_STAGES.length;
  const done = WORKFLOW_STAGES.filter(
    (stage) => stages[stage.id].status === "done",
  ).length;
  const working = WORKFLOW_STAGES.some(
    (stage) => stages[stage.id].status === "working",
  );
  return Math.round(((done + (working ? 0.5 : 0)) / total) * 100);
}

export {
  getWorkflowStepDefinition,
  WORKFLOW_STEP_DEFINITIONS,
  type WorkflowStepDefinition,
} from "./workflow-steps";
