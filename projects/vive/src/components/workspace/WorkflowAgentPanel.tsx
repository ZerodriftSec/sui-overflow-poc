import { usePanelResize } from "../../hooks/usePanelResize";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import type { BehaviorMode, MediaMode } from "../../lib/chat-scope";
import { showsBehaviorModeSelector } from "../../lib/chat-scope";
import { cn } from "../../lib/utils";
import {
  AgentChat,
  type ApplyContentOptions,
  type CharacterSheetGenerationRequest,
  type FilmVideoGenerationRequest,
  type ImageGenerationRequest,
  type StoryboardImageGenerationRequest,
  type StoryboardPlanGenerationRequest,
  type LoadedScriptReference,
} from "./AgentChat";
import type { ChatImageAttachment } from "../../lib/chat-image-attachment";
import { BehaviorModeDropdown } from "./composer/BehaviorModeDropdown";
import { MediaModeTabs } from "./composer/MediaModeTabs";

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 800;
const PANEL_DEFAULT_WIDTH = 360;


interface WorkflowAgentPanelProps {
  projectId: string;
  chatDisabled?: boolean;
  chatDisabledReason?: string;
  onOpenSettings?: () => void;
  onApplyContent?: (
    content: string,
    options?: ApplyContentOptions,
  ) => void | Promise<void>;
  onPreviewContent?: (content: string) => void;
  loadScriptReference?: (id: string) => Promise<LoadedScriptReference | null>;
  onNewConversation?: () => void;
  newConversationSignal?: number;
  onGenerateVideo?: (request: FilmVideoGenerationRequest) => Promise<string>;
  onGenerateCharacterSheet?: (
    request: CharacterSheetGenerationRequest,
  ) => Promise<string>;
  onGenerateImage?: (request: ImageGenerationRequest) => Promise<string>;
  onGenerateStoryboardImage?: (
    request: StoryboardImageGenerationRequest,
  ) => Promise<string>;
  onGenerateStoryboardPlan?: (
    request: StoryboardPlanGenerationRequest,
  ) => Promise<string>;
  defaultFilmPrompt?: string;
  defaultFilmAttachments?: ChatImageAttachment[];
  defaultFilmDurationSec?: number;
  defaultFilmContextKey?: string;
  defaultMediaMode?: MediaMode;
  defaultBehaviorMode?: BehaviorMode;
}

export function WorkflowAgentPanel({
  projectId,
  chatDisabled = false,
  chatDisabledReason,
  onOpenSettings,
  onApplyContent,
  onPreviewContent,
  loadScriptReference,
  onNewConversation,
  newConversationSignal,
  onGenerateVideo,
  onGenerateCharacterSheet,
  onGenerateImage,
  onGenerateStoryboardImage,
  onGenerateStoryboardPlan,
  defaultFilmPrompt,
  defaultFilmAttachments,
  defaultFilmDurationSec,
  defaultFilmContextKey,
}: WorkflowAgentPanelProps) {
  const {
    selection,
    setMediaMode,
    setBehaviorMode,
    setSkillId,
    patchChatScope,
  } = useWorkspaceSelection();

  const { width, resizing, startResize } = usePanelResize({
    initialWidth: PANEL_DEFAULT_WIDTH,
    minWidth: PANEL_MIN_WIDTH,
    maxWidth: PANEL_MAX_WIDTH,
    edge: "left",
  });

  return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-none shrink-0 self-stretch overflow-hidden" style={{ width }}>
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
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle px-2">
          <MediaModeTabs
            value={selection.chatScope.mediaMode}
            onChange={setMediaMode}
            disabled={chatDisabled}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <AgentChat
            projectId={projectId}
            scope={selection.chatScope}
            onSkillChange={setSkillId}
            onPatchChatScope={patchChatScope}
            manualApplyOnly
            behaviorModeControl={
              showsBehaviorModeSelector(selection.chatScope.mediaMode) ? (
                <BehaviorModeDropdown
                  value={selection.chatScope.behaviorMode}
                  onChange={setBehaviorMode}
                  mediaMode={selection.chatScope.mediaMode}
                  disabled={chatDisabled}
                />
              ) : null
            }
            disabled={chatDisabled}
            disabledReason={chatDisabledReason}
            onOpenSettings={onOpenSettings}
            onApply={onApplyContent}
            onPreviewApply={onPreviewContent}
            loadScriptReference={loadScriptReference}
            onNewConversation={onNewConversation}
            newConversationSignal={newConversationSignal}
            onGenerateVideo={onGenerateVideo}
            onGenerateCharacterSheet={onGenerateCharacterSheet}
            onGenerateImage={onGenerateImage}
            onGenerateStoryboardImage={onGenerateStoryboardImage}
            onGenerateStoryboardPlan={onGenerateStoryboardPlan}
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
