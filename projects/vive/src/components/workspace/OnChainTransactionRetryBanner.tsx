import { Loader2, RotateCcw } from "lucide-react";
import { useOnChainFlushRetry } from "../../hooks/useOnChainFlushRetry";
import { cn } from "../../lib/utils";

interface OnChainTransactionRetryBannerProps {
  projectId: string;
  className?: string;
  onRetried?: () => void;
}

export function OnChainTransactionRetryBanner({
  projectId,
  className,
  onRetried,
}: OnChainTransactionRetryBannerProps) {
  const { failure, isRetrying, retry } = useOnChainFlushRetry(projectId);

  if (!failure) {
    return null;
  }

  async function handleRetry(): Promise<void> {
    await retry();
    onRetried?.();
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[12px] text-foreground",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-amber-100">
          On-chain save needs your wallet
        </p>
        <p className="mt-0.5 text-text-secondary">{failure.error}</p>
        {failure.insufficientBalance ? (
          <p className="mt-1 text-[11px] text-text-secondary">
            Your files are already stored on Walrus. Retry will only submit the
            on-chain transaction — no re-upload.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void handleRetry()}
        disabled={isRetrying}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-50 hover:border-amber-500/60 disabled:opacity-60"
      >
        {isRetrying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
        {isRetrying ? "Retrying…" : "Retry transaction"}
      </button>
    </div>
  );
}
