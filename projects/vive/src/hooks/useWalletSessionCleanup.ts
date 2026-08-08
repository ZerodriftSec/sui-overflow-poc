import { useWalletConnection } from "@mysten/dapp-kit-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearUserSessionCache,
  reconcileSessionWallet,
} from "../lib/user-session-cache";
import { clearProjectManifestMemoryCache } from "../lib/workspace";

export function useWalletSessionCleanup(): void {
  const connection = useWalletConnection();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const previousAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const address = connection.account?.address ?? null;
    const previousAddress = previousAddressRef.current;

    let sessionCleared = false;

    if (address) {
      sessionCleared = reconcileSessionWallet(address);
    } else if (previousAddress) {
      clearUserSessionCache();
      clearProjectManifestMemoryCache();
      sessionCleared = true;
    }

    if (sessionCleared) {
      clearProjectManifestMemoryCache();
      queryClient.clear();
      if (address) {
        navigate("/app", { replace: true });
      }
    }

    previousAddressRef.current = address;
  }, [connection.account?.address, navigate, queryClient]);
}
