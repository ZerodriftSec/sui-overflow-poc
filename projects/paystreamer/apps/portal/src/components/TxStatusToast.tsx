import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { CheckCircle, XCircle, X, ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";
import { getErrorMessage } from "../lib/errors";
import { useCurrentNetwork } from "@mysten/dapp-kit-react";

export type ToastId = string;

export interface Toast {
  id: ToastId;
  status: "pending" | "confirmed" | "failed";
  message: string;
  error?: string;
  digest?: string;
}

interface TxToastContextValue {
  toasts: Toast[];
  addToast: (id: ToastId) => void;
  confirmToast: (id: ToastId, digest?: string, customMessage?: string) => void;
  failToast: (id: ToastId, error: unknown) => void;
  removeToast: (id: ToastId) => void;
}

const TxToastContext = createContext<TxToastContextValue | null>(null);

export function TxToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((id: ToastId) => {
    setToasts((prev) => [...prev, { id, status: "pending", message: "Transaction submitted..." }]);
  }, []);

  const confirmToast = useCallback((id: ToastId, digest?: string, customMessage?: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "confirmed", message: customMessage || "Transaction confirmed", digest } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const failToast = useCallback((id: ToastId, error: unknown) => {
    setToasts((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: "failed", message: "Transaction failed", error: getErrorMessage(error) } : t
      )
    );
  }, []);

  const removeToast = useCallback((id: ToastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <TxToastContext.Provider value={{ toasts, addToast, confirmToast, failToast, removeToast }}>
      {children}
      <TxStatusToastContainer toasts={toasts} onRemove={removeToast} />
    </TxToastContext.Provider>
  );
}

export function useTxToast() {
  const ctx = useContext(TxToastContext);
  if (!ctx) {
    throw new Error("useTxToast must be used within TxToastProvider");
  }
  return ctx;
}

function TxStatusToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: ToastId) => void }) {
  const network = useCurrentNetwork();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border shadow-lg",
            toast.status === "pending" && "bg-yellow-500/20 border-yellow-500/50",
            toast.status === "confirmed" && "bg-green-500/20 border-green-500/50",
            toast.status === "failed" && "bg-red-500/20 border-red-500/50"
          )}
        >
          {toast.status === "pending" && (
            <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full" />
          )}
          {toast.status === "confirmed" && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />}
          {toast.status === "failed" && <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{toast.message}</p>
            {toast.error && <p className="text-xs text-red-300 mt-1">{toast.error}</p>}
            {toast.digest && (
              <a
                href={`https://suiscan.xyz/${network}/tx/${toast.digest}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/60 mt-0.5 font-mono hover:text-white transition-colors flex items-center gap-1 underline"
              >
                View on Suiscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="p-1 rounded hover:bg-white/10 text-white/60"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

let toastCounter = 0;
export function generateToastId(): string {
  return `toast-${Date.now()}-${++toastCounter}`;
}

export type TxStatus = "idle" | "pending" | "success" | "error";

interface TxStatusToastProps {
  status: TxStatus;
  message: string;
  digest?: string;
  onClose?: () => void;
}

export function TxStatusToast({ status, message, digest, onClose }: TxStatusToastProps) {
  const [visible, setVisible] = useState(false);
  const network = useCurrentNetwork();

  useEffect(() => {
    if (status !== "idle") {
      setVisible(true);
      // Only auto-dismiss on success; errors persist until user dismisses
      if (status === "success") {
        const timer = setTimeout(() => {
          setVisible(false);
          onClose?.();
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [status, onClose]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all min-w-[320px]",
        status === "pending" && "bg-yellow-50 border-yellow-200",
        status === "success" && "bg-green-50 border-green-200",
        status === "error" && "bg-red-50 border-red-200"
      )}
    >
      {status === "pending" && (
        <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full flex-shrink-0" />
      )}
      {status === "success" && (
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
      )}
      {status === "error" && (
        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            status === "pending" && "text-yellow-800",
            status === "success" && "text-green-800",
            status === "error" && "text-red-800"
          )}
        >
          {message}
        </p>
        {digest && (
          <a
            href={`https://suiscan.xyz/${network}/tx/${digest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground mt-0.5 font-mono hover:text-[#10b981] transition-colors flex items-center gap-1 underline"
          >
            View on Suiscan
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {status === "error" && (
          <div className="flex items-center gap-3 mt-2">
            <a
              href="https://discord.gg/paystreamer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-red-600 hover:text-red-700 hover:underline"
            >
              Need help?
            </a>
          </div>
        )}
      </div>
      {onClose && (
        <button
          onClick={() => setVisible(false)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
