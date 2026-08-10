import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronRight,
  ImagePlus,
  Loader2,
  Settings2,
  Volume2,
  X,
} from "lucide-react";
import {
  ASSET_DRAG_MIME,
  parseAssetDragPayload,
  type AssetDragPayload,
} from "../../../lib/agent-context";
import type {
  ChatImageAttachment,
  VideoFramePosition,
} from "../../../lib/chat-image-attachment";
import { isAcceptedVideoFile } from "../../../lib/chat-image-attachment";
import {
  formatVideoOutputSummary,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "../../../lib/openrouter-models";
import { cn } from "../../../lib/utils";
import { FilmVideoDurationSlider } from "./FilmVideoDurationSlider";
import {
  FilmVideoOutputPopover,
  getOutputPopoverAnchor,
} from "./FilmVideoOutputPopover";

interface FilmVideoGenerationPanelProps {
  firstFrame: ChatImageAttachment | null;
  lastFrame: ChatImageAttachment | null;
  generateAudio: boolean;
  aspectRatio: VideoAspectRatioSetting;
  resolution: VideoResolution;
  durationSec: number;
  videoModelId: string;
  referenceImageCount?: number;
  hasInputReferences?: boolean;
  showFrameSlots?: boolean;
  disabled?: boolean;
  onFirstFrameChange: (frame: ChatImageAttachment | null) => void;
  onLastFrameChange: (frame: ChatImageAttachment | null) => void;
  onSwapFrames: () => void;
  onGenerateAudioChange: (enabled: boolean) => void;
  onAspectRatioChange: (value: VideoAspectRatioSetting) => void;
  onResolutionChange: (value: VideoResolution) => void;
  onDurationChange: (value: number) => void;
  onAddFrameFile: (file: File, slot: "first" | "last") => void | Promise<void>;
  onAddFrameAsset: (
    payload: AssetDragPayload,
    slot: "first" | "last",
  ) => void | Promise<void>;
  onFrameVideoPositionChange: (
    slot: "first" | "last",
    position: VideoFramePosition,
  ) => void | Promise<void>;
  /** Called when a keyframe slot is the active drag target (clears composer highlight). */
  onKeyframeDragActiveChange?: (active: boolean) => void;
}

function isFrameDropFile(file: File): boolean {
  return file.type.startsWith("image/") || isAcceptedVideoFile(file);
}

function isFrameAssetPayload(payload: AssetDragPayload): boolean {
  return (
    payload.fileType === "image" ||
    payload.fileType === "video" ||
    payload.folderId === "videos" ||
    payload.folderId === "character_sheets" ||
    payload.folderId === "environment_sheets" ||
    payload.folderId === "storyboards"
  );
}

function dragCanBecomeFrame(event: React.DragEvent): boolean {
  if (event.dataTransfer.types.includes(ASSET_DRAG_MIME)) {
    return true;
  }
  return Array.from(event.dataTransfer.types).includes("Files");
}

function FrameSlot({
  label,
  frame,
  disabled,
  onAddFile,
  onAddAsset,
  onRemove,
  onVideoPositionChange,
  onDragActiveChange,
}: {
  label: string;
  frame: ChatImageAttachment | null;
  disabled?: boolean;
  onAddFile: (file: File) => void | Promise<void>;
  onAddAsset: (payload: AssetDragPayload) => void | Promise<void>;
  onRemove: () => void;
  onVideoPositionChange: (position: VideoFramePosition) => void | Promise<void>;
  onDragActiveChange?: (active: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const videoPosition = frame?.videoFrameSource?.position;

  function setSlotDragActive(active: boolean) {
    setDragOver(active);
    onDragActiveChange?.(active);
  }

  async function runBusy(action: () => void | Promise<void>) {
    setBusy(true);
    setSlotDragActive(false);
    try {
      await Promise.race([
        Promise.resolve(action()),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error("Timed out while preparing keyframe"));
          }, 15_000);
        }),
      ]);
    } catch (error) {
      // Parent handlers also surface errors; keep the slot usable.
      console.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void runBusy(() => onAddFile(file));
          }
          event.target.value = "";
        }}
      />
      <div
        ref={slotRef}
        data-keyframe-drop=""
        role="button"
        tabIndex={disabled || busy ? -1 : 0}
        aria-label={frame ? label : `Add ${label}`}
        aria-disabled={disabled || busy}
        onClick={() => {
          if (disabled || busy) return;
          inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (disabled || busy) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          if (disabled || busy) return;
          if (!dragCanBecomeFrame(event)) return;
          event.preventDefault();
          event.stopPropagation();
          setSlotDragActive(true);
        }}
        onDragOver={(event) => {
          if (disabled || busy) return;
          if (!dragCanBecomeFrame(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setSlotDragActive(true);
        }}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (
            nextTarget instanceof Node &&
            slotRef.current?.contains(nextTarget)
          ) {
            return;
          }
          setSlotDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSlotDragActive(false);
          if (disabled || busy) return;

          const file = Array.from(event.dataTransfer.files).find(isFrameDropFile);
          if (file) {
            void runBusy(() => onAddFile(file));
            return;
          }

          const payload = parseAssetDragPayload(
            event.dataTransfer.getData(ASSET_DRAG_MIME),
          );
          if (payload && isFrameAssetPayload(payload)) {
            void runBusy(() => onAddAsset(payload));
          }
        }}
        className={cn(
          "relative flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors",
          dragOver
            ? "border-resolve-accent bg-resolve-accent/10 ring-1 ring-resolve-accent/40"
            : frame
              ? "border-border-subtle bg-bg-raised"
              : "border-border-subtle/80 bg-bg-app/40 hover:border-border-focus hover:bg-bg-raised/40",
          (disabled || busy) && "cursor-not-allowed opacity-50",
        )}
      >
        {frame ? (
          <>
            <img
              src={frame.previewUrl}
              alt={frame.name}
              className="absolute inset-0 h-full w-full rounded-lg object-cover"
            />
            <div className="absolute inset-0 rounded-lg bg-black/20" />
            <span
              className={cn(
                "relative z-10 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white",
                videoPosition && "absolute left-1.5 top-1.5",
              )}
            >
              {label}
            </span>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              aria-label={`Remove ${label}`}
              className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white transition-opacity hover:bg-black/90"
            >
              <X className="h-3 w-3" />
            </button>
            {videoPosition ? (
              <div
                role="group"
                aria-label="Clip frame to use"
                className="absolute bottom-1 left-1 right-1 z-10 flex overflow-hidden rounded-md bg-black/70 p-0.5"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {(["first", "last"] as const).map((position) => (
                  <button
                    key={position}
                    type="button"
                    disabled={disabled || busy}
                    aria-pressed={videoPosition === position}
                    onClick={() => {
                      if (videoPosition === position) return;
                      void runBusy(() => onVideoPositionChange(position));
                    }}
                    className={cn(
                      "flex-1 rounded px-1 py-0.5 text-[9px] font-medium transition-colors",
                      videoPosition === position
                        ? "bg-white/90 text-black"
                        : "text-white/80 hover:text-white",
                    )}
                  >
                    {position === "first" ? "First" : "Last"}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <ImagePlus className="h-4 w-4 text-text-secondary" />
            <span className="text-[10px] font-medium text-text-secondary">
              {label}
            </span>
          </>
        )}
        {busy ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/45">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FilmVideoGenerationPanel({
  firstFrame,
  lastFrame,
  generateAudio,
  aspectRatio,
  resolution,
  durationSec,
  videoModelId,
  referenceImageCount = 0,
  hasInputReferences = referenceImageCount > 0,
  showFrameSlots = true,
  disabled = false,
  onFirstFrameChange,
  onLastFrameChange,
  onSwapFrames,
  onGenerateAudioChange,
  onAspectRatioChange,
  onResolutionChange,
  onDurationChange,
  onAddFrameFile,
  onAddFrameAsset,
  onFrameVideoPositionChange,
  onKeyframeDragActiveChange,
}: FilmVideoGenerationPanelProps) {
  const outputButtonRef = useRef<HTMLButtonElement>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputAnchor, setOutputAnchor] = useState<ReturnType<
    typeof getOutputPopoverAnchor
  > | null>(null);

  useLayoutEffect(() => {
    if (!outputOpen || !outputButtonRef.current) {
      setOutputAnchor(null);
      return;
    }

    setOutputAnchor(getOutputPopoverAnchor(outputButtonRef.current));
  }, [outputOpen, aspectRatio, resolution]);

  return (
    <>
      <div className="flex flex-col gap-2 px-3">
        {showFrameSlots ? (
          <div className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
            <span className="text-[10px] text-text-secondary">Keyframes</span>
            <div className="flex items-center gap-2">
              <FrameSlot
                label="Start frame"
                frame={firstFrame}
                disabled={disabled}
                onAddFile={(file) => onAddFrameFile(file, "first")}
                onAddAsset={(payload) => onAddFrameAsset(payload, "first")}
                onRemove={() => onFirstFrameChange(null)}
                onVideoPositionChange={(position) =>
                  onFrameVideoPositionChange("first", position)
                }
                onDragActiveChange={onKeyframeDragActiveChange}
              />
              <button
                type="button"
                disabled={disabled || (!firstFrame && !lastFrame)}
                onClick={onSwapFrames}
                aria-label="Swap start and end frames"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-bg-app text-text-secondary transition-colors",
                  !disabled &&
                    (firstFrame || lastFrame) &&
                    "hover:border-border-focus hover:text-foreground",
                  (disabled || (!firstFrame && !lastFrame)) &&
                    "cursor-not-allowed opacity-40",
                )}
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
              <FrameSlot
                label="End frame"
                frame={lastFrame}
                disabled={disabled}
                onAddFile={(file) => onAddFrameFile(file, "last")}
                onAddAsset={(payload) => onAddFrameAsset(payload, "last")}
                onRemove={() => onLastFrameChange(null)}
                onVideoPositionChange={(position) =>
                  onFrameVideoPositionChange("last", position)
                }
                onDragActiveChange={onKeyframeDragActiveChange}
              />
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <Volume2 className="h-3 w-3" />
              Audio
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={generateAudio}
              disabled={disabled}
              onClick={() => onGenerateAudioChange(!generateAudio)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors outline-none",
                generateAudio ? "bg-resolve-accent" : "bg-border-subtle",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  generateAudio ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </label>

          <button
            ref={outputButtonRef}
            type="button"
            disabled={disabled}
            onClick={() => setOutputOpen((open) => !open)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-raised px-2.5 py-2 text-left transition-colors",
              outputOpen && "border-border-focus",
              !disabled && "hover:border-border-focus",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-[10px] text-text-secondary">
                <Settings2 className="h-3 w-3 shrink-0" />
                Output
              </span>
              <span className="truncate text-[11px] font-medium text-foreground">
                {formatVideoOutputSummary(aspectRatio, resolution)}
              </span>
            </span>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform",
                outputOpen && "rotate-90",
              )}
            />
          </button>
        </div>

        <FilmVideoDurationSlider
          value={durationSec}
          videoModelId={videoModelId}
          hasInputReferences={hasInputReferences}
          hasFrameImages={Boolean(firstFrame || lastFrame)}
          disabled={disabled}
          onChange={onDurationChange}
        />
      </div>

      <FilmVideoOutputPopover
        open={outputOpen}
        anchor={outputAnchor}
        aspectRatio={aspectRatio}
        resolution={resolution}
        disabled={disabled}
        triggerRef={outputButtonRef}
        onClose={() => setOutputOpen(false)}
        onAspectRatioChange={onAspectRatioChange}
        onResolutionChange={onResolutionChange}
      />
    </>
  );
}
