"use client";

import { useEffect } from "react";
import { registerEnokiWallets } from "@mysten/enoki";
import { useSuiClientContext } from "@mysten/dapp-kit";

/**
 * Registers Enoki zkLogin wallets (e.g. "Sign in with Google") with the Sui
 * wallet standard, so they appear in dApp Kit's wallet list alongside extension
 * wallets. Gated on the public Enoki key + an OAuth client id — without them
 * this no-ops and extension-wallet signing is unaffected.
 *
 * Note: this uses the *public* Enoki API key (safe in the browser). Gas
 * sponsorship is separate and runs server-side with the secret key.
 */
const ENOKI_NETWORKS = ["mainnet", "testnet", "devnet"] as const;
type EnokiNetwork = (typeof ENOKI_NETWORKS)[number];

export function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!apiKey || !googleClientId) return;
    if (!ENOKI_NETWORKS.includes(network as EnokiNetwork)) return;

    const redirectUrl =
      process.env.NEXT_PUBLIC_ZKLOGIN_REDIRECT_URL ??
      (typeof window !== "undefined"
        ? `${window.location.origin}/app`
        : undefined);

    // Enoki ships types against a newer @mysten/sui; the deduped runtime client
    // is structurally identical, so cast the options to the expected param type.
    const { unregister } = registerEnokiWallets({
      apiKey,
      providers: {
        google: { clientId: googleClientId, redirectUrl },
      },
      client,
      network: network as EnokiNetwork,
    } as unknown as Parameters<typeof registerEnokiWallets>[0]);

    return unregister;
  }, [client, network]);

  return null;
}
