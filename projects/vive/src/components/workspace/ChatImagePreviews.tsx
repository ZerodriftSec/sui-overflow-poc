import { X } from "lucide-react";
import {
  isVideoChatAttachment,
  type ChatImageAttachment,
} from "../../lib/chat-image-attachment";
import { cn } from "../../lib/utils";

interface ChatImagePreviewsProps {
  attachments: ChatImageAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function ChatImagePreviews({
  attachments,
  onRemove,
  disabled = false,
}: ChatImagePreviewsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3">
      {attachments.map((attachment) => {
        const isVideo = isVideoChatAttachment(attachment);
        return (
          <div
            key={attachment.id}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-bg-raised"
          >
            {isVideo ? (
              <video
                src={attachment.previewUrl}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="h-full w-full object-cover"
              />
            )}
            {isVideo ? (
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white">
                Video
              </span>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(attachment.id)}
              aria-label={`Remove ${attachment.name}`}
              className={cn(
                "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white opacity-0 shadow-sm transition-opacity",
                "group-hover:opacity-100 focus-visible:opacity-100",
                disabled && "cursor-not-allowed",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
