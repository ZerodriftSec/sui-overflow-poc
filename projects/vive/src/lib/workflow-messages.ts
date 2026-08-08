import type { WorkflowStage } from "./workflow";

export type AgentMessage =
  | {
      id: string;
      type: "user";
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      type: "status";
      agent: string;
      content: string;
      stage?: WorkflowStage;
      createdAt: string;
    }
  | {
      id: string;
      type: "thinking";
      agent: string;
      content: string;
      collapsed: boolean;
      stage?: WorkflowStage;
      createdAt: string;
    }
  | {
      id: string;
      type: "checkpoint";
      stage: WorkflowStage;
      prompt: string;
      actions: ("continue" | "review" | "pause")[];
      resolved?: "continue" | "review" | "pause";
      createdAt: string;
    }
  | {
      id: string;
      type: "error";
      stage: WorkflowStage;
      error: string;
      createdAt: string;
    }
  | {
      id: string;
      type: "recovery";
      stage: WorkflowStage;
      kind: "image_model" | "video_model";
      error: string;
      failedModelId: string;
      selectedModelId: string;
      resolved?: "continue" | "abort";
      createdAt: string;
    };

export function createUserMessage(content: string): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createStatusMessage(
  agent: string,
  content: string,
  stage?: WorkflowStage,
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "status",
    agent,
    content,
    stage,
    createdAt: new Date().toISOString(),
  };
}

export function createThinkingMessage(
  agent: string,
  content: string,
  stage?: WorkflowStage,
  collapsed = true,
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "thinking",
    agent,
    content,
    collapsed,
    stage,
    createdAt: new Date().toISOString(),
  };
}

export function createCheckpointMessage(
  stage: WorkflowStage,
  prompt: string,
  actions: ("continue" | "review" | "pause")[] = ["review", "continue"],
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "checkpoint",
    stage,
    prompt,
    actions,
    createdAt: new Date().toISOString(),
  };
}

export function createErrorMessage(
  stage: WorkflowStage,
  error: string,
): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "error",
    stage,
    error,
    createdAt: new Date().toISOString(),
  };
}

export function createModelRecoveryMessage(input: {
  stage: WorkflowStage;
  kind: "image_model" | "video_model";
  error: string;
  failedModelId: string;
  selectedModelId: string;
}): AgentMessage {
  return {
    id: crypto.randomUUID(),
    type: "recovery",
    stage: input.stage,
    kind: input.kind,
    error: input.error,
    failedModelId: input.failedModelId,
    selectedModelId: input.selectedModelId,
    createdAt: new Date().toISOString(),
  };
}

export function createImageModelRecoveryMessage(input: {
  stage: WorkflowStage;
  error: string;
  failedModelId: string;
  selectedModelId: string;
}): AgentMessage {
  return createModelRecoveryMessage({
    ...input,
    kind: "image_model",
  });
}

export function createVideoModelRecoveryMessage(input: {
  stage: WorkflowStage;
  error: string;
  failedModelId: string;
  selectedModelId: string;
}): AgentMessage {
  return createModelRecoveryMessage({
    ...input,
    kind: "video_model",
  });
}

export function resolveCheckpointMessage(
  message: AgentMessage,
  resolution: "continue" | "review" | "pause",
): AgentMessage {
  if (message.type !== "checkpoint") return message;
  return { ...message, resolved: resolution };
}

export function resolveRecoveryMessage(
  message: AgentMessage,
  resolution: "continue" | "abort",
  selectedModelId?: string,
): AgentMessage {
  if (message.type !== "recovery") return message;
  return {
    ...message,
    resolved: resolution,
    selectedModelId: selectedModelId ?? message.selectedModelId,
  };
}

export function toggleThinkingCollapsed(message: AgentMessage): AgentMessage {
  if (message.type !== "thinking") return message;
  return { ...message, collapsed: !message.collapsed };
}
