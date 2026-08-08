import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionKey } from "@mysten/seal";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { createSealClient } from "../lib/walrus/seal-client";
import {
  clearCachedSessionKey,
  readCachedSessionKey,
  writeCachedSessionKey,
} from "../lib/walrus/session-key-cache";
import {
  createSignedSessionKey,
  isSessionKeyValid,
} from "../lib/walrus/session-key";
import { SEAL_SESSION_TTL_MIN } from "../lib/walrus/constants";

/** Dedupe concurrent sign prompts across multiple hook instances. */
const pendingEnsureByAddress = new Map<string, Promise<SessionKey>>();

export function useSealSession() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Promise<SessionKey> | null>(null);

  useEffect(() => {
    if (!account?.address) {
      setSessionKey(null);
      return;
    }

    const cached = readCachedSessionKey(account.address, client);
    setSessionKey((current) => {
      if (isSessionKeyValid(current, account.address)) {
        return current;
      }
      return cached;
    });
  }, [account?.address, client]);

  const ensureSessionKey = useCallback(async (): Promise<SessionKey> => {
    if (!account?.address) {
      throw new Error("Connect your wallet to access encrypted storage.");
    }

    if (isSessionKeyValid(sessionKey, account.address)) {
      return sessionKey;
    }

    const cached = readCachedSessionKey(account.address, client);
    if (cached) {
      setSessionKey(cached);
      return cached;
    }

    const inflight = pendingEnsureByAddress.get(account.address);
    if (inflight) {
      const key = await inflight;
      setSessionKey(key);
      return key;
    }

    if (pendingRef.current) {
      return pendingRef.current;
    }

    setLoading(true);
    setError(null);

    const promise = createSignedSessionKey({
      address: account.address,
      suiClient: client,
      ttlMin: SEAL_SESSION_TTL_MIN,
      signPersonalMessage: async (message) => {
        const result = await dAppKit.signPersonalMessage({ message });
        return { signature: result.signature };
      },
    })
      .then((key) => {
        writeCachedSessionKey(key);
        setSessionKey(key);
        return key;
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to create Seal session.";
        setError(message);
        throw err;
      })
      .finally(() => {
        setLoading(false);
        pendingRef.current = null;
        pendingEnsureByAddress.delete(account.address);
      });

    pendingRef.current = promise;
    pendingEnsureByAddress.set(account.address, promise);
    return promise;
  }, [account?.address, client, dAppKit, sessionKey]);

  const clearSession = useCallback(() => {
    if (account?.address) {
      clearCachedSessionKey(account.address);
    }
    setSessionKey(null);
    setError(null);
  }, [account?.address]);

  const sealClient = useMemo(() => createSealClient(client), [client]);

  return {
    sessionKey,
    loading,
    error,
    ensureSessionKey,
    clearSession,
    sealClient,
    account,
    client,
  };
}
