export type ToastType = "loading" | "success" | "error";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type ToastListener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<ToastListener>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notify(): void {
  const snapshot = [...toasts];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export function showToast(type: ToastType, message: string): string {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, type, message }];
  notify();
  return id;
}

export function updateToast(
  id: string,
  patch: Partial<Pick<Toast, "type" | "message">>,
): void {
  toasts = toasts.map((toast) =>
    toast.id === id ? { ...toast, ...patch } : toast,
  );
  notify();
}

export function dismissToast(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  toasts = toasts.filter((toast) => toast.id !== id);
  notify();
}

export function dismissToastAfter(id: string, ms: number): void {
  const existing = dismissTimers.get(id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    dismissTimers.delete(id);
    dismissToast(id);
  }, ms);
  dismissTimers.set(id, timer);
}

export function showSavingToast(title: string): string {
  return showToast("loading", `Saving "${title}"…`);
}

export function completeSaveToast(id: string, title: string): void {
  updateToast(id, { type: "success", message: `"${title}" saved` });
  dismissToastAfter(id, 3000);
}

export function failSaveToast(id: string, message: string): void {
  updateToast(id, {
    type: "error",
    message: message || "Failed to save script",
  });
  dismissToastAfter(id, 5000);
}
