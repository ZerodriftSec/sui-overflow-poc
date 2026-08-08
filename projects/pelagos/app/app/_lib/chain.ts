"use client";

export const CHAIN = (process.env.NEXT_PUBLIC_CHAIN ?? "sui").toLowerCase();
export const IS_SUI = CHAIN === "sui";

export const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

// NOTE: the active wallet address always comes from the connected dapp-kit
// account (see wallet-bridge `useActiveWalletAddress`). There is intentionally
// no env/hardcoded address fallback — a disconnected app shows the connect state.

// suiexplorer.com was sunset; Suiscan is the live explorer (matches the backend).
export function suiExplorerTxUrl(digest: string): string {
  return `https://suiscan.xyz/${SUI_NETWORK}/tx/${digest}`;
}

/**
 * Map a raw wallet/RPC signing error to a clear, actionable message.
 *
 * IMPORTANT: this ALWAYS logs the raw error to the console first. The friendly
 * strings below deliberately hide low-level detail from the UI, but that detail
 * is exactly what's needed to diagnose a signing failure — so it must never be
 * swallowed silently (the previous version masked every error containing the
 * substring "sign", which hid genuine MoveAbort / gas / object-version errors
 * behind a generic "reconnect your wallet" message).
 *
 * "Incorrect password" / "could not decrypt" come from the WALLET EXTENSION's
 * own lock screen (e.g. Slush), not from Pelagos — the dApp only ever requests
 * a signature, it never sees or checks your wallet password.
 */
export function friendlyWalletError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  let msg = raw;
  if (!msg) {
    try {
      msg = JSON.stringify(err) ?? "";
    } catch {
      msg = "";
    }
  }
  // Never swallow the underlying error — surface it for diagnosis.
  if (typeof console !== "undefined") {
    console.error("[wallet] signing/execution error (raw):", err);
  }
  if (/user rejected|rejected the request|user cancel|rejection/i.test(msg)) {
    return "Transaction was rejected in your wallet.";
  }
  if (/insufficient/i.test(msg)) return msg;
  // Wrong network is the most common opaque signing failure: the dApp is on
  // testnet, but the wallet's active account/network is mainnet, so the objects
  // the transaction references don't exist there and the signer fails.
  if (/wrong network|unsupported chain|chain mismatch|unknown chain|does not match.*chain|not.*testnet/i.test(msg)) {
    return "Your wallet looks like it's on the wrong network. Switch it to Sui testnet, then try again.";
  }
  // Truly opaque wallet error (the `{}` some wallets throw when they can't
  // process a transaction) or a wallet lock / stale-session error. These carry
  // no actionable detail, so give generic, wallet-type-agnostic recovery
  // guidance — works for seed-phrase, hardware, and social/zkLogin wallets.
  if (
    !msg ||
    msg === "{}" ||
    msg === "[object Object]" ||
    /incorrect password|could not decrypt|failed to decrypt|wallet is locked|account is locked|session (expired|not found|invalid)/i.test(msg)
  ) {
    return "Your wallet couldn't sign the transaction. Make sure it's unlocked and on Sui testnet with a little SUI for gas, then try again. If it persists, disconnect and reconnect (for a Google / social login, re-login to refresh the session).";
  }
  // Anything else: return the real message — a MoveAbort, gas error, or
  // object-version conflict is far more useful than a generic string.
  return msg;
}
