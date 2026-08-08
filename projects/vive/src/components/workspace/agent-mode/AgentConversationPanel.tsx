import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Clapperboard,
  ImageIcon,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import {
  getAgentWorkflowTextModels,
  OPENROUTER_IMAGE_MODELS,
  OPENROUTER_VIDEO_MODELS,
} from "../../../lib/openrouter-models";
import type { WorkflowOptions } from "../../../lib/workflow-options";
import { workflowTextModelPatch } from "../../../lib/workflow-options";
import type { AgentMessage } from "../../../lib/workflow-messages";
import {
  resolveCheckpointMessage,
  resolveRecoveryMessage,
} from "../../../lib/workflow-messages";
import type { WorkflowRunStatus, WorkflowStage } from "../../../lib/workflow";
import { ModelDropdown } from "../ModelDropdown";
import { AgentMessageBubble } from "./AgentMessageBubble";
import { AgentThinkingBlock } from "./AgentThinkingBlock";
import { AgentWorkflowOutputPanel } from "./AgentWorkflowOutputPanel";

interface AgentConversationPanelProps {
  messages: AgentMessage[];
  runStatus: WorkflowRunStatus;
  options: WorkflowOptions;
  highlightedMessageId: string | null;
  onSendMessage: (content: string) => void;
  onOptionsChange: (patch: Partial<WorkflowOptions>) => void;
  onCheckpointAction: (
    messageId: string,
    action: "continue" | "review" | "pause",
  ) => void;
  onRecoveryContinue: (messageId: string, modelId: string) => void;
  onRecoveryAbort: (messageId: string) => void;
  onMessageSelect?: (message: AgentMessage) => void;
  onMessagesChange?: (messages: AgentMessage[]) => void;
  disabled?: boolean;
  showHeader?: boolean;
  showMessages?: boolean;
  composerOnly?: boolean;
  onSubmit?: () => void;
}

