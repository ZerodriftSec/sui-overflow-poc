import { forwardRef } from "react";
import { cn } from "../../../lib/utils";

interface ComposerTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export const ComposerTextarea = forwardRef<HTMLTextAreaElement, ComposerTextareaProps>(
  function ComposerTextarea(
    {
      value,
      onChange,
      onKeyDown,
      placeholder,
      disabled = false,
      minHeight = 72,
      maxHeight = 240,
    },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        style={{ minHeight, maxHeight }}
        className={cn(
          "w-full resize-none bg-transparent px-3 pb-0 pt-0 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-text-disabled disabled:opacity-50",
        )}
      />
    );
  },
);
