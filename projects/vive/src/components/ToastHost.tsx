import { useEffect, useState } from "react";
import { Check, Loader2, X, XCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { dismissToast, subscribeToasts, type Toast } from "../lib/toast";

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex min-w-[220px] max-w-sm items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg backdrop-blur-sm",
        toast.type === "error"
          ? "border-destructive/40 bg-bg-panel text-destructive-foreground"
          : "border-border-subtle bg-bg-panel text-foreground",
      )}
    >
      {toast.type === "loading" && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-secondary" />
      )}
      {toast.type === "success" && (
        <Check className="h-4 w-4 shrink-0 text-status-approved" />
      )}
      {toast.type === "error" && (
        <XCircle className="h-4 w-4 shrink-0 text-destructive-foreground" />
      )}
      <p className="min-w-0 flex-1 text-[13px] leading-snug">{toast.message}</p>
      {toast.type !== "loading" && (
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="shrink-0 rounded p-0.5 text-text-secondary transition-colors hover:text-foreground"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
