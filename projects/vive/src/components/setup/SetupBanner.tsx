import { X } from "lucide-react";

interface SetupBannerProps {
  onSetup: () => void;
  onDismiss: () => void;
}

export function SetupBanner({ onSetup, onDismiss }: SetupBannerProps) {
  return (
    <div className="flex items-center gap-3 border-b border-resolve-accent/30 bg-resolve-accent/10 px-3 py-2 text-[12px] text-foreground">
      <p className="min-w-0 flex-1">
        Connect OpenRouter to use AI features in your projects.
      </p>
      <button
        type="button"
        onClick={onSetup}
        className="shrink-0 whitespace-nowrap rounded-sm border border-resolve-accent/50 bg-resolve-accent/10 px-2.5 py-1 text-[11px] font-medium text-resolve-accent transition-colors hover:border-resolve-accent hover:bg-resolve-accent/15"
      >
        Set up
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss setup banner"
        className="shrink-0 rounded p-1 text-text-secondary transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
