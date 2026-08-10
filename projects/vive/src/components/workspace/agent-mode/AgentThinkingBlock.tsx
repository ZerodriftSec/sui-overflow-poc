import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { AgentMessage } from "../../../lib/workflow-messages";

interface AgentThinkingBlockProps {
  message: Extract<AgentMessage, { type: "thinking" }>;
  highlighted?: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
}

export function AgentThinkingBlock({
  message,
  highlighted = false,
  onToggle,
  onSelect,
}: AgentThinkingBlockProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle/50 bg-bg-viewer/60",
        highlighted && "ring-1 ring-resolve-accent",
      )}
    >
      <button
        type="button"
        onClick={() => {
          onToggle?.();
          onSelect?.();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {message.collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
        )}
        <span className="text-[10px] font-semibold text-text-secondary">
          {message.agent} thinking…
        </span>
      </button>
      {!message.collapsed && (
        <div className="border-t border-border-subtle/40 px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
          {message.content}
        </div>
      )}
    </div>
  );
}
