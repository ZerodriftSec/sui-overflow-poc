import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { subscribePathIndexWrites } from "../lib/storage/walrus-storage";
import type { WalrusStorageContext } from "../lib/storage/walrus-storage";
import {
  WorkspaceStorageNotFoundError,
  type VaultContext,
} from "../lib/vault";
import type { CatalogAssetRef } from "../lib/asset-catalog";
import { useSealSession } from "../hooks/useSealSession";
import { useVaultContext } from "../hooks/useVaultContext";
import { isSessionKeyValid } from "../lib/walrus/session-key";
import { readCachedSessionKey } from "../lib/walrus/session-key-cache";

export interface WalrusStorageValue {
  ready: boolean;
  loading: boolean;
  storageWriteBusy: boolean;
  projectAssetRefreshKey: number;
  error: string | null;
  vault: VaultContext | null;
  optimisticProjectAssetRefs: CatalogAssetRef[];
  getStorageContext: () => Promise<WalrusStorageContext>;
  ensureVault: () => Promise<VaultContext>;
  ensureSessionKey: ReturnType<typeof useSealSession>["ensureSessionKey"];
  hasValidSessionKey: boolean;
  refreshProjectAssets: () => void;
  upsertOptimisticProjectAsset: (ref: CatalogAssetRef) => void;
  removeOptimisticProjectAsset: (id: string) => void;
  pruneOptimisticProjectAssets: (ids: string[]) => void;
}

const WalrusStorageContext = createContext<WalrusStorageValue | null>(null);

export function WalrusStorageProvider({ children }: { children: ReactNode }) {
  const vaultCtx = useVaultContext();
  const sealCtx = useSealSession();
  const [storageWriteBusy, setStorageWriteBusy] = useState(false);
  const [projectAssetRefreshKey, setProjectAssetRefreshKey] = useState(0);
  const [optimisticProjectAssetRefs, setOptimisticProjectAssetRefs] = useState<
    CatalogAssetRef[]
  >([]);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribePathIndexWrites(setStorageWriteBusy), []);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, []);

  const refreshProjectAssets = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      setProjectAssetRefreshKey((key) => key + 1);
    }, 400);
  }, []);

  const upsertOptimisticProjectAsset = useCallback((ref: CatalogAssetRef) => {
    setOptimisticProjectAssetRefs((current) => {
      const existingIndex = current.findIndex((item) => item.id === ref.id);
      if (existingIndex === -1) {
        return [...current, ref];
      }
      return current.map((item, index) => (index === existingIndex ? ref : item));
    });
  }, []);

  const removeOptimisticProjectAsset = useCallback((id: string) => {
    setOptimisticProjectAssetRefs((current) =>
      current.filter((item) => item.id !== id),
    );
  }, []);

  const pruneOptimisticProjectAssets = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setOptimisticProjectAssetRefs((current) =>
      current.filter((item) => !idSet.has(item.id)),
    );
  }, []);

  const ready = Boolean(
    vaultCtx.vault && vaultCtx.account?.address && sealCtx.account?.address,
  );

  const hasValidSessionKey = useMemo(() => {
    const address = sealCtx.account?.address;
    if (!address) {
      return false;
    }

    if (isSessionKeyValid(sealCtx.sessionKey, address)) {
      return true;
    }

    return readCachedSessionKey(address, vaultCtx.client) !== null;
  }, [sealCtx.account?.address, sealCtx.sessionKey, vaultCtx.client]);

  const getStorageContext = useCallback(async (): Promise<WalrusStorageContext> => {
    // Use the vault already loaded in state. Fall back to loadVault() to handle
    // the brief race on initial mount, but never create a vault here — reads
    // should not trigger on-chain transactions. Write paths (flushSaveQueue,
    // beginSession) must call ensureVault() explicitly before calling this.
    const vault = vaultCtx.vault ?? await vaultCtx.loadVault();
    if (!vault) {
      throw new WorkspaceStorageNotFoundError();
    }
    const sessionKey = await sealCtx.ensureSessionKey();

    return {
      vault,
      sealClient: sealCtx.sealClient,
      sessionKey,
      suiClient: vaultCtx.client,
      signAndExecute: vaultCtx.signAndExecute,
    };
  }, [
    sealCtx.ensureSessionKey,
    sealCtx.sealClient,
    vaultCtx.client,
    vaultCtx.loadVault,
    vaultCtx.vault,
    vaultCtx.signAndExecute,
  ]);

  const value = useMemo(
    (): WalrusStorageValue => ({
      ready,
      loading: vaultCtx.loading || sealCtx.loading,
      storageWriteBusy,
      projectAssetRefreshKey,
      error: vaultCtx.error ?? sealCtx.error,
      vault: vaultCtx.vault,
      optimisticProjectAssetRefs,
      getStorageContext,
      ensureVault: vaultCtx.ensureVault,
      ensureSessionKey: sealCtx.ensureSessionKey,
      hasValidSessionKey,
      refreshProjectAssets,
      upsertOptimisticProjectAsset,
      removeOptimisticProjectAsset,
      pruneOptimisticProjectAssets,
    }),
    [
      ready,
      vaultCtx.loading,
      vaultCtx.error,
      vaultCtx.vault,
      vaultCtx.ensureVault,
      sealCtx.loading,
      sealCtx.error,
      sealCtx.ensureSessionKey,
      hasValidSessionKey,
      getStorageContext,
      storageWriteBusy,
      projectAssetRefreshKey,
      optimisticProjectAssetRefs,
      refreshProjectAssets,
      upsertOptimisticProjectAsset,
      removeOptimisticProjectAsset,
      pruneOptimisticProjectAssets,
    ],
  );

  return (
    <WalrusStorageContext.Provider value={value}>
      {children}
    </WalrusStorageContext.Provider>
  );
}

export function useWalrusStorage(): WalrusStorageValue {
  const value = useContext(WalrusStorageContext);
  if (!value) {
    throw new Error("useWalrusStorage must be used within WalrusStorageProvider");
  }
  return value;
}
