import { useEffect, useState } from "react";
import type { StoredChatImage } from "../../lib/agent-conversation";
import { loadStoredChatImageDataUrl } from "../../lib/chat-image-storage";
import { useWalrusStorage } from "../../hooks/useWalrusStorage";

interface ChatAttachedImageProps {
  messageId: string;
  image: StoredChatImage;
}

export function ChatAttachedImage({ messageId, image }: ChatAttachedImageProps) {
  const walrusStorage = useWalrusStorage();
  const [src, setSrc] = useState<string | null>(image.dataUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (image.dataUrl?.trim()) {
      setSrc(image.dataUrl);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setSrc(null);
    setFailed(false);

    void walrusStorage
      .getStorageContext()
      .then((ctx) => loadStoredChatImageDataUrl(ctx, image))
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          setSrc(dataUrl);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [image, walrusStorage.getStorageContext]);

  if (src) {
    const mimeType =
      image.mimeType ??
      src.match(/^data:([^;]+);/)?.[1] ??
      "image/png";
    const isVideo =
      mimeType.startsWith("video/") || src.startsWith("data:video/");

    if (isVideo) {
      return (
        <video
          key={`${messageId}-${image.name}-${image.imageBlobId ?? "inline"}`}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="max-h-40 max-w-full rounded-md border border-white/10 object-contain"
        />
      );
    }

    return (
      <img
        key={`${messageId}-${image.name}-${image.imageBlobId ?? "inline"}`}
        src={src}
        alt={image.name}
        className="max-h-40 max-w-full rounded-md border border-white/10 object-contain"
      />
    );
  }

  if (failed) {
    return (
      <span
        key={`${messageId}-${image.name}-failed`}
        className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px]"
      >
        {image.name} (failed to load)
      </span>
    );
  }

  return (
    <span
      key={`${messageId}-${image.name}-loading`}
      className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px]"
    >
      Loading {image.name}…
    </span>
  );
}
