export type WalletOAuthProvider = "google" | "facebook" | "twitch";

export function getWalletOAuthProvider(
  walletName: string,
): WalletOAuthProvider | null {
  const normalized = walletName.toLowerCase();

  if (normalized.includes("google")) return "google";
  if (normalized.includes("facebook")) return "facebook";
  if (normalized.includes("twitch")) return "twitch";

  return null;
}
