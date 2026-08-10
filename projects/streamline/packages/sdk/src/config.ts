/**
 * Network + package config for StreamLine. Safe in Node and browsers.
 * Reads optional env overrides (STREAMLINE_* or NEXT_PUBLIC_*).
 */

function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name]?.trim();
  return v || undefined;
}

// Latest package version (move-call target). Upgraded 2026-07-20 (v7) to add
// private_stream::open_engagement_v2 + pause_engagement / resume_engagement
// (on-chain vesting freeze for private hires). Type origin stays 0x597f34fe…
// (ORIGINAL_PACKAGE_IDS), so object types + the indexer are unaffected.
// pos::PosPaid's type origin stays 0x05affbed… (POS_DEFINING_PACKAGE).
const TESTNET_PACKAGE =
  "0x67b337d6f054594cd983a4490a5f346900caf09db0e334d349b2a9babcbd2811";

export const PACKAGE_IDS = {
  mainnet:
    env("STREAMLINE_PACKAGE_ID_MAINNET") ??
    env("NEXT_PUBLIC_PACKAGE_ID_MAINNET") ??
    "0x0",
  testnet:
    env("STREAMLINE_PACKAGE_ID_TESTNET") ??
    env("NEXT_PUBLIC_PACKAGE_ID_TESTNET") ??
    TESTNET_PACKAGE,
  devnet: "0x0",
} as const;

export const TEST_USDC = {
  packageId:
    "0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3",
  treasuryId:
    "0xa7cb971f4f93e5713c5703f63f3bc17fdf0f6bf1f9795dc010ac164827715330",
  coinType:
    "0xf6ce32fe48338464f3947b9d15cd4a0befa0fe9b3926fd9daf6cee3658482ed3::mock_usdc::MOCK_USDC",
} as const;

export const USDC_TYPE = {
  mainnet:
    env("STREAMLINE_USDC_TYPE_MAINNET") ??
    env("NEXT_PUBLIC_USDC_TYPE_MAINNET") ??
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  testnet:
    env("STREAMLINE_USDC_TYPE_TESTNET") ??
    env("NEXT_PUBLIC_USDC_TYPE_TESTNET") ??
    TEST_USDC.coinType,
  devnet: "0x2::sui::SUI",
} as const;

export const FULLNODE_URLS = {
  mainnet:
    env("STREAMLINE_SUI_MAINNET_RPC") ??
    env("NEXT_PUBLIC_SUI_MAINNET_RPC") ??
    "https://fullnode.mainnet.sui.io:443",
  testnet:
    env("STREAMLINE_SUI_TESTNET_RPC") ??
    env("NEXT_PUBLIC_SUI_TESTNET_RPC") ??
    // Fallback for server routes: Next doesn't expose NEXT_PUBLIC_* to the
    // dynamic env() read above at runtime, and the official testnet fullnode's
    // JSON-RPC is deprecated (returns 400/404). Suiscan serves full JSON-RPC
    // (reads, execute, and sui_verifyZkLoginSignature — all verified).
    "https://rpc-testnet.suiscan.xyz",
  devnet:
    env("STREAMLINE_SUI_DEVNET_RPC") ??
    env("NEXT_PUBLIC_SUI_DEVNET_RPC") ??
    "https://fullnode.devnet.sui.io:443",
} as const;

export const DEFAULT_INDEXER_URL =
  env("STREAMLINE_INDEXER_URL") ??
  env("NEXT_PUBLIC_INDEXER_URL") ??
  "http://localhost:8080";

export type NetworkName = keyof typeof PACKAGE_IDS;

export type NetworkConfig = {
  network: NetworkName;
  packageId: string;
  usdcType: string;
  fullnodeUrl: string;
  indexerUrl: string;
  /** Parent SuiNS domain, e.g. `streamline.sui`. */
  suinsDomain: string;
};

export type NetworkOverrides = Partial<
  Omit<NetworkConfig, "network">
>;

/** Resolve effective config for a network. */
export function resolveNetworkConfig(
  network: NetworkName = "testnet",
  overrides: NetworkOverrides = {}
): NetworkConfig {
  const domain =
    overrides.suinsDomain ??
    env("STREAMLINE_SUINS_DOMAIN") ??
    env("NEXT_PUBLIC_SUINS_DOMAIN") ??
    "streamline.sui";
  const normalized = domain.endsWith(".sui") ? domain : `${domain}.sui`;

  return {
    network,
    packageId: overrides.packageId ?? PACKAGE_IDS[network],
    usdcType: overrides.usdcType ?? USDC_TYPE[network],
    fullnodeUrl: overrides.fullnodeUrl ?? FULLNODE_URLS[network],
    indexerUrl: (overrides.indexerUrl ?? DEFAULT_INDEXER_URL).replace(
      /\/$/,
      ""
    ),
    suinsDomain: normalized,
  };
}
