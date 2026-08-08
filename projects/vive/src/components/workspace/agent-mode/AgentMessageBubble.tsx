import { cn } from "../../../lib/utils";
import type { AgentMessage } from "../../../lib/workflow-messages";
import { AgentCheckpointPrompt } from "./AgentCheckpointPrompt";
import { AgentRecoveryPrompt } from "./AgentRecoveryPrompt";
import { AgentThinkingBlock } from "./AgentThinkingBlock";

interface AgentMessageBubbleProps {
  message: AgentMessage;
  highlighted?: boolean;
  onToggleThinking?: () => void;
  onCheckpointAction?: (
    messageId: string,
    action: "continue" | "review" | "pause",
  ) => void;
  onRecoveryModelChange?: (messageId: string, modelId: string) => void;
  onRecoveryContinue?: (messageId: string, modelId: string) => void;
  onRecoveryAbort?: (messageId: string) => void;
  onSelect?: () => void;
}

export function AgentMessageBubble({
  message,
  highlighted = false,
  onToggleThinking,
  onCheckpointAction,
  onRecoveryModelChange,
  onRecoveryContinue,
  onRecoveryAbort,
  onSelect,
}: AgentMessageBubbleProps) {
  if (message.type === "user") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border border-border-subtle bg-bg-raised px-3 py-2 text-left text-[13px] leading-relaxed",
          highlighted && "ring-1 ring-resolve-accent",
        )}
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          You
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </button>
    );
  }

  if (message.type === "status") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border border-border-subtle/60 bg-bg-panel px-3 py-2 text-left",
          highlighted && "ring-1 ring-resolve-accent",
        )}
      >
        <div className="mb-1 text-[10px] font-semibold text-resolve-accent">
          {message.agent}
        </div>
        <p className="text-[12px] text-text-secondary">{message.content}</p>
      </button>
    );
  }

  if (message.type === "thinking") {
    return (
      <AgentThinkingBlock
        message={message}
        highlighted={highlighted}
        onToggle={onToggleThinking}
        onSelect={onSelect}
      />
    );
  }

  if (message.type === "checkpoint") {
    return (
      <AgentCheckpointPrompt
        message={message}
        highlighted={highlighted}
        onAction={(action) => onCheckpointAction?.(message.id, action)}
      />
    );
  }

  if (message.type === "recovery") {
    return (
      <AgentRecoveryPrompt
        message={message}
        highlighted={highlighted}
        onModelChange={(messageId, modelId) =>
          onRecoveryModelChange?.(messageId, modelId)
        }
        onContinue={(messageId, modelId) =>
          onRecoveryContinue?.(messageId, modelId)
        }
        onAbort={onRecoveryAbort}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left",
        highlighted && "ring-1 ring-destructive",
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-destructive-foreground">
        Error
      </div>
      <p className="whitespace-pre-wrap text-[12px] text-destructive-foreground">
        {message.error}
      </p>
    </button>
  );
}
