import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getFailedOnChainFlush,
  retryFailedOnChainFlush,
  subscribeFailedOnChainFlush,
  type FailedOnChainFlush,
} from "../lib/storage/walrus-storage";
import { useWalrusStorage } from "./useWalrusStorage";

interface UseOnChainFlushRetryResult {
  failure: FailedOnChainFlush | null;
  isRetrying: boolean;
  retry: () => Promise<void>;
}

function subscribe(_projectId: string) {
  return (listener: () => void) => subscribeFailedOnChainFlush(listener);
}

function getSnapshot(projectId: string): FailedOnChainFlush | null {
  return getFailedOnChainFlush(projectId);
}

export function useOnChainFlushRetry(projectId: string): UseOnChainFlushRetryResult {
  const walrusStorage = useWalrusStorage();
  const [isRetrying, setIsRetrying] = useState(false);
  const failure = useSyncExternalStore(
    subscribe(projectId),
    () => getSnapshot(projectId),
    () => null,
  );

  useEffect(() => {
    if (!failure) {
      setIsRetrying(false);
    }
  }, [failure]);

  const retry = useCallback(async () => {
    if (!getFailedOnChainFlush(projectId)) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryFailedOnChainFlush(projectId);
      walrusStorage.refreshProjectAssets();
    } finally {
      setIsRetrying(false);
    }
  }, [projectId, walrusStorage.refreshProjectAssets]);

  return { failure, isRetrying, retry };
}