export function AgentConversationPanel({
  messages,
  runStatus,
  options,
  highlightedMessageId,
  onSendMessage,
  onOptionsChange,
  onCheckpointAction,
  onRecoveryContinue,
  onRecoveryAbort,
  onMessageSelect,
  onMessagesChange,
  disabled = false,
  showHeader = true,
  showMessages = true,
  composerOnly = false,
  onSubmit,
}: AgentConversationPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSubmit?.();
    onSendMessage(trimmed);
    setInput("");
  }

  function handleToggleThinkingGroup(
    messageIds: string[],
    currentCollapsed: boolean,
  ) {
    if (!onMessagesChange) return;
    const messageIdSet = new Set(messageIds);
    const nextCollapsed = !currentCollapsed;
    onMessagesChange(
      messages.map((message) =>
        message.type === "thinking" && messageIdSet.has(message.id)
          ? { ...message, collapsed: nextCollapsed }
          : message,
      ),
    );
  }

  function handleCheckpoint(
    messageId: string,
    action: "continue" | "review" | "pause",
  ) {
    onCheckpointAction(messageId, action);
    if (!onMessagesChange) return;
    onMessagesChange(
      messages.map((message) =>
        message.id === messageId && message.type === "checkpoint"
          ? resolveCheckpointMessage(message, action)
          : message,
      ),
    );
  }

  function handleRecoveryModelChange(messageId: string, modelId: string) {
    if (!onMessagesChange) return;
    onMessagesChange(
      messages.map((message) =>
        message.id === messageId && message.type === "recovery"
          ? { ...message, selectedModelId: modelId }
          : message,
      ),
    );
  }

  function handleRecoveryContinue(messageId: string, modelId: string) {
    onRecoveryContinue(messageId, modelId);
    if (!onMessagesChange) return;
    onMessagesChange(
      messages.map((message) =>
        message.id === messageId && message.type === "recovery"
          ? resolveRecoveryMessage(message, "continue", modelId)
          : message,
      ),
    );
  }

  function handleRecoveryAbort(messageId: string) {
    onRecoveryAbort(messageId);
    if (!onMessagesChange) return;
    onMessagesChange(
      messages.map((message) =>
        message.id === messageId && message.type === "recovery"
          ? resolveRecoveryMessage(message, "abort")
          : message,
      ),
    );
  }

  const isRunning = runStatus === "running";
  const canStart =
    runStatus === "idle" ||
    runStatus === "completed" ||
    runStatus === "failed";
  const inputDisabled = disabled || isRunning;
  const showGenerateButton = canStart || isRunning;

  type RenderItem =
    | {
        type: "message";
        key: string;
        message: AgentMessage;
      }
    | {
        type: "status-group";
        key: string;
        agent: string;
        stage?: WorkflowStage;
        messageIds: string[];
        updates: Array<{ id: string; content: string }>;
        representative: Extract<AgentMessage, { type: "status" }>;
      }
    | {
        type: "thinking-group";
        key: string;
        agent: string;
        stage?: WorkflowStage;
        collapsed: boolean;
        messageIds: string[];
        content: string;
        representative: Extract<AgentMessage, { type: "thinking" }>;
      };

  const statusGroupIndexByKey = new Map<string, number>();
  const renderItems = messages.reduce<RenderItem[]>((items, message) => {
    if (message.type === "status") {
      const statusGroupKey = `${message.agent}::${message.stage ?? "all"}`;
      const existingIndex = statusGroupIndexByKey.get(statusGroupKey);
      if (typeof existingIndex === "number") {
        const existing = items[existingIndex];
        if (existing?.type === "status-group") {
          const alreadyTracked = existing.updates.some(
            (update) => update.content === message.content,
          );
          items[existingIndex] = {
            ...existing,
            messageIds: [...existing.messageIds, message.id],
            updates: alreadyTracked
              ? existing.updates
              : [...existing.updates, { id: message.id, content: message.content }],
            representative: message,
          };
          return items;
        }
      }

      const nextItem: RenderItem = {
        type: "status-group",
        key: message.id,
        agent: message.agent,
        stage: message.stage,
        messageIds: [message.id],
        updates: [{ id: message.id, content: message.content }],
        representative: message,
      };
      statusGroupIndexByKey.set(statusGroupKey, items.length);
      items.push(nextItem);
      return items;
    }

    if (message.type !== "thinking") {
      items.push({
        type: "message",
        key: message.id,
        message,
      });
      return items;
    }

    const previous = items[items.length - 1];
    if (
      previous &&
      previous.type === "thinking-group" &&
      previous.agent === message.agent &&
      previous.stage === message.stage
    ) {
      const combinedContent = previous.content
        ? `${previous.content}\n\n${message.content}`
        : message.content;
      items[items.length - 1] = {
        ...previous,
        collapsed: previous.collapsed && message.collapsed,
        messageIds: [...previous.messageIds, message.id],
        content: combinedContent,
        representative: message,
      };
      return items;
    }

    items.push({
      type: "thinking-group",
      key: message.id,
      agent: message.agent,
      stage: message.stage,
      collapsed: message.collapsed,
      messageIds: [message.id],
      content: message.content,
      representative: message,
    });
    return items;
  }, []);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-bg-app",
        composerOnly && "items-center justify-center px-6",
      )}
    >
      {showHeader ? (
        <div className="flex h-10 shrink-0 items-center border-b border-border-subtle px-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Agent Conversation
          </span>
          {isRunning && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-resolve-accent">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </span>
          )}
        </div>
      ) : null}

      {showMessages ? (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {renderItems.map((item) =>
            item.type === "thinking-group" ? (
              <AgentThinkingBlock
                key={item.key}
                message={{
                  ...item.representative,
                  content: item.content,
                  collapsed: item.collapsed,
                }}
                highlighted={
                  highlightedMessageId
                    ? item.messageIds.includes(highlightedMessageId)
                    : false
                }
                onToggle={() =>
                  handleToggleThinkingGroup(item.messageIds, item.collapsed)
                }
                onSelect={() => onMessageSelect?.(item.representative)}
              />
            ) : item.type === "status-group" ? (
              <button
                type="button"
                key={item.key}
                onClick={() => onMessageSelect?.(item.representative)}
                className={cn(
                  "w-full rounded-lg border border-border-subtle/60 bg-bg-panel px-3 py-2 text-left",
                  highlightedMessageId
                    ? item.messageIds.includes(highlightedMessageId) &&
                        "ring-1 ring-resolve-accent"
                    : false,
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-resolve-accent">
                    {item.agent}
                  </span>
                  <span className="rounded bg-bg-raised px-1.5 py-0.5 text-[10px] text-text-secondary">
                    {item.updates.length} update{item.updates.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-1">
                  {item.updates.slice(-4).map((update) => (
                    <p
                      key={update.id}
                      className="line-clamp-2 text-[12px] text-text-secondary"
                    >
                      {update.content}
                    </p>
                  ))}
                  {item.updates.length > 4 ? (
                    <p className="text-[11px] text-text-disabled">
                      +{item.updates.length - 4} earlier updates
                    </p>
                  ) : null}
                </div>
              </button>
            ) : (
              <AgentMessageBubble
                key={item.key}
                message={item.message}
                highlighted={highlightedMessageId === item.message.id}
                onCheckpointAction={handleCheckpoint}
                onRecoveryModelChange={handleRecoveryModelChange}
                onRecoveryContinue={handleRecoveryContinue}
                onRecoveryAbort={handleRecoveryAbort}
                onSelect={() => onMessageSelect?.(item.message)}
              />
            ),
          )}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className={cn(
          "shrink-0 p-3",
          composerOnly ? "w-full max-w-3xl bg-transparent" : "border-t border-border-subtle bg-bg-panel",
        )}
      >
        <div className="rounded-xl border border-border-subtle bg-bg-viewer focus-within:border-border-focus">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            rows={3}
            disabled={inputDisabled}
            placeholder="Make a 30s TikTok about Sui parallel execution…"
            className="w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none disabled:opacity-60"
          />

          <AgentWorkflowOutputPanel
            options={options}
            disabled={inputDisabled}
            onChange={onOptionsChange}
          />

          <div className="flex items-end justify-between gap-2 px-2 pb-2 pt-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <ModelDropdown
                label="Text"
                hint="Script writing, design analysis, and storyboard planning"
                icon={<Sparkles className="h-3 w-3 shrink-0 text-resolve-accent" />}
                modelId={options.scriptModelId}
                models={getAgentWorkflowTextModels()}
                disabled={inputDisabled}
                size="md"
                onChange={(modelId) =>
                  onOptionsChange(workflowTextModelPatch(modelId))
                }
              />
              <ModelDropdown
                label="Image"
                hint="Characters, environments, and storyboard sheets"
                icon={<ImageIcon className="h-3 w-3 shrink-0 text-resolve-accent" />}
                modelId={options.imageModelId}
                models={OPENROUTER_IMAGE_MODELS}
                disabled={inputDisabled}
                size="md"
                onChange={(imageModelId) => onOptionsChange({ imageModelId })}
              />
              <ModelDropdown
                label="Video"
                hint="Final clip generation"
                icon={<Video className="h-3 w-3 shrink-0 text-resolve-accent" />}
                modelId={options.videoModelId}
                models={OPENROUTER_VIDEO_MODELS}
                disabled={inputDisabled}
                size="md"
                onChange={(videoModelId) => onOptionsChange({ videoModelId })}
              />
            </div>

            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={inputDisabled || !input.trim()}
              aria-label={showGenerateButton ? "Generate video" : "Send message"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                inputDisabled || !input.trim()
                  ? "cursor-not-allowed bg-bg-raised text-text-disabled"
                  : "bg-resolve-accent text-bg-app hover:opacity-90",
              )}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : showGenerateButton ? (
                <Clapperboard className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
