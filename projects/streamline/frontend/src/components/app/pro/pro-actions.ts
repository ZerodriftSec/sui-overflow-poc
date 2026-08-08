export type ProHeaderAction =
  | "fund"
  | "withdraw"
  | "invest"
  | "analytics"
  | "compliance";

const EVENT = "sl-pro-action";

export function requestProAction(action: ProHeaderAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: action }));
}

export function onProAction(handler: (action: ProHeaderAction) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<ProHeaderAction>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
