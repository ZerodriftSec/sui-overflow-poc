import { useCallback, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { isStorageConfigured } from "../lib/settings";
import { useSettings } from "../components/SettingsProvider";
import {
  DEFAULT_WORKFLOW_OPTIONS,
  type WorkflowOptions,
} from "../lib/workflow-options";
import {
  createStatusMessage,
  createUserMessage,
  resolveRecoveryMessage,
  type AgentMessage,
} from "../lib/workflow-messages";
import {
  createWorkflowRun,
  type WorkflowRun,
  type WorkflowStage,
} from "../lib/workflow";
import {
  createDeferredWalrusStorageContext,
  type WalrusStorageContext,
} from "../lib/storage/walrus-storage";
import {
  WorkflowOrchestrator,
  type ModelRecoveryResolution,
} from "../lib/workflow-orchestrator";
import { useWalrusStorage } from "./useWalrusStorage";

interface UseAgentWorkflowOptions {
  projectId: string;
  initialOptions?: Partial<WorkflowOptions>;
}

interface CheckpointResolver {
  resolve: (action: "continue" | "review" | "pause") => void;
}

interface RecoveryResolver {
  resolve: (resolution: ModelRecoveryResolution) => void;
}

function recoveryModelIdForMessage(
  message: AgentMessage | undefined,
  options: WorkflowOptions,
): string {
  if (message?.type === "recovery" && message.kind === "video_model") {
    return options.videoModelId;
  }
  return options.imageModelId;
}

export function useAgentWorkflow({
  projectId,
  initialOptions,
}: UseAgentWorkflowOptions) {
  const account = useCurrentAccount();
  const { settings } = useSettings();
  const walrusStorage = useWalrusStorage();
  const [run, setRun] = useState<WorkflowRun>(() => createWorkflowRun(""));
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [options, setOptions] = useState<WorkflowOptions>(() => ({
    ...DEFAULT_WORKFLOW_OPTIONS,
    ...initialOptions,
    checkpointPolicy: "full_run",
  }));
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const orchestratorRef = useRef<WorkflowOrchestrator | null>(null);
  const workflowStorageContextRef = useRef<WalrusStorageContext | null>(null);
  const checkpointResolversRef = useRef<Map<string, CheckpointResolver>>(new Map());
  const recoveryResolversRef = useRef<Map<string, RecoveryResolver>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const [highlightedStage, setHighlightedStage] = useState<WorkflowStage | null>(
    null,
  );
  const [expandedStage, setExpandedStage] = useState<WorkflowStage | null>(null);

  const getWorkflowStorageContext = useCallback(async () => {
    if (workflowStorageContextRef.current) {
      return workflowStorageContextRef.current;
    }

    const base = await walrusStorage.getStorageContext();
    const deferred = createDeferredWalrusStorageContext(base);
    workflowStorageContextRef.current = deferred;
    return deferred;
  }, [walrusStorage.getStorageContext]);

  const resetWorkflowStorageContext = useCallback(() => {
    workflowStorageContextRef.current = null;
  }, []);

  const appendMessage = useCallback((message: AgentMessage) => {
    setMessages((current) => [...current, message]);
    if (
      message.type === "status" ||
      message.type === "error" ||
      message.type === "recovery"
    ) {
      if (
        (message.type === "status" ||
          message.type === "error" ||
          message.type === "recovery") &&
        message.stage
      ) {
        setHighlightedStage(message.stage);
        setExpandedStage(message.stage);
      }
      setHighlightedMessageId(message.id);
    }
  }, []);

  const startWorkflow = useCallback(
    async (brief: string) => {
      if (!isStorageConfigured(settings, account?.address)) {
        appendMessage(
          createStatusMessage(
            "Orchestrator",
            "Connect your wallet and add your OpenRouter API key in settings before starting a workflow.",
          ),
        );
        return;
      }

      resetWorkflowStorageContext();

      const orchestrator = new WorkflowOrchestrator({
        projectId,
        brief,
        settings,
        workflowOptions: optionsRef.current,
        getStorageContext: getWorkflowStorageContext,
        onRunUpdate: setRun,
        onMessage: appendMessage,
        onCheckpoint: async (_stage, messageId) => {
          return new Promise<"continue" | "review" | "pause">((resolve) => {
            checkpointResolversRef.current.set(messageId, { resolve });
          });
        },
        onModelRecovery: async (_stage, messageId) => {
          return new Promise<ModelRecoveryResolution>((resolve) => {
            recoveryResolversRef.current.set(messageId, { resolve });
          });
        },
        onWorkflowCompleted: () => {
          walrusStorage.refreshProjectAssets();
        },
        onWorkflowOptionsChange: (patch) => {
          setOptions((current) => ({
            ...current,
            ...patch,
            checkpointPolicy: "full_run",
          }));
        },
      });

      orchestratorRef.current = orchestrator;
      setRun(orchestrator.getRun());
      try {
        await orchestrator.start();
      } finally {
        if (orchestrator.getRun().status === "completed") {
          resetWorkflowStorageContext();
        }
      }
    },
    [
      appendMessage,
      account?.address,
      getWorkflowStorageContext,
      projectId,
      resetWorkflowStorageContext,
      settings,
      walrusStorage.refreshProjectAssets,
    ],
  );

  const updateOptions = useCallback((patch: Partial<WorkflowOptions>) => {
    setOptions((current) => ({
      ...current,
      ...patch,
      checkpointPolicy: "full_run",
    }));
    orchestratorRef.current?.applyWorkflowOptionsPatch(patch);
  }, []);

  const sendUserMessage = useCallback(
    async (content: string) => {
      const userMessage = createUserMessage(content);
      appendMessage(userMessage);

      if (
        run.status === "idle" ||
        run.status === "completed" ||
        run.status === "failed"
      ) {
        const nextRun = createWorkflowRun(content);
        setRun(nextRun);
        await startWorkflow(content);
        return;
      }

      const lowered = content.toLowerCase();
      if (lowered.includes("pause")) {
        orchestratorRef.current?.pause();
        return;
      }
      if (lowered.includes("resume") || lowered.includes("continue")) {
        await orchestratorRef.current?.resume();
        return;
      }
      if (lowered.includes("regenerate character")) {
        await orchestratorRef.current?.regenerateStage("characters");
        return;
      }
      if (lowered.includes("regenerate storyboard")) {
        await orchestratorRef.current?.regenerateStage("storyboard_plan");
        return;
      }
      if (lowered.includes("skip environment")) {
        appendMessage(
          createStatusMessage(
            "Orchestrator",
            "Skipping environments is not yet supported in this build.",
          ),
        );
      }
    },
    [appendMessage, run.status, startWorkflow],
  );

  const resolveCheckpoint = useCallback(
    (messageId: string, action: "continue" | "review" | "pause") => {
      const resolver = checkpointResolversRef.current.get(messageId);
      if (!resolver) return;
      resolver.resolve(action);
      checkpointResolversRef.current.delete(messageId);
      if (action === "review") {
        const message = messages.find((entry) => entry.id === messageId);
        if (message?.type === "checkpoint") {
          setHighlightedStage(message.stage);
          setExpandedStage(message.stage);
        }
      }
    },
    [messages],
  );

  const resolveModelRecovery = useCallback(
    (messageId: string, resolution: ModelRecoveryResolution) => {
      const resolver = recoveryResolversRef.current.get(messageId);
      if (!resolver) return;
      resolver.resolve(resolution);
      recoveryResolversRef.current.delete(messageId);
      if (resolution.action !== "continue") {
        return;
      }
      const message = messages.find((entry) => entry.id === messageId);
      setOptions((current) => {
        if (message?.type === "recovery" && message.kind === "video_model") {
          return {
            ...current,
            videoModelId: resolution.modelId,
            checkpointPolicy: "full_run",
          };
        }
        return {
          ...current,
          imageModelId: resolution.modelId,
          checkpointPolicy: "full_run",
        };
      });
    },
    [messages],
  );

  const selectMessage = useCallback((message: AgentMessage) => {
    setHighlightedMessageId(message.id);
    if (
      (message.type === "status" ||
        message.type === "thinking" ||
        message.type === "error" ||
        message.type === "recovery") &&
      message.stage
    ) {
      setHighlightedStage(message.stage);
      setExpandedStage(message.stage);
    }
    if (message.type === "checkpoint") {
      setHighlightedStage(message.stage);
      setExpandedStage(message.stage);
    }
  }, []);

  const toggleStage = useCallback(
    (stage: WorkflowStage) => {
      setExpandedStage((current) => (current === stage ? null : stage));
      setHighlightedStage(stage);
      const relatedMessage = [...messages]
        .reverse()
        .find(
          (message) =>
            (message.type === "status" ||
              message.type === "thinking" ||
              message.type === "error" ||
              message.type === "recovery" ||
              message.type === "checkpoint") &&
            ("stage" in message ? message.stage === stage : false),
        );
      if (relatedMessage) {
        setHighlightedMessageId(relatedMessage.id);
      }
    },
    [messages],
  );

  const pauseWorkflow = useCallback(() => {
    if (recoveryResolversRef.current.size > 0) {
      for (const [messageId, resolver] of recoveryResolversRef.current) {
        const message = messages.find((entry) => entry.id === messageId);
        resolver.resolve({
          action: "abort",
          modelId: recoveryModelIdForMessage(message, optionsRef.current),
        });
        recoveryResolversRef.current.delete(messageId);
      }
      setMessages((current) =>
        current.map((message) =>
          message.type === "recovery" && !message.resolved
            ? resolveRecoveryMessage(message, "abort")
            : message,
        ),
      );
      void orchestratorRef.current?.finalizePendingStorage();
      return;
    }
    orchestratorRef.current?.pause();
    void orchestratorRef.current?.finalizePendingStorage();
  }, [messages]);

  const stopWorkflow = useCallback(() => {
    for (const [messageId, resolver] of recoveryResolversRef.current) {
      const message = messages.find((entry) => entry.id === messageId);
      resolver.resolve({
        action: "abort",
        modelId: recoveryModelIdForMessage(message, optionsRef.current),
      });
      recoveryResolversRef.current.delete(messageId);
    }
    orchestratorRef.current?.stop();
    void orchestratorRef.current?.finalizePendingStorage();
  }, [messages]);

  const resumeWorkflow = useCallback(async () => {
    // Unblock an in-flight model recovery instead of starting a parallel resume.
    if (recoveryResolversRef.current.size > 0) {
      for (const [messageId, resolver] of recoveryResolversRef.current) {
        const message = messages.find((entry) => entry.id === messageId);
        const modelId = recoveryModelIdForMessage(message, optionsRef.current);
        resolver.resolve({
          action: "continue",
          modelId,
        });
        recoveryResolversRef.current.delete(messageId);
      }
      setMessages((current) =>
        current.map((message) =>
          message.type === "recovery" && !message.resolved
            ? resolveRecoveryMessage(
                message,
                "continue",
                recoveryModelIdForMessage(message, optionsRef.current),
              )
            : message,
        ),
      );
      return;
    }
    await orchestratorRef.current?.resume();
  }, [messages]);

  const resetWorkflow = useCallback(() => {
    const orchestrator = orchestratorRef.current;
    orchestratorRef.current = null;
    checkpointResolversRef.current.clear();
    recoveryResolversRef.current.clear();
    void orchestrator?.finalizePendingStorage().finally(() => {
      resetWorkflowStorageContext();
    });
    setMessages([]);
    setRun(createWorkflowRun(""));
    setHighlightedMessageId(null);
    setHighlightedStage(null);
    setExpandedStage(null);
  }, [resetWorkflowStorageContext]);

  return {
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
  };
}
