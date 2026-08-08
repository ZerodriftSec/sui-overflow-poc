import { cn } from "../../../lib/utils";
import type { AgentMessage } from "../../../lib/workflow-messages";

interface AgentCheckpointPromptProps {
  message: Extract<AgentMessage, { type: "checkpoint" }>;
  highlighted?: boolean;
  onAction: (action: "continue" | "review" | "pause") => void;
}

export function AgentCheckpointPrompt({
  message,
  highlighted = false,
  onAction,
}: AgentCheckpointPromptProps) {
  const resolved = message.resolved;

  return (
    <div
      className={cn(
        "rounded-lg border border-resolve-accent/30 bg-resolve-accent/5 px-3 py-3",
        highlighted && "ring-1 ring-resolve-accent",
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-resolve-accent">
        Checkpoint
      </div>
      <p className="mb-3 text-[13px] leading-relaxed">{message.prompt}</p>
      {resolved ? (
        <p className="text-[11px] text-text-secondary">
          Resolved: {resolved}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {message.actions.includes("review") && (
            <button
              type="button"
              onClick={() => onAction("review")}
              className="rounded-md border border-border-subtle bg-bg-raised px-2.5 py-1 text-[11px] font-medium hover:border-border-focus"
            >
              Review
            </button>
          )}
          {message.actions.includes("continue") && (
            <button
              type="button"
              onClick={() => onAction("continue")}
              className="rounded-md bg-resolve-accent px-2.5 py-1 text-[11px] font-medium text-bg-app hover:opacity-90"
            >
              Continue
            </button>
          )}
          {message.actions.includes("pause") && (
            <button
              type="button"
              onClick={() => onAction("pause")}
              className="rounded-md px-2.5 py-1 text-[11px] text-text-secondary hover:text-foreground"
            >
              Pause
            </button>
          )}
        </div>
      )}
    </div>
  );
}
