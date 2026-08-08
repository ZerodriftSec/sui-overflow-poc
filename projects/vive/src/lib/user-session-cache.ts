import { clearAgentConversationIndexCache } from "./agent-conversation";
import { clearProjectsCache } from "./project";
import { clearAllPathCaches } from "./storage/path-cache";
import { clearAllCachedSessionKeys } from "./walrus/session-key-cache";

const SESSION_WALLET_KEY = "content-studio-session-wallet";

export function getSessionWalletAddress(): string | null {
  return localStorage.getItem(SESSION_WALLET_KEY);
}

export function bindSessionWalletAddress(address: string): void {
  localStorage.setItem(SESSION_WALLET_KEY, address);
}

export function clearUserSessionCache(): void {
  clearProjectsCache();
  clearAgentConversationIndexCache();
  clearAllCachedSessionKeys();
  clearAllPathCaches();
  localStorage.removeItem(SESSION_WALLET_KEY);
}

export function reconcileSessionWallet(address: string): boolean {
  const sessionWallet = getSessionWalletAddress();
  if (sessionWallet && sessionWallet !== address) {
    clearUserSessionCache();
    bindSessionWalletAddress(address);
    return true;
  }

  if (!sessionWallet) {
    bindSessionWalletAddress(address);
  }

  return false;
}
