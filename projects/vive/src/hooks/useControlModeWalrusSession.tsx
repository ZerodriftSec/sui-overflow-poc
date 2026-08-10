import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  createDeferredWalrusStorageContext,
  flushDeferredWalrusWrites,
  hasDeferredWalrusWrites,
  isOnChainFlushError,
  type WalrusStorageContext,
} from "../lib/storage/walrus-storage";
import { useWalrusStorage } from "./useWalrusStorage";

export interface ControlModeWalrusSessionValue {
  beginSession: () => Promise<void>;
  commitSession: () => Promise<void>;
  isSessionActive: () => boolean;
  getWriteContext: () => Promise<WalrusStorageContext>;
  runWithSession: <T>(operation: () => Promise<T>) => Promise<T>;
}

const ControlModeWalrusSessionContext =
  createContext<ControlModeWalrusSessionValue | null>(null);

export function ControlModeWalrusSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const walrusStorage = useWalrusStorage();
  const sessionContextRef = useRef<WalrusStorageContext | null>(null);
  const sessionDepthRef = useRef(0);

  const beginSession = useCallback(async () => {
    if (sessionDepthRef.current === 0) {
      await walrusStorage.ensureVault();
      const baseCtx = await walrusStorage.getStorageContext();
      sessionContextRef.current = createDeferredWalrusStorageContext(baseCtx);
    }
    sessionDepthRef.current += 1;
  }, [walrusStorage.ensureVault, walrusStorage.getStorageContext]);

  const commitSession = useCallback(async () => {
    sessionDepthRef.current = Math.max(0, sessionDepthRef.current - 1);
    if (sessionDepthRef.current > 0) {
      return;
    }

    const ctx = sessionContextRef.current;
    if (!ctx) {
      return;
    }

    try {
      if (hasDeferredWalrusWrites(ctx)) {
        await flushDeferredWalrusWrites(ctx);
      }
      sessionContextRef.current = null;
      walrusStorage.refreshProjectAssets();
    } catch (error) {
      if (!isOnChainFlushError(error)) {
        sessionContextRef.current = null;
      }
      throw error;
    }
  }, [walrusStorage.refreshProjectAssets]);

  const isSessionActive = useCallback(() => {
    return sessionDepthRef.current > 0;
  }, []);

  const getWriteContext = useCallback(async (): Promise<WalrusStorageContext> => {
    if (sessionContextRef.current) {
      return sessionContextRef.current;
    }

    // Outside an active session, writes must land immediately — a deferred
    // context here would never be flushed.
    return walrusStorage.getStorageContext();
  }, [walrusStorage.getStorageContext]);

  const runWithSession = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      await beginSession();
      try {
        return await operation();
      } finally {
        try {
          await commitSession();
        } catch (error) {
          if (!isOnChainFlushError(error)) {
            throw error;
          }
        }
      }
    },
    [beginSession, commitSession],
  );

  const value = useMemo(
    (): ControlModeWalrusSessionValue => ({
      beginSession,
      commitSession,
      isSessionActive,
      getWriteContext,
      runWithSession,
    }),
    [beginSession, commitSession, getWriteContext, isSessionActive, runWithSession],
  );

  return (
    <ControlModeWalrusSessionContext.Provider value={value}>
      {children}
    </ControlModeWalrusSessionContext.Provider>
  );
}

export function useControlModeWalrusSessionOptional(): ControlModeWalrusSessionValue | null {
  return useContext(ControlModeWalrusSessionContext);
}

export function useControlModeWalrusSession(): ControlModeWalrusSessionValue {
  const value = useContext(ControlModeWalrusSessionContext);
  if (!value) {
    throw new Error(
      "useControlModeWalrusSession must be used within ControlModeWalrusSessionProvider",
    );
  }
  return value;
}

/** Run a write inside the active session, or open a short session that commits on exit. */
export async function runControlModePersist<T>(
  session: ControlModeWalrusSessionValue,
  operation: (ctx: WalrusStorageContext) => Promise<T>,
): Promise<T> {
  if (session.isSessionActive()) {
    const ctx = await session.getWriteContext();
    return operation(ctx);
  }

  return session.runWithSession(async () => {
    const ctx = await session.getWriteContext();
    return operation(ctx);
  });
}

/**
 * Persist using the active control-mode session, or commit via a short session.
 * Resolves only after deferred on-chain file mutations have been flushed.
 */
export async function persistWithControlModeWalrusPolicy<T>(
  session: ControlModeWalrusSessionValue | null,
  getStorageContext: () => Promise<WalrusStorageContext>,
  operation: (ctx: WalrusStorageContext) => Promise<T>,
): Promise<T> {
  if (session) {
    return runControlModePersist(session, operation);
  }

  const ctx = createDeferredWalrusStorageContext(await getStorageContext());
  const result = await operation(ctx);
  if (hasDeferredWalrusWrites(ctx)) {
    try {
      await flushDeferredWalrusWrites(ctx);
    } catch (error) {
      if (!isOnChainFlushError(error)) {
        throw error;
      }
    }
  }
  return result;
}
