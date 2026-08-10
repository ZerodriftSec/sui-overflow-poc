import {
  isSuiChain,
  isWalletWithRequiredFeatureSet,
  SuiSignAndExecuteTransaction,
  SuiSignTransaction,
  type WalletWithRequiredFeatures,
} from "@mysten/wallet-standard";

/**
 * EVM-only wallets that register in the browser but don't support Sui. Phantom
 * is NOT blocked — it added native Sui support, so it passes the chain + feature
 * checks below and appears when the user has Sui enabled in Phantom.
 */
const BLOCKED_WALLET_NAMES = new Set(["metamask", "coinbase wallet"]);

export function isConnectableSuiWallet(
  wallet: WalletWithRequiredFeatures
): boolean {
  const name = wallet.name.trim().toLowerCase();
  if (BLOCKED_WALLET_NAMES.has(name)) {
    return false;
  }

  const supportsSuiChain = wallet.chains.some(isSuiChain);
  if (!supportsSuiChain) {
    return false;
  }

  return (
    isWalletWithRequiredFeatureSet(wallet, [SuiSignTransaction]) ||
    isWalletWithRequiredFeatureSet(wallet, [SuiSignAndExecuteTransaction])
  );
}

export function filterConnectableSuiWallets(
  wallets: WalletWithRequiredFeatures[]
): WalletWithRequiredFeatures[] {
  return wallets.filter(isConnectableSuiWallet);
}

/** Social / zkLogin wallets first, then extension wallets. */
export function sortWalletsForConnect(
  wallets: WalletWithRequiredFeatures[]
): WalletWithRequiredFeatures[] {
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("google")) return 0;
    if (n.includes("apple")) return 1;
    if (n.includes("facebook") || n.includes("twitch")) return 2;
    return 10;
  };
  return [...wallets].sort((a, b) => rank(a.name) - rank(b.name));
}
