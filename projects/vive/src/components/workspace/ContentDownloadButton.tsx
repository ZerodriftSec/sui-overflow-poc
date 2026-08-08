import { Download, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface ContentDownloadButtonProps {
  disabled?: boolean;
  downloading?: boolean;
  onDownload: () => void | Promise<void>;
  className?: string;
}

export function ContentDownloadButton({
  disabled = false,
  downloading = false,
  onDownload,
  className,
}: ContentDownloadButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || downloading}
      aria-label="Download"
      title="Download"
      onClick={() => void onDownload()}
      className={cn(
        "inline-flex items-center justify-center rounded-sm border p-1 transition-colors",
        disabled || downloading
          ? "cursor-not-allowed border-transparent bg-bg-raised text-text-disabled"
          : "border-border-subtle text-foreground hover:bg-bg-raised",
        className,
      )}
    >
      {downloading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
