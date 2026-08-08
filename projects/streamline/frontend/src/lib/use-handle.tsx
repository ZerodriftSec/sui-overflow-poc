"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useCurrentAccount,
  useCurrentWallet,
  useSuiClient,
  useSuiClientContext,
  useSignPersonalMessage,
} from "@mysten/dapp-kit";

import {
  claimHandle,
  fetchOwnedHandle,
  cacheOwnedHandle,
  cachedBareHandle,
  fullHandleName,
} from "./claim-handle";
import {
  formatHandle,
  isStreamlineHandle,
  normalizeHandle,
  normalizeReasonMessage,
  suinsConfigured,
} from "./handle";
import { isHandleTakenOnChain, reverseResolveHandle } from "./suins";

export type MyHandleValue = {
  handle: string | null;
  /** False until the first reverse-lookup for the current address finishes. */
  ready: boolean;
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  refresh: () => Promise<void>;
  claim: (raw: string) => Promise<{
    handle: string;
    displayName: string;
    status: string;
  }>;
  configured: boolean;
};

const HandleContext = createContext<MyHandleValue | null>(null);

function useMyHandleState(): MyHandleValue {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [handle, setHandle] = useState<string | null>(null);
  const [ready, setReady] = useState(() => !account?.address);
  const [loading, setLoading] = useState(() => !!account?.address);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account?.address) {
      setHandle(null);
      setLoading(false);
      setReady(true);
      return;
    }
    setHandle(null);
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      const fromChain = await reverseResolveHandle(client, account.address);
      // Only StreamLine @handles count — a random .sui name must not skip onboarding.
      if (fromChain && isStreamlineHandle(fromChain)) {
        setHandle(fromChain);
        return;
      }
      // Leaf subnames don't reverse-resolve; fall back to the local cache, but
      // forward-verify it still points to us before trusting it.
      const cachedBare = cachedBareHandle(account.address);
      if (cachedBare) {
        const target = await client
          .resolveNameServiceAddress({ name: fullHandleName(cachedBare) })
          .catch(() => null);
        if (target && target.toLowerCase() === account.address.toLowerCase()) {
          setHandle(formatHandle(cachedBare));
          return;
        }
      }
      const fromEnoki = await fetchOwnedHandle({
        address: account.address,
        network,
      });
      setHandle(fromEnoki);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [account?.address, client, network]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const claim = useCallback(
    async (raw: string) => {
      if (!account?.address) throw new Error("Connect a wallet first.");
      setError(null);
      const result = await claimHandle({
        handle: raw,
        address: account.address,
        network,
        client,
        wallet: currentWallet ?? null,
        signPersonalMessage: async (message) => {
          const out = await signPersonalMessage({ message });
          return { signature: out.signature };
        },
      });
      setHandle(result.displayName);
      return result;
    },
    [account?.address, network, client, currentWallet, signPersonalMessage]
  );

  return useMemo(
    () => ({
      handle,
      ready,
      loading,
      error,
      setError,
      refresh,
      claim,
      configured: suinsConfigured(),
    }),
    [handle, ready, loading, error, refresh, claim]
  );
}

/** Single shared handle state for the whole tree (avoids desynced lookups). */
export function HandleProvider({ children }: { children: ReactNode }) {
  const value = useMyHandleState();
  return (
    <HandleContext.Provider value={value}>{children}</HandleContext.Provider>
  );
}

/**
 * Current user's StreamLine handle (reverse SuiNS / Enoki), plus claim helpers.
 * Must be used under {@link HandleProvider}.
 */
export function useMyHandle(): MyHandleValue {
  const ctx = useContext(HandleContext);
  if (!ctx) {
    throw new Error("useMyHandle must be used within HandleProvider");
  }
  return ctx;
}

/** Debounced availability check for the claim form. */
export function useHandleAvailability(raw: string) {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const [state, setState] = useState<{
    checking: boolean;
    available: boolean | null;
    message: string | null;
    handle: string | null;
  }>({ checking: false, available: null, message: null, handle: null });

  useEffect(() => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setState({
        checking: false,
        available: null,
        message: null,
        handle: null,
      });
      return;
    }

    const parsed = normalizeHandle(trimmed);
    if (!parsed.ok) {
      setState({
        checking: false,
        available: false,
        message: normalizeReasonMessage(parsed.reason),
        handle: null,
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({
      ...s,
      checking: true,
      message: null,
      handle: parsed.handle,
    }));
    const t = window.setTimeout(async () => {
      try {
        const taken = await isHandleTakenOnChain(client, parsed.handle);
        if (cancelled) return;
        // "Taken" by *you* isn't taken — leaf subnames don't reverse-resolve, so
        // check the forward record and treat a self-owned name as claimable.
        if (taken && account?.address) {
          const target = await client
            .resolveNameServiceAddress({ name: fullHandleName(parsed.handle) })
            .catch(() => null);
          if (cancelled) return;
          if (target && target.toLowerCase() === account.address.toLowerCase()) {
            cacheOwnedHandle(account.address, parsed.handle);
            setState({
              checking: false,
              available: true,
              message: `${formatHandle(parsed.handle)} is already yours ✓`,
              handle: parsed.handle,
            });
            return;
          }
        }
        setState({
          checking: false,
          available: !taken,
          message: taken
            ? "That handle is already taken."
            : `${formatHandle(parsed.handle)} is available`,
          handle: parsed.handle,
        });
      } catch {
        if (cancelled) return;
        setState({
          checking: false,
          available: null,
          message: "Could not check availability.",
          handle: parsed.handle,
        });
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [raw, client, account?.address]);

  return state;
}
