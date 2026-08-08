import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useAgentWorkflow } from "../../../hooks/useAgentWorkflow";
import { useWalrusStorage } from "../../../hooks/useWalrusStorage";
import { cn } from "../../../lib/utils";
import type { WorkspaceMode } from "../../../lib/workflow";
import { WORKFLOW_STAGES, workflowProgressPercent } from "../../../lib/workflow";
import type { WorkflowStage } from "../../../lib/workflow";
import { AgentAssetGallery } from "./AgentAssetGallery";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { OnChainTransactionRetryBanner } from "../OnChainTransactionRetryBanner";

interface AgentModeOverlayProps {
  projectId: string;
  projectTitle: string;
  open: boolean;
  onClose: () => void;
  onModeChange: (mode: WorkspaceMode) => void;
}

export function AgentModeOverlay({
  projectId,
  projectTitle,
  open,
  onClose,
  onModeChange,
}: AgentModeOverlayProps) {
  const navigate = useNavigate();
  const walrusStorage = useWalrusStorage();
  const [visible, setVisible] = useState(false);
  const [showWorkflowLayout, setShowWorkflowLayout] = useState(false);
  const [isLaunchingLayout, setIsLaunchingLayout] = useState(false);
  const {
    run,
    messages,
    options,
    highlightedMessageId,
    highlightedStage,
    expandedStage,
    setMessages,
    sendUserMessage,
    updateOptions,
    resolveCheckpoint,
    resolveModelRecovery,
    selectMessage,
    toggleStage,
    pauseWorkflow,
    resumeWorkflow,
    stopWorkflow,
    resetWorkflow,
  } = useAgentWorkflow({ projectId });

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }
    setVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const hasWorkflowActivity =
      messages.length > 0 ||
      run.status === "running" ||
      run.status === "paused" ||
      run.status === "awaiting_review" ||
      run.status === "completed";
    setShowWorkflowLayout(hasWorkflowActivity);
  }, [open, messages.length, run.status]);

  useEffect(() => {
    if (showWorkflowLayout) {
      setIsLaunchingLayout(false);
    }
  }, [showWorkflowLayout]);

  if (!open) {
    return null;
  }

  const progress = workflowProgressPercent(run.stages);
  const isRunning = run.status === "running";
  const isPaused =
    run.status === "paused" || run.status === "awaiting_review";
  const isFinished =
    run.status === "completed" || run.status === "failed";

  function recoveryAbortModelId(messageId: string): string {
    const message = messages.find((entry) => entry.id === messageId);
    if (message?.type === "recovery" && message.kind === "video_model") {
      return options.videoModelId;
    }
    return options.imageModelId;
  }

  function handleClose(): void {
    if (run.status === "completed") {
      walrusStorage.refreshProjectAssets();
    }
    onClose();
  }

  function handleOpenInControl(_stage: WorkflowStage) {
    walrusStorage.refreshProjectAssets();
    onModeChange("control");
    onClose();
    navigate(`/app/projects/${projectId}`);
  }

  function handleInitialSubmit(): void {
    if (showWorkflowLayout || isLaunchingLayout) return;
    setIsLaunchingLayout(true);
    window.setTimeout(() => {
      setShowWorkflowLayout(true);
    }, 420);
  }

  function handleReset(): void {
    resetWorkflow();
    setShowWorkflowLayout(false);
    setIsLaunchingLayout(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="Close agent mode"
        onClick={handleClose}
        className={cn(
          "absolute inset-0 bg-bg-app/70 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cn(
          "relative mt-auto flex h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-border-subtle bg-bg-app shadow-2xl transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {showWorkflowLayout ? (
          <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-panel px-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold">
                  {projectTitle}
                </span>
                <span className="rounded bg-resolve-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-resolve-accent">
                  Agent
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-raised">
                  <div
                    className="h-full rounded-full bg-resolve-accent transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] text-text-secondary">
                  {progress}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isRunning && (
                <button
                  type="button"
                  onClick={stopWorkflow}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive-foreground hover:border-destructive"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </button>
              )}
              {isRunning && (
                <button
                  type="button"
                  onClick={pauseWorkflow}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:border-border-focus"
                >
                  <Pause className="h-3 w-3" />
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  type="button"
                  onClick={() => void resumeWorkflow()}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:border-border-focus"
                >
                  <Play className="h-3 w-3" />
                  Resume
                </button>
              )}
              {isFinished && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 rounded-md border border-resolve-accent/40 bg-resolve-accent/10 px-2 py-1 text-[11px] font-medium text-resolve-accent hover:border-resolve-accent"
                >
                  <RotateCcw className="h-3 w-3" />
                  New run
                </button>
              )}
              {isRunning && (
                <Loader2 className="h-4 w-4 animate-spin text-resolve-accent" />
              )}
              <button
                type="button"
                onClick={handleClose}
                aria-label="Switch to control mode"
                className="rounded-md p-1.5 text-text-secondary hover:bg-bg-raised hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
        ) : (
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close agent mode"
              className="rounded-md border border-border-subtle bg-bg-panel p-1.5 text-text-secondary hover:bg-bg-raised hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {showWorkflowLayout ? (
          <>
            <OnChainTransactionRetryBanner projectId={projectId} />
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
              <AgentConversationPanel
                messages={messages}
                runStatus={run.status}
                options={options}
                highlightedMessageId={highlightedMessageId}
                onSendMessage={(content) => void sendUserMessage(content)}
                onOptionsChange={updateOptions}
                onCheckpointAction={resolveCheckpoint}
                onRecoveryContinue={(messageId, modelId) =>
                  resolveModelRecovery(messageId, {
                    action: "continue",
                    modelId,
                  })
                }
                onRecoveryAbort={(messageId) =>
                  resolveModelRecovery(messageId, {
                    action: "abort",
                    modelId: recoveryAbortModelId(messageId),
                  })
                }
                onMessageSelect={selectMessage}
                onMessagesChange={setMessages}
                onSubmit={handleInitialSubmit}
                disabled={false}
              />

              <aside className="flex min-h-0 flex-col border-l border-border-subtle bg-bg-viewer">
                <div className="flex h-9 shrink-0 items-center border-b border-border-subtle bg-bg-panel px-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                    Output
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3">
                  <div className="animate-in fade-in space-y-2 duration-500">
                    <AgentAssetGallery
                      projectId={projectId}
                      run={run}
                      expandedStage={expandedStage}
                      highlightedStage={highlightedStage}
                      onToggleStage={toggleStage}
                      onOpenInControl={handleOpenInControl}
                    />
                  </div>
                </div>
              </aside>
            </div>

            <footer className="flex h-8 shrink-0 items-center justify-center gap-3 border-t border-border-subtle bg-bg-panel px-3 text-[10px] text-text-secondary">
              {WORKFLOW_STAGES.map((stage) => {
                const state = run.stages[stage.id];
                return (
                  <span key={stage.id} className="inline-flex items-center gap-1">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        state.status === "done" && "bg-status-approved",
                        state.status === "working" && "bg-resolve-accent animate-pulse",
                        state.status === "failed" && "bg-destructive-foreground",
                        state.status === "queued" && "bg-text-disabled",
                        state.status === "preview" && "bg-resolve-accent",
                      )}
                    />
                    {stage.label}
                  </span>
                );
              })}
            </footer>
          </>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className={cn(
                "absolute flex transition-all duration-500 ease-out",
                isLaunchingLayout
                  ? "left-0 top-0 h-full w-full lg:w-1/2"
                  : "left-1/2 top-1/2 w-[min(92vw,56rem)] -translate-x-1/2 -translate-y-1/2",
              )}
            >
              <AgentConversationPanel
                messages={messages}
                runStatus={run.status}
                options={options}
                highlightedMessageId={highlightedMessageId}
                onSendMessage={(content) => void sendUserMessage(content)}
                onOptionsChange={updateOptions}
                onCheckpointAction={resolveCheckpoint}
                onRecoveryContinue={(messageId, modelId) =>
                  resolveModelRecovery(messageId, {
                    action: "continue",
                    modelId,
                  })
                }
                onRecoveryAbort={(messageId) =>
                  resolveModelRecovery(messageId, {
                    action: "abort",
                    modelId: recoveryAbortModelId(messageId),
                  })
                }
                onMessageSelect={selectMessage}
                onMessagesChange={setMessages}
                showHeader={false}
                showMessages={false}
                composerOnly
                onSubmit={handleInitialSubmit}
                disabled={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
