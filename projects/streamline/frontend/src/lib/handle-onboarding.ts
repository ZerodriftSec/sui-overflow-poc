/**
 * In-memory "skipped name step" for the current wallet connection.
 * Cleared on disconnect so logging in again shows choose-name.
 * Subscribers re-render when skip changes (all hook instances stay in sync).
 */

type Listener = () => void;

const skipped = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

/** Legacy keys from earlier builds — wipe so they can't auto-skip. */
function clearLegacyStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("sl-handle-onboarded");
    window.sessionStorage.removeItem("sl-handle-onboard-skipped");
  } catch {
    /* ignore */
  }
}

export function subscribeHandleOnboarding(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHandleOnboardingSkipEpoch() {
  return skipped.size;
}

export function isHandleOnboardingSkipped(
  address: string | null | undefined
): boolean {
  if (!address) return false;
  clearLegacyStorage();
  return skipped.has(address.toLowerCase());
}

export function markHandleOnboardingSkipped(address: string) {
  clearLegacyStorage();
  skipped.add(address.toLowerCase());
  emit();
}

export function clearHandleOnboardingSkip(address?: string | null) {
  if (address) skipped.delete(address.toLowerCase());
  else skipped.clear();
  emit();
}
