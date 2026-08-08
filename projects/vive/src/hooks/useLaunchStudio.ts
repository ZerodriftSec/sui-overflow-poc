import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWalrusStorage } from "./useWalrusStorage";

export function useLaunchStudio(redirectTo = "/app") {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { ensureSessionKey, hasValidSessionKey, loading } = useWalrusStorage();

  const launchStudio = useCallback(async (): Promise<boolean> => {
    if (!account?.address) {
      return false;
    }

    if (hasValidSessionKey) {
      navigate(redirectTo, { replace: true });
      return true;
    }

    try {
      await ensureSessionKey();
      navigate(redirectTo, { replace: true });
      return true;
    } catch {
      return false;
    }
  }, [
    account?.address,
    ensureSessionKey,
    hasValidSessionKey,
    navigate,
    redirectTo,
  ]);

  return {
    isConnected: Boolean(account),
    isAuthenticated: hasValidSessionKey,
    launchStudio,
    loading,
  };
}
