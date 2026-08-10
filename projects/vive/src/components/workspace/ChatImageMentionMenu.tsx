import { createPortal } from "react-dom";
import { Image as ImageIcon } from "lucide-react";
import type { ChatImageAttachment } from "../../lib/chat-image-attachment";
import { getImageMentionLabel } from "../../lib/chat-image-mention";
import { cn } from "../../lib/utils";

interface MentionMenuAnchor {
  top: number;
  left: number;
  right: number;
}

interface ChatImageMentionMenuProps {
  open: boolean;
  anchor: MentionMenuAnchor | null;
  attachments: ChatImageAttachment[];
  filteredAttachments: ChatImageAttachment[];
  selectedIndex: number;
  onSelect: (attachment: ChatImageAttachment) => void;
}

const MENU_WIDTH_PX = 256;
const MENU_GAP_PX = 2;
const VIEWPORT_PADDING_PX = 8;

function getMenuPosition(anchor: MentionMenuAnchor): {
  top: number;
  left: number;
  transform: string;
} {
  const overflowsRight =
    anchor.left + MENU_WIDTH_PX > window.innerWidth - VIEWPORT_PADDING_PX;

  if (overflowsRight) {
    return {
      top: anchor.top,
      left: anchor.right,
      transform: `translate(calc(-100%), calc(-100% - ${MENU_GAP_PX}px))`,
    };
  }

  return {
    top: anchor.top,
    left: anchor.left,
    transform: `translateY(calc(-100% - ${MENU_GAP_PX}px))`,
  };
}

export function ChatImageMentionMenu({
  open,
  anchor,
  attachments,
  filteredAttachments,
  selectedIndex,
  onSelect,
}: ChatImageMentionMenuProps) {
  if (!open || !anchor || attachments.length === 0) {
    return null;
  }

  const menuPosition = getMenuPosition(anchor);

  return createPortal(
    <div
      className="fixed z-[100] w-64 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-xl"
      style={menuPosition}
    >
      <div className="border-b border-border-subtle px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-text-secondary">
        Images
      </div>
      <div className="max-h-[220px] overflow-y-auto py-1">
        {filteredAttachments.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-text-secondary">
            No matching images
          </div>
        ) : (
          filteredAttachments.map((attachment, index) => {
            const label = getImageMentionLabel(attachment, attachments);
            return (
              <button
                key={attachment.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(attachment);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-bg-raised",
                  index === selectedIndex && "bg-bg-raised",
                )}
              >
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border-subtle bg-bg-raised">
                  <img
                    src={attachment.previewUrl}
                    alt={label}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-foreground">
                    {label}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                    <ImageIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">Reference in prompt</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}
