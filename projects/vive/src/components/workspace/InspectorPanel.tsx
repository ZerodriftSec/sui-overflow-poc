import { Sparkles } from "lucide-react";
import type { ChatImageAttachment } from "../../lib/chat-image-attachment";
import type { ConversationScope } from "../../lib/chat-scope";
import { showsBehaviorModeSelector } from "../../lib/chat-scope";
import { cn } from "../../lib/utils";
import { usePanelResize } from "../../hooks/usePanelResize";
import {
  AgentChat,
  type ApplyContentOptions,
  type FilmVideoGenerationRequest,
  type LoadedScriptReference,
} from "./AgentChat";
import { BehaviorModeDropdown } from "./composer/BehaviorModeDropdown";

interface InspectorPanelProps {
  scope: ConversationScope;
  projectId: string;
  chatDisabled?: boolean;
  chatDisabledReason?: string;
  manualApplyOnly?: boolean;
  onOpenSettings?: () => void;
  onApplyContent?: (
    content: string,
    options?: ApplyContentOptions,
  ) => void | Promise<void>;
  onPreviewApply?: (content: string) => void;
  loadScriptReference?: (id: string) => Promise<LoadedScriptReference | null>;
  onNewConversation?: () => void;
  newConversationSignal?: number;
  onGenerateVideo?: (request: FilmVideoGenerationRequest) => Promise<string>;
  defaultFilmPrompt?: string;
  defaultFilmAttachments?: ChatImageAttachment[];
  defaultFilmDurationSec?: number;
  defaultFilmContextKey?: string;
}

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_DEFAULT_WIDTH = 360;

export function InspectorPanel({
  scope,
  projectId,
  chatDisabled = false,
  chatDisabledReason,
  manualApplyOnly = false,
  onOpenSettings,
  onApplyContent,
  onPreviewApply,
  loadScriptReference,
  onNewConversation,
  newConversationSignal,
  onGenerateVideo,
  defaultFilmPrompt,
  defaultFilmAttachments,
  defaultFilmDurationSec,
  defaultFilmContextKey,
}: InspectorPanelProps) {
  const resolvedChatDisabled = chatDisabled;
  const resolvedDisabledReason = chatDisabledReason;
  const { width, resizing, startResize } = usePanelResize({
    initialWidth: PANEL_DEFAULT_WIDTH,
    minWidth: PANEL_MIN_WIDTH,
    maxWidth: PANEL_MAX_WIDTH,
    edge: "left",
  });

  return (
    <div
      className="relative flex h-full min-h-0 shrink-0 self-stretch overflow-hidden"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent panel"
        onMouseDown={startResize}
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1 -translate-x-1/2 cursor-col-resize transition-colors",
          resizing ? "bg-border-focus" : "hover:bg-border-subtle",
        )}
      />

      <aside className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden border-l border-border-subtle bg-bg-panel">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Agent
          </span>
          <Sparkles className="h-3.5 w-3.5 text-resolve-accent" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <AgentChat
            projectId={projectId}
            scope={scope}
            manualApplyOnly={manualApplyOnly}
            behaviorModeControl={
              showsBehaviorModeSelector(scope.mediaMode) ? (
                <BehaviorModeDropdown
                  value={scope.behaviorMode}
                  onChange={() => undefined}
                  mediaMode={scope.mediaMode}
                  disabled
                />
              ) : null
            }
            disabled={resolvedChatDisabled}
            disabledReason={resolvedDisabledReason}
            onOpenSettings={onOpenSettings}
            onApply={onApplyContent}
            onPreviewApply={onPreviewApply}
            loadScriptReference={loadScriptReference}
            onNewConversation={onNewConversation}
            newConversationSignal={newConversationSignal}
            onGenerateVideo={onGenerateVideo}
            defaultFilmPrompt={defaultFilmPrompt}
            defaultFilmAttachments={defaultFilmAttachments}
            defaultFilmDurationSec={defaultFilmDurationSec}
            defaultFilmContextKey={defaultFilmContextKey}
          />
        </div>
      </aside>
    </div>
  );
}
