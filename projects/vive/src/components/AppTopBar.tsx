import { Settings } from "lucide-react";
import { cn } from "../lib/utils";
import { AppTopNavLinks } from "./AppTopNavLinks";
import { WalletConnectControl } from "./WalletConnectControl";

interface AppTopBarProps {
  centerTitle?: string;
  onOpenSettings: () => void;
  trailing?: React.ReactNode;
  className?: string;
  showSetupIndicator?: boolean;
}

export function AppTopBar({
  centerTitle,
  onOpenSettings,
  trailing,
  className,
  showSetupIndicator = false,
}: AppTopBarProps) {
  return (
    <header
      className={cn(
        "relative z-30 grid h-9 shrink-0 grid-cols-3 items-center border-b border-border-subtle bg-bg-panel px-3",
        className,
      )}
    >
      <AppTopNavLinks className="justify-self-start" />

      {centerTitle ? (
        <span className="min-w-0 truncate px-2 text-center text-[13px] font-semibold text-foreground">
          {centerTitle}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}

      <div className="flex items-center justify-self-end gap-2">
        {trailing}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="relative rounded p-1.5 text-text-secondary hover:bg-bg-raised hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          {showSetupIndicator ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-resolve-accent" />
          ) : null}
        </button>
        <WalletConnectControl size="compact" />
      </div>
    </header>
  );
}
