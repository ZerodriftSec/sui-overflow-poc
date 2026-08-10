import { useWalletSessionCleanup } from "../hooks/useWalletSessionCleanup";

export function WalletSessionManager() {
  useWalletSessionCleanup();
  return null;
}
