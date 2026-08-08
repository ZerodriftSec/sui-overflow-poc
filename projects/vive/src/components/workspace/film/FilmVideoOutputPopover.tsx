import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  VIDEO_OUTPUT_ASPECT_RATIOS,
  VIDEO_OUTPUT_RESOLUTIONS,
  type VideoAspectRatioSetting,
  type VideoResolution,
} from "../../../lib/openrouter-models";
import { cn } from "../../../lib/utils";

interface PopoverAnchor {
  top: number;
  left: number;
  right: number;
  width: number;
}

const POPOVER_WIDTH_PX = 320;
const POPOVER_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;

function getPopoverPosition(anchor: PopoverAnchor): {
  top: number;
  left: number;
  transform: string;
} {
  const overflowsRight =
    anchor.left + POPOVER_WIDTH_PX > window.innerWidth - VIEWPORT_PADDING_PX;

  if (overflowsRight) {
    return {
      top: anchor.top,
      left: anchor.right,
      transform: `translate(calc(-100%), calc(-100% - ${POPOVER_GAP_PX}px))`,
    };
  }

  return {
    top: anchor.top,
    left: anchor.left,
    transform: `translateY(calc(-100% - ${POPOVER_GAP_PX}px))`,
  };
}

interface FilmVideoOutputPopoverProps {
  open: boolean;
  anchor: PopoverAnchor | null;
  aspectRatio: VideoAspectRatioSetting;
  resolution: VideoResolution;
  disabled?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onAspectRatioChange: (value: VideoAspectRatioSetting) => void;
  onResolutionChange: (value: VideoResolution) => void;
}

function AspectRatioIcon({ ratio }: { ratio: VideoAspectRatioSetting }) {
  const [widthRatio, heightRatio] = ratio.split(":").map(Number);
  const maxSize = 14;
  const aspect = widthRatio / heightRatio;
  let width = maxSize;
  let height = maxSize;

  if (aspect >= 1) {
    height = Math.max(4, maxSize / aspect);
  } else {
    width = Math.max(4, maxSize * aspect);
  }

  return (
    <div className="flex h-4 w-4 items-center justify-center">
      <div
        className="rounded-sm border border-current"
        style={{ width, height }}
      />
    </div>
  );
}

export function FilmVideoOutputPopover({
  open,
  anchor,
  aspectRatio,
  resolution,
  disabled = false,
  triggerRef,
  onClose,
  onAspectRatioChange,
  onResolutionChange,
}: FilmVideoOutputPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (triggerRef?.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open || !anchor) {
    return null;
  }

  const popoverPosition = getPopoverPosition(anchor);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[100] w-[min(100vw-1rem,20rem)] overflow-hidden rounded-xl border border-border-subtle bg-bg-panel shadow-xl"
      style={popoverPosition}
    >
      <div className="border-b border-border-subtle px-3 py-2 text-[11px] font-semibold text-foreground">
        Output
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-1.5">
          <div className="text-[10px] text-text-secondary">Aspect ratio</div>
          <div className="overflow-x-auto">
            <div className="inline-flex min-w-full gap-1 rounded-lg bg-bg-app p-1">
              {VIDEO_OUTPUT_ASPECT_RATIOS.map((value) => {
                const selected = aspectRatio === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAspectRatioChange(value)}
                    className={cn(
                      "flex min-w-[3.25rem] flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                      selected
                        ? "bg-bg-raised text-foreground"
                        : "text-text-secondary hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <AspectRatioIcon ratio={value} />
                    <span className="text-[10px] font-medium">{value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] text-text-secondary">Resolution</div>
          <div className="inline-flex w-full gap-1 rounded-lg bg-bg-app p-1">
            {VIDEO_OUTPUT_RESOLUTIONS.map((value) => {
              const selected = resolution === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onResolutionChange(value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                    selected
                      ? "bg-bg-raised text-foreground"
                      : "text-text-secondary hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function getOutputPopoverAnchor(
  element: HTMLElement,
): PopoverAnchor {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    width: rect.width,
  };
}
