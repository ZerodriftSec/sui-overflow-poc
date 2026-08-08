"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import {
  clearHandleOnboardingSkip,
  getHandleOnboardingSkipEpoch,
  isHandleOnboardingSkipped,
  markHandleOnboardingSkipped,
  subscribeHandleOnboarding,
} from "./handle-onboarding";
import { useMyHandle } from "./use-handle";

/**
 * Gate for post-connect "choose name" onboarding.
 *
 * - `needsStep`: keep the onboarding shell (not the main app) mounted
 * - `showNameStep`: safe to render the claim UI (lookup finished, no handle yet)
 * - `checking`: wallet connected but reverse-lookup still in flight
 */
export function useNeedsHandleOnboarding() {
  const account = useCurrentAccount();
  const { handle, loading, ready } = useMyHandle();
  // Shared skip store — every hook instance re-renders when Skip is pressed.
  useSyncExternalStore(
    subscribeHandleOnboarding,
    getHandleOnboardingSkipEpoch,
    () => 0
  );
  const prevAddress = useRef<string | null>(null);

  useEffect(() => {
    const addr = account?.address ?? null;
    const prev = prevAddress.current;
    if (prev && !addr) {
      clearHandleOnboardingSkip(prev);
    }
    prevAddress.current = addr;
  }, [account?.address]);

  const skipped =
    !!account?.address && isHandleOnboardingSkipped(account.address);

  const complete = useCallback(() => {
    if (!account?.address) return;
    markHandleOnboardingSkipped(account.address);
  }, [account?.address]);

  if (!account) {
    return {
      needsStep: false as const,
      showNameStep: false as const,
      checking: false as const,
      loading: false,
      complete,
    };
  }

  const checking = !ready || loading;
  if (checking) {
    return {
      needsStep: true as const,
      showNameStep: false as const,
      checking: true as const,
      loading: true,
      complete,
    };
  }
  if (handle) {
    return {
      needsStep: false as const,
      showNameStep: false as const,
      checking: false as const,
      loading: false,
      complete,
    };
  }
  if (skipped) {
    return {
      needsStep: false as const,
      showNameStep: false as const,
      checking: false as const,
      loading: false,
      complete,
    };
  }
  return {
    needsStep: true as const,
    showNameStep: true as const,
    checking: false as const,
    loading: false,
    complete,
  };
}
