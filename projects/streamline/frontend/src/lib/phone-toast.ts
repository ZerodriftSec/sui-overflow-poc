/**
 * Lightweight hot-toast-style notifications. Prefer the phone stage when
 * present so toasts stay clipped inside the mockup / embedded shell.
 */

export type PhoneToastKind = "error" | "success" | "blank";

export type PhoneToastItem = {
  id: number;
  message: string;
  kind: PhoneToastKind;
};

type Listener = () => void;

let seq = 0;
let items: PhoneToastItem[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l();
}

function push(kind: PhoneToastKind, message: string, durationMs = 3400) {
  const trimmed = message.trim();
  if (!trimmed) return;
  const id = ++seq;
  items = [...items, { id, message: trimmed, kind }];
  emit();
  const t = setTimeout(() => dismiss(id), durationMs);
  timers.set(id, t);
}

function dismiss(id: number) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function dismissPhoneToast(id: number) {
  dismiss(id);
}

export const phoneToast = {
  error: (message: string) => push("error", message),
  success: (message: string) => push("success", message, 2800),
  message: (message: string) => push("blank", message),
};

export function subscribePhoneToasts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPhoneToasts() {
  return items;
}

export function getPhoneToastsServer(): PhoneToastItem[] {
  return [];
}
