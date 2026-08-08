import { generateFilmVideo } from "./film-llm";
import { extractVideoFrame } from "./extract-video-frame";
import {
  base64ToBytes,
  buildFilmInputReferences,
  designAssetsToReferenceImages,
  finalizeStoryboardToVideoPrompt,
} from "./film-generation-context";
import {
  approveScriptForDesign,
  getProject,
  saveProject,
  type Project,
  type StoryboardDocument,
} from "./project";
import type { AppSettings } from "./settings";
import {
  flushDeferredWalrusWrites,
  hasDeferredWalrusWrites,
  isOnChainFlushError,
  type WalrusStorageContext,
} from "./storage/walrus-storage";
import { getAgentModeMaxClipDurationSec, clampVideoDurationSecForModel } from "./openrouter-models";
import {
  resolveWorkflowStyleBrief,
  resolveWorkflowTextModelId,
  type WorkflowOptions,
} from "./workflow-options";
import type { Phase } from "../components/workspace/types";
import {
  saveDesignAssetsBatch,
  saveFilmAsset,
  saveScriptAsset,
  saveStoryboardAsset,
  type DesignDocument,
  type FilmDocument,
  type WalrusNetwork,
} from "./workspace";
import {
  createCheckpointMessage,
  createErrorMessage,
  createImageModelRecoveryMessage,
  createStatusMessage,
  createThinkingMessage,
  createVideoModelRecoveryMessage,
  type AgentMessage,
} from "./workflow-messages";
import { generateDesignAssetsFromScript, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS } from "./design-llm";
import {
  getOpenRouterModelLabel,
  OPENROUTER_IMAGE_MODELS,
  OPENROUTER_VIDEO_MODELS,
} from "./openrouter-models";
import {
  MAX_SHOTS_PER_STORYBOARD_SHEET,
  resolveAgentSegmentPlan,
  trimStoryboardCardsToDuration,
} from "./workflow-options";
import {
  runScriptAgents,
  runStoryboardSheetAgent,
  runStoryboardPlanAgent,
  runVideoClipAgent,
  type StoryboardSheet,
  type VideoClipResult,
} from "./workflow-agents";
import { withPrompt } from "./control-mode-storyboard";
import type { GeneratedDesignAsset } from "./design-llm";
import type { StoryboardCard } from "./project";
import {
  createWorkflowRun,
  type CheckpointPolicy,
  type WorkflowRun,
  type WorkflowStage,
  type WorkflowStageState,
  type WorkflowStageStatus,
} from "./workflow";

export interface ModelRecoveryResolution {
  action: "continue" | "abort";
  modelId: string;
}

/** @deprecated Use {@link ModelRecoveryResolution}. */
export type ImageModelRecoveryResolution = ModelRecoveryResolution;

export interface WorkflowOrchestratorConfig {
  projectId: string;
  brief: string;
  settings: AppSettings;
  network?: WalrusNetwork;
  workflowOptions: WorkflowOptions;
  getStorageContext: () => Promise<WalrusStorageContext>;
  onRunUpdate: (run: WorkflowRun) => void;
  onMessage: (message: AgentMessage) => void;
  onCheckpoint: (
    stage: WorkflowStage,
    messageId: string,
  ) => Promise<"continue" | "pause" | "review">;
  onModelRecovery: (
    stage: WorkflowStage,
    messageId: string,
  ) => Promise<ModelRecoveryResolution>;
  onWorkflowCompleted?: () => void;
  onWorkflowOptionsChange?: (patch: Partial<WorkflowOptions>) => void;
}

interface WorkflowContext {
  scriptId: string | null;
  scriptContent: string;
  designAssets: GeneratedDesignAsset[];
  persistedDesignAssetIds: Map<string, string>;
  characterAssetIds: string[];
  environmentAssetIds: string[];
  storyboardId: string | null;
  storyboardCards: StoryboardCard[];
  storyboardSheets: StoryboardSheet[];
  clipResults: VideoClipResult[];
}

function checkpointStagesForPolicy(
  policy: CheckpointPolicy,
): Set<WorkflowStage> {
  switch (policy) {
    case "hands_on":
      return new Set([
        "script",
        "characters",
        "storyboard_plan",
        "storyboard_sheets",
        "video_clips",
      ]);
    case "balanced":
      return new Set(["storyboard_sheets", "video_clips"]);
    case "full_run":
      return new Set();
    default:
      return new Set(["storyboard_sheets", "video_clips"]);
  }
}

function unlockProjectPhase(project: Project, phase: Phase): Project {
  const phaseState = project.phases[phase];
  if (phaseState.status !== "locked") {
    return project;
  }
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    phases: {
      ...project.phases,
      [phase]: {
        ...phaseState,
        status: "active",
      },
    },
  };
}

export class WorkflowOrchestrator {
  private readonly config: WorkflowOrchestratorConfig;

  private run: WorkflowRun;

  private paused = false;

  private stopped = false;

  private abortController: AbortController | null = null;

  private storageContext: WalrusStorageContext | null = null;

  private context: WorkflowContext = {
    scriptId: null,
    scriptContent: "",
    designAssets: [],
    persistedDesignAssetIds: new Map(),
    characterAssetIds: [],
    environmentAssetIds: [],
    storyboardId: null,
    storyboardCards: [],
    storyboardSheets: [],
    clipResults: [],
  };

