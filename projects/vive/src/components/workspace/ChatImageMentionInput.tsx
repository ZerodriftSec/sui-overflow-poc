import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import type { ChatImageAttachment } from "../../lib/chat-image-attachment";
import {
  buildImageMentionToken,
  buildImageMentionTokenId,
  filterImagesByMentionQuery,
  getActiveImageMentionQuery,
  getImageMentionLabel,
  insertImageMention,
  parseInputWithMentions,
} from "../../lib/chat-image-mention";
import { cn } from "../../lib/utils";
import { ChatImageMentionMenu } from "./ChatImageMentionMenu";

const INPUT_MIN_HEIGHT = 72;
const INPUT_MAX_HEIGHT = 240;

interface MentionMenuAnchor {
  top: number;
  left: number;
  right: number;
}

interface ChatImageMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  attachedImages: ChatImageAttachment[];
  placeholder: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onSend?: () => void;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node instanceof HTMLElement) {
    const mentionId = node.dataset.mentionId;
    if (mentionId) {
      return buildImageMentionTokenId(mentionId);
    }
    if (node.tagName === "BR") {
      return "\n";
    }
    return Array.from(node.childNodes).map(serializeNode).join("");
  }

  return "";
}

function serializeEditor(root: HTMLElement): string {
  return Array.from(root.childNodes).map(serializeNode).join("");
}

function getCursorOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return 0;
  }

  let offset = 0;
  let found = false;

  function walk(node: Node): void {
    if (found) {
      return;
    }

    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.startOffset;
      } else if (node instanceof HTMLElement) {
        for (const child of Array.from(node.childNodes)) {
          if (child.contains(range.startContainer) || child === range.startContainer) {
            walk(child);
            return;
          }
          offset += serializeNode(child).length;
        }
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }

    if (node instanceof HTMLElement && node.dataset.mentionId) {
      offset += buildImageMentionTokenId(node.dataset.mentionId).length;
      return;
    }

    if (node instanceof HTMLElement && node.tagName === "BR") {
      offset += 1;
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child);
      if (found) {
        return;
      }
    }
  }

  for (const child of Array.from(root.childNodes)) {
    walk(child);
    if (found) {
      break;
    }
  }

  return offset;
}

function setCursorAtOffset(root: HTMLElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const activeSelection = selection;
  let current = 0;

  function placeCursor(node: Node, nodeOffset: number): boolean {
    const range = document.createRange();
    range.setStart(node, nodeOffset);
    range.collapse(true);
    activeSelection.removeAllRanges();
    activeSelection.addRange(range);
    return true;
  }

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (current + length >= targetOffset) {
        return placeCursor(node, targetOffset - current);
      }
      current += length;
      return false;
    }

    if (node instanceof HTMLElement && node.dataset.mentionId) {
      const tokenLength = buildImageMentionTokenId(node.dataset.mentionId).length;
      if (current + tokenLength >= targetOffset) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        activeSelection.removeAllRanges();
        activeSelection.addRange(range);
        return true;
      }
      current += tokenLength;
      return false;
    }

    if (node instanceof HTMLElement && node.tagName === "BR") {
      if (current + 1 >= targetOffset) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        activeSelection.removeAllRanges();
        activeSelection.addRange(range);
        return true;
      }
      current += 1;
      return false;
    }

    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) {
        return true;
      }
    }

    return false;
  }

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) {
      return;
    }
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  activeSelection.removeAllRanges();
  activeSelection.addRange(range);
}

function getCoordinatesAtOffset(
  root: HTMLElement,
  offset: number,
): MentionMenuAnchor | null {
  const selection = window.getSelection();
  if (!selection) {
    return null;
  }

  const savedRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;

  setCursorAtOffset(root, offset);
  const startRect =
    selection.getRangeAt(0).getClientRects()[0] ??
    selection.getRangeAt(0).getBoundingClientRect();

  setCursorAtOffset(root, Math.min(offset + 1, serializeEditor(root).length));
  const endRect =
    selection.getRangeAt(0).getClientRects()[0] ??
    selection.getRangeAt(0).getBoundingClientRect();

  const anchor = {
    top: startRect.top,
    left: startRect.left,
    right: Math.max(startRect.right, endRect.left),
  };

  if (savedRange) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  return anchor;
}

function createChipElement(
  attachment: ChatImageAttachment,
  label: string,
  disabled: boolean,
  onRemove: () => void,
): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mentionId = attachment.id;
  chip.className =
    "mx-0.5 inline-flex max-w-[180px] items-center gap-1 rounded-md border border-resolve-accent/30 bg-resolve-accent/10 px-1.5 py-0.5 align-middle text-resolve-accent";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.disabled = disabled;
  removeButton.className =
    "shrink-0 rounded p-0.5 text-resolve-accent/80 transition-colors hover:bg-resolve-accent/20 hover:text-resolve-accent disabled:opacity-50";
  removeButton.setAttribute("aria-label", `Remove ${label} reference`);
  removeButton.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  removeButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove();
  });

  const image = document.createElement("img");
  image.src = attachment.previewUrl;
  image.alt = "";
  image.className = "h-4 w-4 shrink-0 rounded object-cover";

  const labelSpan = document.createElement("span");
  labelSpan.className = "truncate text-[12px] font-medium leading-none";
  labelSpan.textContent = label;

  chip.append(removeButton, image, labelSpan);
  return chip;
}

