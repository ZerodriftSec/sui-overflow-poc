import {
  isConfigured,
  isStorageConfigured,
  type AppSettings,
} from "./settings";

export type SetupStep = "wallet" | "api-key" | "ready";

const SETUP_MODAL_DISMISSED_KEY = "vive-setup-modal-dismissed";
const SETUP_BANNER_DISMISSED_KEY = "vive-setup-banner-dismissed";

export interface SetupState {
  hasWallet: boolean;
  hasApiKey: boolean;
  isReady: boolean;
  needsApiKey: boolean;
  step: SetupStep;
}

export function getSetupState(
  walletAddress: string | null | undefined,
  settings: AppSettings,
): SetupState {
  const hasWallet = Boolean(walletAddress?.trim());
  const hasApiKey = isConfigured(settings);
  const isReady = isStorageConfigured(settings, walletAddress);

  let step: SetupStep = "ready";
  if (!hasWallet) {
    step = "wallet";
  } else if (!hasApiKey) {
    step = "api-key";
  }

  return {
    hasWallet,
    hasApiKey,
    isReady,
    needsApiKey: hasWallet && !hasApiKey,
    step,
  };
}

export function isSetupModalDismissed(): boolean {
  try {
    return sessionStorage.getItem(SETUP_MODAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissSetupModal(): void {
  try {
    sessionStorage.setItem(SETUP_MODAL_DISMISSED_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

export function isSetupBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(SETUP_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissSetupBanner(): void {
  try {
    sessionStorage.setItem(SETUP_BANNER_DISMISSED_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

export function clearSetupDismissals(): void {
  try {
    sessionStorage.removeItem(SETUP_MODAL_DISMISSED_KEY);
    sessionStorage.removeItem(SETUP_BANNER_DISMISSED_KEY);
  } catch {
    // ignore storage failures
  }
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<void> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed (${response.status}).`);
  }
}

export const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";