  constructor(config: WorkflowOrchestratorConfig) {
    this.config = config;
    this.run = createWorkflowRun(config.brief);
  }

  getRun(): WorkflowRun {
    return this.run;
  }

  async start(): Promise<void> {
    if (this.run.status === "running") return;

    this.abortController = new AbortController();
    this.paused = false;
    this.stopped = false;
    this.updateRun({
      status: "running",
      currentStage: "script",
    });

    this.config.onMessage(
      createStatusMessage(
        "Orchestrator",
        "Starting agentic production pipeline…",
      ),
    );

    try {
      await this.executeStage("script");
      await this.executeStage("characters");
      await this.executeStage("environments");
      await this.executeStage("storyboard_plan");
      await this.executeStage("storyboard_sheets");
      await this.executeStage("video_clips");

      await this.flushDeferredStorageWrites();

      this.updateRun({ status: "completed", currentStage: "video_clips" });
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "Pipeline complete. Switch to Control mode to review assets in each phase.",
        ),
      );
      this.config.onWorkflowCompleted?.();
    } catch (error) {
      // Pause/stop/fail must still finalize deferred path-index writes so Control
      // mode can load assets that were already uploaded to Walrus.
      await this.flushDeferredStorageWritesBestEffort();

      if (this.isWorkflowCancellation(error)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Workflow failed unexpectedly";
      console.error("Workflow failed:", error);
      this.updateRun({ status: "failed" });
      this.config.onMessage(
        createErrorMessage(this.run.currentStage, message),
      );
    }
  }

  pause(): void {
    this.paused = true;
    this.abortController?.abort();
    this.updateRun({ status: "paused" });
    this.config.onMessage(
      createStatusMessage("Orchestrator", "Workflow paused by user."),
    );
  }

  stop(): void {
    this.stopped = true;
    this.paused = true;
    this.abortController?.abort();
    this.updateRun({ status: "failed" });
    this.config.onMessage(
      createStatusMessage("Orchestrator", "Workflow stopped by user."),
    );
  }

  /** Finalize deferred Walrus path-index writes (e.g. after pause/stop from UI). */
  async finalizePendingStorage(): Promise<void> {
    await this.flushDeferredStorageWritesBestEffort();
  }

  private isWorkflowCancellation(error: unknown): boolean {
    if (error instanceof Error && error.message === "WORKFLOW_PAUSED") {
      return true;
    }
    if (error instanceof Error && error.message === "WORKFLOW_STOPPED") {
      return true;
    }
    if (this.paused || this.stopped) {
      return error instanceof Error && error.name === "AbortError";
    }
    return false;
  }

  private throwIfWorkflowCancelled(): never {
    if (this.stopped) {
      throw new Error("WORKFLOW_STOPPED");
    }
    throw new Error("WORKFLOW_PAUSED");
  }

  async resume(): Promise<void> {
    if (this.run.status !== "paused" && this.run.status !== "awaiting_review") {
      return;
    }
    this.paused = false;
    this.stopped = false;
    this.abortController = new AbortController();
    this.updateRun({ status: "running" });
    await this.startFromCurrentStage();
  }

  applyWorkflowOptionsPatch(patch: Partial<WorkflowOptions>): void {
    this.config.workflowOptions = {
      ...this.config.workflowOptions,
      ...patch,
    };
    this.config.onWorkflowOptionsChange?.(patch);
  }

  private isImageModelRecoveryStage(stage: WorkflowStage): boolean {
    return (
      stage === "characters" ||
      stage === "environments" ||
      stage === "storyboard_sheets"
    );
  }

  private isVideoModelRecoveryStage(stage: WorkflowStage): boolean {
    return stage === "video_clips";
  }

  private isRecoverableImageProviderError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /openrouter|image generation|provider returned error|failed to generate.*image|sheet generation failed/i.test(
      message,
    );
  }

  private isRecoverableVideoProviderError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /video generation failed|copyright|seedance|kling|veo|grok-imagine-video|openrouter|provider returned error/i.test(
      message,
    );
  }

  private pickAlternateImageModel(failedModelId: string): string {
    const alternate = OPENROUTER_IMAGE_MODELS.find(
      (model) => model.id !== failedModelId,
    );
    return alternate?.id ?? failedModelId;
  }

  private pickAlternateVideoModel(failedModelId: string): string {
    const alternate = OPENROUTER_VIDEO_MODELS.find(
      (model) => model.id !== failedModelId,
    );
    return alternate?.id ?? failedModelId;
  }

  private clearDesignGenerationCache(): void {
    this.context.designAssets = [];
    this.context.persistedDesignAssetIds = new Map();
    this.context.characterAssetIds = [];
    this.context.environmentAssetIds = [];
  }

  private async awaitImageModelRecovery(
    stage: WorkflowStage,
    errorMessage: string,
  ): Promise<ModelRecoveryResolution> {
    const failedModelId = this.config.workflowOptions.imageModelId;
    const selectedModelId = this.pickAlternateImageModel(failedModelId);
    const recovery = createImageModelRecoveryMessage({
      stage,
      error: errorMessage,
      failedModelId,
      selectedModelId,
    });

    this.setStageState(stage, {
      status: "failed",
      assetIds: this.run.stages[stage].assetIds,
      error: errorMessage,
    });
    this.config.onMessage(recovery);
    this.updateRun({ status: "awaiting_review", currentStage: stage });

    const resolution = await this.config.onModelRecovery(stage, recovery.id);

    if (resolution.action === "abort") {
      this.paused = true;
      this.updateRun({ status: "paused" });
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "Workflow paused after image provider error. Resume when ready.",
          stage,
        ),
      );
      throw new Error("WORKFLOW_PAUSED");
    }

    this.applyWorkflowOptionsPatch({ imageModelId: resolution.modelId });
    this.abortController = new AbortController();
    this.paused = false;
    this.stopped = false;
    this.updateRun({ status: "running", currentStage: stage });
    this.config.onMessage(
      createStatusMessage(
        "Orchestrator",
        `Retrying with ${getOpenRouterModelLabel(resolution.modelId)}…`,
        stage,
      ),
    );

    return resolution;
  }

  private async awaitVideoModelRecovery(
    stage: WorkflowStage,
    errorMessage: string,
  ): Promise<ModelRecoveryResolution> {
    const failedModelId = this.config.workflowOptions.videoModelId;
    const selectedModelId = this.pickAlternateVideoModel(failedModelId);
    const recovery = createVideoModelRecoveryMessage({
      stage,
      error: errorMessage,
      failedModelId,
      selectedModelId,
    });

    this.setStageState(stage, {
      status: "failed",
      assetIds: this.run.stages[stage].assetIds,
      error: errorMessage,
    });
    this.config.onMessage(recovery);
    this.updateRun({ status: "awaiting_review", currentStage: stage });

    const resolution = await this.config.onModelRecovery(stage, recovery.id);

    if (resolution.action === "abort") {
      this.paused = true;
      this.updateRun({ status: "paused" });
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "Workflow paused after video provider error. Resume when ready.",
          stage,
        ),
      );
      throw new Error("WORKFLOW_PAUSED");
    }

    this.applyWorkflowOptionsPatch({ videoModelId: resolution.modelId });
    this.abortController = new AbortController();
    this.paused = false;
    this.stopped = false;
    this.updateRun({ status: "running", currentStage: stage });
    this.config.onMessage(
      createStatusMessage(
        "Orchestrator",
        `Retrying with ${getOpenRouterModelLabel(resolution.modelId)}…`,
        stage,
      ),
    );

    return resolution;
  }

  async regenerateStage(stage: WorkflowStage): Promise<void> {
    this.abortController = new AbortController();
    this.paused = false;
    this.stopped = false;
    this.updateRun({
      status: "running",
      currentStage: stage,
      stages: {
        ...this.run.stages,
        [stage]: { status: "queued", assetIds: [] },
      },
    });
    try {
      await this.executeStage(stage);
      await this.flushDeferredStorageWrites();
      this.updateRun({ status: "completed", currentStage: stage });
      this.config.onWorkflowCompleted?.();
    } catch (error) {
      await this.flushDeferredStorageWritesBestEffort();
      if (this.isWorkflowCancellation(error)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Stage regeneration failed";
      console.error(`Workflow regenerate "${stage}" failed:`, error);
      this.updateRun({ status: "failed" });
      this.config.onMessage(createErrorMessage(stage, message));
    }
  }

  private async startFromCurrentStage(): Promise<void> {
    const stageOrder: WorkflowStage[] = [
      "script",
      "characters",
      "environments",
      "storyboard_plan",
      "storyboard_sheets",
      "video_clips",
    ];
    const startIndex = stageOrder.indexOf(this.run.currentStage);
    try {
      for (let index = startIndex; index < stageOrder.length; index += 1) {
        const stage = stageOrder[index];
        if (this.run.stages[stage].status === "done") {
          continue;
        }
        await this.executeStage(stage);
      }

      await this.flushDeferredStorageWrites();

      this.updateRun({ status: "completed", currentStage: "video_clips" });
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "Pipeline complete. Switch to Control mode to review assets in each phase.",
        ),
      );
      this.config.onWorkflowCompleted?.();
    } catch (error) {
      await this.flushDeferredStorageWritesBestEffort();

      if (this.isWorkflowCancellation(error)) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Workflow failed unexpectedly";
      console.error("Workflow failed:", error);
      this.updateRun({ status: "failed" });
      this.config.onMessage(
        createErrorMessage(this.run.currentStage, message),
      );
    }
  }

  private async executeStage(stage: WorkflowStage): Promise<void> {
    if (this.paused) return;

    this.updateRun({ currentStage: stage });
    this.setStageState(stage, { status: "working", assetIds: [] });

    try {
      switch (stage) {
        case "script":
          await this.runScriptStage();
          break;
        case "characters":
          await this.runCharactersStage();
          break;
        case "environments":
          await this.runEnvironmentsStage();
          break;
        case "storyboard_plan":
          await this.runStoryboardPlanStage();
          break;
        case "storyboard_sheets":
          await this.runStoryboardSheetsStage();
          break;
        case "video_clips":
          await this.runVideoClipsStage();
          break;
        default:
          break;
      }

      this.setStageState(stage, {
        status: "done",
        assetIds: this.run.stages[stage].assetIds,
      });

      await this.maybeCheckpoint(stage);
    } catch (error) {
      if (this.isWorkflowCancellation(error)) {
        this.throwIfWorkflowCancelled();
      }

      const message =
        error instanceof Error ? error.message : "Stage failed unexpectedly";
      console.error(`Workflow stage "${stage}" failed:`, error);

      if (
        this.isImageModelRecoveryStage(stage) &&
        this.isRecoverableImageProviderError(error)
      ) {
        await this.awaitImageModelRecovery(stage, message);
        if (stage === "characters" || stage === "environments") {
          this.clearDesignGenerationCache();
        }
        this.setStageState(stage, { status: "queued", assetIds: [] });
        // Retry this stage with the newly selected image model, then continue.
        await this.executeStage(stage);
        return;
      }

      if (
        this.isVideoModelRecoveryStage(stage) &&
        this.isRecoverableVideoProviderError(error)
      ) {
        await this.awaitVideoModelRecovery(stage, message);
        this.context.clipResults = [];
        this.setStageState(stage, { status: "queued", assetIds: [] });
        await this.executeStage(stage);
        return;
      }

      this.setStageState(stage, {
        status: "failed",
        assetIds: this.run.stages[stage].assetIds,
        error: message,
      });
      this.config.onMessage(createErrorMessage(stage, message));
      throw error;
    }
  }

  private async maybeCheckpoint(stage: WorkflowStage): Promise<void> {
    const policy = this.config.workflowOptions.checkpointPolicy;
    const checkpoints = checkpointStagesForPolicy(policy);
    if (!checkpoints.has(stage)) return;

    const checkpoint = createCheckpointMessage(
      stage,
      `Review ${stage.replace(/_/g, " ")} before continuing?`,
    );
    this.config.onMessage(checkpoint);
    this.updateRun({ status: "awaiting_review", currentStage: stage });

    const resolution = await this.config.onCheckpoint(stage, checkpoint.id);
    if (resolution === "pause" || resolution === "review") {
      this.paused = true;
      this.updateRun({ status: "paused" });
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          resolution === "review"
            ? "Paused for review. Continue when ready."
            : "Workflow paused.",
          stage,
        ),
      );
      throw new Error("WORKFLOW_PAUSED");
    }
  }

  private getProject(): Project {
    const project = getProject(this.config.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return project;
  }

  private persistProject(project: Project): void {
    saveProject(project);
  }

  private async ensureStorageContext(): Promise<WalrusStorageContext> {
    if (!this.storageContext) {
      this.storageContext = await this.config.getStorageContext();
    }
    return this.storageContext;
  }

  private async flushDeferredStorageWrites(): Promise<void> {
    const ctx = this.storageContext ?? (await this.config.getStorageContext());
    if (ctx.writeMode !== "deferred") {
      return;
    }

    if (!hasDeferredWalrusWrites(ctx)) {
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "No pending on-chain storage updates were found for this run.",
        ),
      );
      return;
    }

    this.config.onMessage(
      createStatusMessage(
        "Orchestrator",
        "Saving all results on-chain. Please sign one transaction to finalize storage.",
      ),
    );

    try {
      await flushDeferredWalrusWrites(ctx);
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          "On-chain storage finalized.",
        ),
      );
    } catch (error) {
      if (isOnChainFlushError(error)) {
        this.config.onMessage(
          createStatusMessage("Orchestrator", error.message),
        );
        return;
      }
      throw error;
    }
  }

  private async flushDeferredStorageWritesBestEffort(): Promise<void> {
    try {
      const ctx = this.storageContext;
      if (!ctx || ctx.writeMode !== "deferred" || !hasDeferredWalrusWrites(ctx)) {
        return;
      }
      await this.flushDeferredStorageWrites();
    } catch (error) {
      console.warn("Failed to finalize deferred Walrus writes:", error);
      this.config.onMessage(
        createStatusMessage(
          "Orchestrator",
          error instanceof Error && error.message.includes("Not enough SUI")
            ? error.message
            : "Could not finalize on-chain storage. Your files are on Walrus — use Retry transaction to complete the on-chain step.",
        ),
      );
    }
  }

  private syncProjectManifestBlobId(manifestBlobId: string): Project {
    const latest = this.getProject();
    if (latest.manifestBlobId === manifestBlobId) {
      return latest;
    }
    const updated: Project = {
      ...latest,
      manifestBlobId,
      updatedAt: new Date().toISOString(),
    };
    this.persistProject(updated);
    return updated;
  }

  private async runScriptStage(): Promise<void> {
    this.config.onMessage(
      createStatusMessage("Script Agent", "Drafting visual beat sheet from brief…", "script"),
    );

    const targetDurationSec =
      this.config.workflowOptions.agentModeTotalDurationSec;

    const result = await runScriptAgents(this.config.brief, this.config.settings, {
      modelId: resolveWorkflowTextModelId(this.config.workflowOptions),
      styleBrief: this.config.workflowOptions.styleBrief,
      signal: this.abortController?.signal,
      targetDurationSec,
      onThinking: (content) => {
        this.config.onMessage(
          createThinkingMessage("Script Agent", content, "script"),
        );
      },
    });

    this.context.scriptContent = result.content;

    if (!this.config.workflowOptions.styleBrief.trim()) {
      const inferredStyleBrief = resolveWorkflowStyleBrief(
        this.config.workflowOptions,
        result.content,
      );
      if (inferredStyleBrief !== this.config.workflowOptions.styleBrief) {
        this.config.workflowOptions = {
          ...this.config.workflowOptions,
          styleBrief: inferredStyleBrief,
        };
        this.config.onWorkflowOptionsChange?.({ styleBrief: inferredStyleBrief });
      }
    }

    const project = this.getProject();
    const ctx = await this.ensureStorageContext();
    const scriptId = crypto.randomUUID();
    const providedScriptTitle = this.config.workflowOptions.scriptTitle.trim();
    const scriptTitle = providedScriptTitle || result.title;
    const saved = await saveScriptAsset(
      ctx,
      project,
      {
        id: scriptId,
        title: scriptTitle,
        content: result.content,
        prompt: this.config.brief,
        generationModelId: resolveWorkflowTextModelId(this.config.workflowOptions),
      },
      { allowCacheFallback: true },
    );
    if (saved.manifestBlobId) {
      this.syncProjectManifestBlobId(saved.manifestBlobId);
    }
    if (saved.cachedLocally) {
      this.config.onMessage(
        createStatusMessage(
          "Script Agent",
          "Walrus upload failed. Script cached locally for retry.",
          "script",
        ),
      );
    }

    this.context.scriptId = scriptId;
    this.setStageState("script", {
      status: "preview",
      assetIds: [scriptId],
    });

    const approved = approveScriptForDesign(project.id, {
      scriptId,
      scriptTitle: saved.asset.title,
      version: saved.asset.currentVersion ?? 1,
      blobId: saved.asset.blobId ?? "",
    });
    if (approved) {
      this.persistProject({
        ...approved,
        manifestBlobId: saved.manifestBlobId,
      });
    }

    this.config.onMessage(
      createStatusMessage(
        "Script Agent",
        `Script ready with title "${saved.asset.title}".`,
        "script",
      ),
    );
  }

  private async ensureDesignAssets(): Promise<GeneratedDesignAsset[]> {
    if (this.context.designAssets.length > 0) {
      return this.context.designAssets;
    }

    this.config.onMessage(
      createStatusMessage(
        "Design Agent",
        "Analyzing script for visual design assets…",
        "characters",
      ),
    );

    const styleBrief = resolveWorkflowStyleBrief(
      this.config.workflowOptions,
      this.context.scriptContent,
    );

    const generated = await generateDesignAssetsFromScript({
      scriptContent: this.context.scriptContent,
      styleBrief,
      settings: this.config.settings,
      analysisModelId: resolveWorkflowTextModelId(this.config.workflowOptions),
      imageModelId: this.config.workflowOptions.imageModelId,
      imageResolution: this.config.workflowOptions.imageResolution,
      maxEnvironmentAssets: AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS,
      throwOnImageError: true,
      signal: this.abortController?.signal,
      onAssetProgress: (current, total, title, phase) => {
        const content =
          phase === "prompt"
            ? `Generating asset ${title} (${current}/${total}) — writing prompt`
            : `Generating asset ${title} (${current}/${total}) — rendering image`;
        this.config.onMessage(
          createStatusMessage("Design Agent", content, "characters"),
        );
      },
    });

    this.context.designAssets = generated;
    return generated;
  }

  private designAssetKey(generated: GeneratedDesignAsset): string {
    return `${generated.kind}::${generated.title}`;
  }

  private buildDesignDocumentFromGenerated(
    generated: GeneratedDesignAsset,
    source: Project["storyboardSource"],
    styleBrief: string,
    assetId: string,
  ): DesignDocument {
    return {
      sourceScriptId: source?.scriptId,
      sourceScriptVersion: source?.version,
      sourceScriptBlobId: source?.blobId,
      styleBrief,
      updatedAt: new Date().toISOString(),
      assets: [
        {
          id: assetId,
          title: generated.title,
          kind: generated.kind,
          description: generated.description,
          prompt: generated.imagePrompt,
          notes: "",
          generationModelId: generated.generationModelId ?? "",
          image: {
            mimeType: generated.image.mimeType,
            dataBase64: generated.image.dataBase64,
          },
        },
      ],
    };
  }

  private async persistGeneratedDesignAssets(
    generated: GeneratedDesignAsset[],
  ): Promise<void> {
    if (this.context.persistedDesignAssetIds.size > 0 || generated.length === 0) {
      return;
    }

    const project = this.getProject();
    const ctx = await this.ensureStorageContext();
    const source = project.storyboardSource;
    const styleBrief = resolveWorkflowStyleBrief(
      this.config.workflowOptions,
      this.context.scriptContent,
    );

    const inputs = generated.map((asset) => {
      const assetId = crypto.randomUUID();
      this.context.persistedDesignAssetIds.set(this.designAssetKey(asset), assetId);
      return {
        id: assetId,
        title: asset.title,
        kind: asset.kind,
        primaryFileType: "image" as const,
        document: this.buildDesignDocumentFromGenerated(
          asset,
          source,
          styleBrief,
          assetId,
        ),
      };
    });

    const saved = await saveDesignAssetsBatch(ctx, project, inputs, {
      allowCacheFallback: true,
    });
    this.syncProjectManifestBlobId(saved.manifestBlobId);

    if (saved.cachedLocally) {
      this.config.onMessage(
        createStatusMessage(
          "Design Agent",
          "Some design assets were cached locally for retry.",
          "characters",
        ),
      );
    }
  }

  private async runCharactersStage(): Promise<void> {
    if (!this.context.scriptContent) {
      throw new Error("Script is required before character generation");
    }

    this.config.onMessage(
      createStatusMessage(
        "Character Agent",
        "Generating character reference sheets…",
        "characters",
      ),
    );

    const allDesign = await this.ensureDesignAssets();
    await this.persistGeneratedDesignAssets(allDesign);
    const characters = allDesign.filter((asset) => asset.kind === "character");

    const assetIds = characters
      .map((generated) =>
        this.context.persistedDesignAssetIds.get(this.designAssetKey(generated)),
      )
      .filter((assetId): assetId is string => Boolean(assetId));

    this.context.characterAssetIds = assetIds;
    this.setStageState("characters", { status: "preview", assetIds });

    let updated = unlockProjectPhase(this.getProject(), "storyboard");
    updated = unlockProjectPhase(updated, "film");
    this.persistProject(updated);

    this.config.onMessage(
      createStatusMessage(
        "Character Agent",
        `Generated ${assetIds.length} character sheet${assetIds.length === 1 ? "" : "s"}.`,
        "characters",
      ),
    );
  }

  private async runEnvironmentsStage(): Promise<void> {
    if (!this.context.scriptContent) {
      throw new Error("Script is required before environment generation");
    }

    this.config.onMessage(
      createStatusMessage(
        "Environment Agent",
        "Generating environment boards…",
        "environments",
      ),
    );

    const allDesign = await this.ensureDesignAssets();
    await this.persistGeneratedDesignAssets(allDesign);
    const environments = allDesign
      .filter((asset) => asset.kind === "environment")
      .slice(0, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS);

    const assetIds = environments
      .map((generated) =>
        this.context.persistedDesignAssetIds.get(this.designAssetKey(generated)),
      )
      .filter((assetId): assetId is string => Boolean(assetId));

    this.context.environmentAssetIds = assetIds;
    this.setStageState("environments", { status: "preview", assetIds });

    this.config.onMessage(
      createStatusMessage(
        "Environment Agent",
        `Generated ${assetIds.length} environment board${assetIds.length === 1 ? "" : "s"}.`,
        "environments",
      ),
    );
  }

  private async runStoryboardPlanStage(): Promise<void> {
    if (!this.context.scriptContent) {
      throw new Error("Script is required before storyboard planning");
    }

    this.config.onMessage(
      createStatusMessage(
        "Storyboard Agent",
        "Splitting script into shots…",
        "storyboard_plan",
      ),
    );

    const targetDurationSec =
      this.config.workflowOptions.agentModeTotalDurationSec;

    const cards = await runStoryboardPlanAgent(
      this.context.scriptContent,
      this.config.settings,
      {
        modelId: resolveWorkflowTextModelId(this.config.workflowOptions),
        signal: this.abortController?.signal,
        targetDurationSec,
      },
    );

    this.context.storyboardCards = trimStoryboardCardsToDuration(
      cards,
      targetDurationSec,
    );
    const project = this.getProject();
    const ctx = await this.ensureStorageContext();
    const storyboardId = crypto.randomUUID();
    const source = project.storyboardSource;

    const document: StoryboardDocument = {
      sourceScriptId: source?.scriptId ?? "",
      sourceScriptVersion: source?.version,
      sourceScriptBlobId: source?.blobId,
      updatedAt: new Date().toISOString(),
      cards: this.context.storyboardCards,
    };

    const saved = await saveStoryboardAsset(
      ctx,
      project,
      {
        id: storyboardId,
        title: "Agent Storyboard",
        document,
        useProvidedTitle: true,
      },
      { allowCacheFallback: true },
    );
    this.syncProjectManifestBlobId(saved.manifestBlobId);
    if (saved.cachedLocally) {
      this.config.onMessage(
        createStatusMessage(
          "Storyboard Agent",
          "Walrus upload failed. Storyboard cached locally for retry.",
          "storyboard_plan",
        ),
      );
    }

    this.context.storyboardId = storyboardId;
    this.setStageState("storyboard_plan", {
      status: "preview",
      assetIds: [storyboardId],
    });

    const updated: Project = {
      ...project,
      activeStoryboardId: storyboardId,
      phases: {
        ...project.phases,
        storyboard: {
          ...project.phases.storyboard,
          status:
            project.phases.storyboard.status === "locked"
              ? "active"
              : project.phases.storyboard.status,
        },
      },
      updatedAt: new Date().toISOString(),
    };
    this.persistProject(updated);

    this.config.onMessage(
      createStatusMessage(
        "Storyboard Agent",
        `Planned ${this.context.storyboardCards.length} shots.`,
        "storyboard_plan",
      ),
    );
  }

  private async runStoryboardSheetsStage(): Promise<void> {
    if (this.context.storyboardCards.length === 0) {
      throw new Error("Storyboard plan is required before sheet generation");
    }

    const totalDuration = this.config.workflowOptions.agentModeTotalDurationSec;
    const maxClipDurationSec = getAgentModeMaxClipDurationSec(
      this.config.workflowOptions.videoModelId,
    );
    const segmentPlan = resolveAgentSegmentPlan({
      totalDurationSec: totalDuration,
      shotCount: this.context.storyboardCards.length,
      maxClipDurationSec,
    });
    const segmentDurations = segmentPlan.segmentDurations.map((durationSec) =>
      clampVideoDurationSecForModel(
        durationSec,
        this.config.workflowOptions.videoModelId,
        "reference-to-video",
      ),
    );

    this.config.onMessage(
      createStatusMessage(
        "Sheet Generator",
        `Grouping ${this.context.storyboardCards.length} planned shots into ${segmentPlan.segmentCount} sheet${segmentPlan.segmentCount === 1 ? "" : "s"} (max ${MAX_SHOTS_PER_STORYBOARD_SHEET} panels per sheet, ${totalDuration}s target)…`,
        "storyboard_sheets",
      ),
    );

    const allDesign = await this.ensureDesignAssets();
    const characterRefs = allDesign.filter((asset) => asset.kind === "character");
    const environmentRefs = allDesign
      .filter((asset) => asset.kind === "environment")
      .slice(0, AGENT_WORKFLOW_MAX_ENVIRONMENT_ASSETS);
    const styleBrief = resolveWorkflowStyleBrief(
      this.config.workflowOptions,
      this.context.scriptContent,
    );

    const sheets = await runStoryboardSheetAgent(
      this.context.storyboardCards.map(withPrompt),
      characterRefs,
      environmentRefs,
      this.config.settings,
      {
        imageModelId: this.config.workflowOptions.imageModelId,
        imageSize: this.config.workflowOptions.imageResolution,
        panelAspectRatio: this.config.workflowOptions.videoAspectRatio,
        signal: this.abortController?.signal,
        segmentDurations,
        maxClipDurationSec,
        styleBrief,
        throwOnError: true,
        onProgress: (current, total, title) => {
          this.config.onMessage(
            createStatusMessage(
              "Sheet Generator",
              `Rendering storyboard sheet ${current}/${total}: ${title}`,
              "storyboard_sheets",
            ),
          );
        },
      },
    );

    this.context.storyboardSheets = sheets;

    if (!this.context.storyboardId) {
      throw new Error("Storyboard plan asset is required before saving sheets");
    }

    const project = this.getProject();
    const ctx = await this.ensureStorageContext();
    const source = project.storyboardSource;

    const document: StoryboardDocument = {
      sourceScriptId: source?.scriptId ?? "",
      sourceScriptVersion: source?.version,
      sourceScriptBlobId: source?.blobId,
      updatedAt: new Date().toISOString(),
      cards: this.context.storyboardCards,
      sheets: sheets.map((sheet) => ({
        segmentId: sheet.segmentId,
        segmentIndex: sheet.segmentIndex,
        segmentTitle: sheet.segmentTitle,
        durationSec: sheet.durationSec,
        shotIds: sheet.shotIds,
        panelCount: sheet.panelCount,
        shotId: sheet.shotId,
        prompt: sheet.prompt,
        panelAspectRatio: sheet.panelAspectRatio,
        image: {
          mimeType: sheet.mimeType,
          dataBase64: sheet.dataBase64,
        },
      })),
    };

    const saved = await saveStoryboardAsset(
      ctx,
      project,
      {
        id: this.context.storyboardId,
        title: "Agent Storyboard",
        document,
        useProvidedTitle: true,
      },
      { allowCacheFallback: true },
    );
    this.syncProjectManifestBlobId(saved.manifestBlobId);
    if (saved.cachedLocally) {
      this.config.onMessage(
        createStatusMessage(
          "Sheet Generator",
          "Walrus upload failed. Storyboard sheets cached locally for retry.",
          "storyboard_sheets",
        ),
      );
    }

    this.setStageState("storyboard_sheets", {
      status: "preview",
      assetIds: sheets.map((sheet) => sheet.segmentId),
    });

    this.config.onMessage(
      createStatusMessage(
        "Sheet Generator",
        `Generated ${sheets.length} storyboard sheet${sheets.length === 1 ? "" : "s"} (${sheets.reduce((sum, sheet) => sum + sheet.panelCount, 0)} panels total).`,
        "storyboard_sheets",
      ),
    );
  }

  private async runVideoClipsStage(): Promise<void> {
    if (this.context.storyboardSheets.length === 0) {
      throw new Error("Storyboard sheets are required before video generation");
    }

    const maxClipDurationSec = getAgentModeMaxClipDurationSec(
      this.config.workflowOptions.videoModelId,
    );

    const clipCount = this.context.storyboardSheets.length;
    const plannedClipDurations = this.context.storyboardSheets.map((sheet) =>
      clampVideoDurationSecForModel(
        sheet.durationSec,
        this.config.workflowOptions.videoModelId,
        "reference-to-video",
      ),
    );
    const plannedTotalDuration = plannedClipDurations.reduce(
      (sum, durationSec) => sum + durationSec,
      0,
    );

    this.config.onMessage(
      createStatusMessage(
        "Video Agent",
        `Generating ${clipCount} video clip${clipCount === 1 ? "" : "s"} (${plannedTotalDuration}s target)…`,
        "video_clips",
      ),
    );

    const allDesign = await this.ensureDesignAssets();
    const { environmentReferenceImages } = designAssetsToReferenceImages(allDesign);

    if (environmentReferenceImages.length === 0) {
      this.config.onMessage(
        createStatusMessage(
          "Video Agent",
          "No environment references found. Proceeding with storyboard and available character references.",
          "video_clips",
        ),
      );
    }

    const ctx = await this.ensureStorageContext();
    let previousClipFirstFrame:
      | { mimeType: string; bytes: Uint8Array }
      | undefined;
    const styleBrief = resolveWorkflowStyleBrief(
      this.config.workflowOptions,
      this.context.scriptContent,
    );
    const clipResults = await runVideoClipAgent(
      this.context.storyboardSheets,
      this.context.storyboardCards,
      this.config.settings,
      {
        projectId: this.getProject().id,
        signal: this.abortController?.signal,
        maxClips: clipCount,
        clipDurations: plannedClipDurations,
        maxClipDurationSec,
        styleBrief,
        onProgress: (current, total, title) => {
          this.config.onMessage(
            createStatusMessage(
              "Video Agent",
              `Generating clip ${current}/${total}: ${title}`,
              "video_clips",
            ),
          );
        },
        onClipError: (title, error) => {
          this.config.onMessage(
            createStatusMessage(
              "Video Agent",
              `Clip "${title}" failed: ${error.message}`,
              "video_clips",
            ),
          );
        },
        generateClip: async ({
          segmentTitle,
          shotIds,
          prompt,
          sheetImage,
          durationSec,
        }) => {
          // Always re-read the project so each save uses the latest manifest blob id.
          // Reusing a stale Project from before the loop overwrites earlier clips.
          const project = this.getProject();
          const assetId = crypto.randomUUID();
          const inputReferences = buildFilmInputReferences({
            segmentTitle,
            sheetMimeType: sheetImage.mimeType,
            sheetBytes: base64ToBytes(sheetImage.dataBase64),
            designAssets: allDesign,
          });
          const clipDuration = durationSec;
          const clipPrompt = finalizeStoryboardToVideoPrompt({
            basePrompt: prompt,
            inputReferences,
            panelCount: sheetImage.panelCount,
          });
          const firstFrame = previousClipFirstFrame;

          const generated = await generateFilmVideo({
            prompt: clipPrompt,
            settings: this.config.settings,
            videoModelId: this.config.workflowOptions.videoModelId,
            inputReferences,
            firstFrame,
            duration: clipDuration,
            aspectRatio: this.config.workflowOptions.videoAspectRatio,
            resolution: this.config.workflowOptions.videoResolution,
            generateAudio: this.config.workflowOptions.videoGenerateAudio,
            signal: this.abortController?.signal,
            onStatus: (status) => {
              this.config.onMessage(
                createStatusMessage(
                  "Video Agent",
                  `Clip "${segmentTitle}" — ${status}`,
                  "video_clips",
                ),
              );
            },
          });

          try {
            previousClipFirstFrame = await extractVideoFrame({
              bytes: generated.bytes,
              mimeType: generated.mimeType,
              position: "last",
            });
          } catch (error) {
            previousClipFirstFrame = undefined;
            console.warn(
              `Could not extract last frame from clip "${segmentTitle}" for continuity:`,
              error,
            );
          }

          const document: FilmDocument = {
            sourceStoryboardId: this.context.storyboardId ?? undefined,
            sourceShotId: shotIds[0],
            prompt,
            generationModelId: this.config.workflowOptions.videoModelId,
            durationSec: clipDuration,
            status: "ready",
            updatedAt: new Date().toISOString(),
          };

          const saved = await saveFilmAsset(
            ctx,
            project,
            {
              id: assetId,
              title: segmentTitle,
              document,
              videoBytes: generated.bytes,
              videoMimeType: generated.mimeType,
            },
            { allowCacheFallback: true },
          );
          this.syncProjectManifestBlobId(saved.manifestBlobId);
          if (saved.cachedLocally) {
            this.config.onMessage(
              createStatusMessage(
                "Video Agent",
                `Upload failed for "${segmentTitle}". Clip cached locally for retry.`,
                "video_clips",
              ),
            );
          }

          return assetId;
        },
      },
    );

    this.context.clipResults = clipResults;
    this.setStageState("video_clips", {
      status: "preview",
      assetIds: clipResults.map((clip) => clip.assetId),
    });

    const updated = unlockProjectPhase(this.getProject(), "film");
    this.persistProject({
      ...updated,
      phases: {
        ...updated.phases,
        film: {
          ...updated.phases.film,
          status:
            updated.phases.film.status === "locked"
              ? "active"
              : updated.phases.film.status,
        },
      },
    });

    this.config.onMessage(
      createStatusMessage(
        "Video Agent",
        `Generated ${clipResults.length} video clip${clipResults.length === 1 ? "" : "s"}.`,
        "video_clips",
      ),
    );
  }

  private setStageState(
    stage: WorkflowStage,
    patch: Partial<WorkflowStageState> & { status: WorkflowStageStatus },
  ): void {
    const nextStages = {
      ...this.run.stages,
      [stage]: {
        ...this.run.stages[stage],
        ...patch,
        assetIds: patch.assetIds ?? this.run.stages[stage].assetIds,
      },
    };
    this.updateRun({ stages: nextStages });
  }

  private updateRun(patch: Partial<WorkflowRun>): void {
    this.run = {
      ...this.run,
      ...patch,
      stages: patch.stages ?? this.run.stages,
      updatedAt: new Date().toISOString(),
    };
    this.config.onRunUpdate(this.run);
  }
}