function renderValueToEditor(
  root: HTMLElement,
  value: string,
  attachments: ChatImageAttachment[],
  disabled: boolean,
  onRemoveMention: (attachmentId: string) => void,
): void {
  root.innerHTML = "";
  const segments = parseInputWithMentions(value);

  if (segments.length === 0) {
    return;
  }

  for (const segment of segments) {
    if (segment.type === "text") {
      const lines = segment.value.split("\n");
      lines.forEach((line, lineIndex) => {
        if (line) {
          root.appendChild(document.createTextNode(line));
        }
        if (lineIndex < lines.length - 1) {
          root.appendChild(document.createElement("br"));
        }
      });
      continue;
    }

    const attachment = attachments.find((item) => item.id === segment.attachmentId);
    if (!attachment) {
      root.appendChild(document.createTextNode(segment.value));
      continue;
    }

    const label = getImageMentionLabel(attachment, attachments);
    root.appendChild(
      createChipElement(attachment, label, disabled, () => {
        onRemoveMention(attachment.id);
      }),
    );
  }
}

export function ChatImageMentionInput({
  value,
  onChange,
  attachedImages,
  placeholder,
  disabled = false,
  minHeight = INPUT_MIN_HEIGHT,
  maxHeight = INPUT_MAX_HEIGHT,
  onPaste,
  onSend,
}: ChatImageMentionInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const pendingCursorRef = useRef<number | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionAnchor, setMentionAnchor] = useState<MentionMenuAnchor | null>(
    null,
  );

  const activeMention =
    attachedImages.length > 0
      ? getActiveImageMentionQuery(value, cursorPosition)
      : null;
  const filteredMentionImages = activeMention
    ? filterImagesByMentionQuery(attachedImages, activeMention.query)
    : [];
  const mentionMenuOpen = activeMention !== null && attachedImages.length > 0;

  useEffect(() => {
    setMentionSelectedIndex(0);
  }, [activeMention?.query, activeMention?.start]);

  const removeMention = useCallback(
    (attachmentId: string) => {
      const token = buildImageMentionTokenId(attachmentId);
      onChange(value.replace(token, "").replace(/ {2}/g, " "));
    },
    [onChange, value],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const currentSerialized = serializeEditor(editor);
    if (currentSerialized !== value) {
      renderValueToEditor(editor, value, attachedImages, disabled, removeMention);
    }

    if (pendingCursorRef.current !== null) {
      setCursorAtOffset(editor, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  }, [value, attachedImages, disabled, removeMention]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || !mentionMenuOpen || !activeMention) {
      setMentionAnchor(null);
      return;
    }

    setMentionAnchor(getCoordinatesAtOffset(editor, activeMention.start));
  }, [mentionMenuOpen, activeMention?.start, activeMention?.query, value, cursorPosition]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(editor.scrollHeight, minHeight),
      maxHeight,
    );
    editor.style.height = `${nextHeight}px`;
  }, [value, attachedImages.length, minHeight, maxHeight]);

  function syncFromEditor() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const serialized = serializeEditor(editor);
    const nextCursor = getCursorOffset(editor);
    setCursorPosition(nextCursor);
    if (serialized !== value) {
      onChange(serialized);
    }
  }

  function handleSelectMention(attachment: ChatImageAttachment) {
    if (!activeMention) {
      return;
    }

    const token = buildImageMentionToken(attachment);
    const { nextText, nextCursor } = insertImageMention(
      value,
      activeMention.start,
      cursorPosition,
      token,
    );

    pendingCursorRef.current = nextCursor;
    setCursorPosition(nextCursor);
    onChange(nextText);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (mentionMenuOpen) {
      if (event.key === "ArrowDown" && filteredMentionImages.length > 0) {
        event.preventDefault();
        setMentionSelectedIndex((current) =>
          current + 1 >= filteredMentionImages.length ? 0 : current + 1,
        );
        return;
      }

      if (event.key === "ArrowUp" && filteredMentionImages.length > 0) {
        event.preventDefault();
        setMentionSelectedIndex((current) =>
          current - 1 < 0 ? filteredMentionImages.length - 1 : current - 1,
        );
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        filteredMentionImages.length > 0
      ) {
        event.preventDefault();
        handleSelectMention(
          filteredMentionImages[mentionSelectedIndex] ??
            filteredMentionImages[0]!,
        );
        return;
      }

      if (event.key === "Escape" && activeMention) {
        event.preventDefault();
        const before = value.slice(0, activeMention.start);
        const after = value.slice(cursorPosition);
        const nextText = before + after;
        pendingCursorRef.current = activeMention.start;
        setCursorPosition(activeMention.start);
        onChange(nextText);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend?.();
    }
  }

  return (
    <>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        onInput={syncFromEditor}
        onKeyUp={syncFromEditor}
        onMouseUp={syncFromEditor}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        style={{ minHeight, maxHeight }}
        className={cn(
          "w-full overflow-y-auto bg-transparent px-3 pb-0 pt-0 text-[13px] leading-relaxed text-foreground outline-none",
          "empty:before:text-text-disabled empty:before:content-[attr(data-placeholder)]",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />

      <ChatImageMentionMenu
        open={mentionMenuOpen}
        anchor={mentionAnchor}
        attachments={attachedImages}
        filteredAttachments={filteredMentionImages}
        selectedIndex={mentionSelectedIndex}
        onSelect={handleSelectMention}
      />
    </>
  );
}
