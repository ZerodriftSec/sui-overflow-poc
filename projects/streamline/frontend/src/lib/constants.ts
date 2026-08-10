/**
 * Pure network constants — deliberately free of any `@mysten/dapp-kit` import so
 * this module is safe to load in server route handlers (the Enoki sponsorship
 * proxy) as well as client components. `networks.ts` builds the dApp Kit network
 * config on top of these.
 *
 * Package / USDC / fullnode IDs are shared with `@streamline/sdk`.
 */

export {
  PACKAGE_IDS,
  TEST_USDC,
  USDC_TYPE,
  FULLNODE_URLS,
  type NetworkName,
} from "@streamline/sdk";

import type { NetworkName } from "@streamline/sdk";

/**
 * The *original* (v1) package ids. Object types and Seal's identity namespace
 * are pinned to the first version of a package, so Seal encryption and
 * SessionKeys must use these even though move calls target the latest version.
 */
export const ORIGINAL_PACKAGE_IDS = {
  mainnet: process.env.NEXT_PUBLIC_PACKAGE_ID_MAINNET ?? "0x0",
  // Fresh publish → original == latest (no prior version to pin types to).
  testnet:
    "0x597f34fee3b246cbabdb8b8133c4b5e7aa5a15899e74df40acf61080b776a794",
  devnet: "0x0",
} as const;

/**
 * The package version that *defined* the confidential types (v2). Sui pins a
 * struct's type address to the version that introduced it, so
 * `ConfidentialStream` objects and `ConfStreamCreated` events carry this id.
 */
export const CONF_DEFINING_PACKAGE_IDS = {
  mainnet: process.env.NEXT_PUBLIC_PACKAGE_ID_MAINNET ?? "0x0",
  testnet:
    "0x597f34fee3b246cbabdb8b8133c4b5e7aa5a15899e74df40acf61080b776a794",
  devnet: "0x0",
} as const;

/**
 * The package version that *defined* `private_stream` (EngagementOpened /
 * EngagementSettled). private_stream was added in an upgrade AFTER the original
 * publish, so its event type-origin is this middle version — NOT the original
 * (0x597f34fe, no private_stream) and NOT the latest package. `EngagementSettled`
 * inserts two shielded leaves per settle; querying it under the wrong origin
 * silently drops those leaves, so the client rebuilds a stale tree → wrong root
 * → every private split aborts EUnknownRoot. Query settle events under THIS id.
 */
export const PRIVATE_STREAM_DEFINING_PACKAGE_IDS = {
  mainnet: process.env.NEXT_PUBLIC_PACKAGE_ID_MAINNET ?? "0x0",
  testnet:
    "0xb0110fff0dd7b62e447f16d4ffd0323c0cdf8472aead3eae182711f4e4937897",
  devnet: "0x0",
} as const;

/**
 * Scallop-shaped yield vault for the streamed coin (testnet stand-in for
 * Scallop's lending pool). 3% APR, seeded with a mock-USDC interest buffer.
 */
export const YIELD_VAULT = {
  testnet:
    "0xda2fb1d51d80799b0eb87d1d50dd3f73255696056690c5c04120ffe3a33f9e15",
  mainnet: process.env.NEXT_PUBLIC_YIELD_VAULT_MAINNET ?? "0x0",
  devnet: "0x0",
} as const;

/**
 * Confidential-balance pool (Tier 1: hide amounts) — one shared reserve holding
 * all hidden USDC balances (owner → Poseidon commitment). Deployed 2026-07-19.
 */
export const CONF_BALANCE_POOL = {
  testnet:
    process.env.NEXT_PUBLIC_CONF_BALANCE_POOL_TESTNET ??
    "0x23d0ed9f3a571e640ca1ee4b52b6dcb7ce5a4cdbb190c9c48a3af6af0b346ee5",
  mainnet: "0x0",
  devnet: "0x0",
} as const;

/** Shielded pool (Phase 2) — one shared pool per network for the demo. */
export const SHIELDED_POOL = {
  testnet:
    "0x746dc6e668995b336e4a51ddc7c36673177983821dcff875149462014d73eccb",
  mainnet: "0x0",
  devnet: "0x0",
} as const;

/**
 * Lending pool for borrowing against a live stream (12% borrow APR, seeded with
 * mock-USDC liquidity). Testnet stand-in for Scallop/NAVI lending.
 */
export const LENDING_POOL = {
  testnet:
    "0xc82cded2f138ef3ce19956cdfdc53c7ceb158e19c205f2eeb61e162db1ae3ec4",
  mainnet: process.env.NEXT_PUBLIC_LENDING_POOL_MAINNET ?? "0x0",
  devnet: "0x0",
} as const;

/**
 * Shared GiftCardVault for USDC — aggregate reserve for ZK gift cards.
 * Publish once after upgrading the package with `giftcard::create_vault`.
 */
export const GIFT_CARD_VAULT = {
  testnet:
    process.env.NEXT_PUBLIC_GIFT_CARD_VAULT_TESTNET ??
    "0x6e995c8cf3d90660883e92f254d1d8fb4c9ed2b5cc8cdb243862a87accd9738f",
  mainnet: process.env.NEXT_PUBLIC_GIFT_CARD_VAULT_MAINNET ?? "0x0",
  devnet: "0x0",
} as const;

/**
 * Packages that *introduced* the DeFi receipt structs. A struct's type address
 * is pinned to the version that defined it (not the latest), so owned-object
 * filters for receipts must use these, not the current package id.
 *   VaultReceipt → v6 (yield_vault added); LoanReceipt → v7 (lending added).
 */
export const YIELD_DEFINING_PACKAGE = {
  testnet:
    "0x597f34fee3b246cbabdb8b8133c4b5e7aa5a15899e74df40acf61080b776a794",
  mainnet: "0x0",
  devnet: "0x0",
} as const;
export const LENDING_DEFINING_PACKAGE = {
  testnet:
    "0x597f34fee3b246cbabdb8b8133c4b5e7aa5a15899e74df40acf61080b776a794",
  mainnet: "0x0",
  devnet: "0x0",
} as const;

export const DEFAULT_NETWORK: NetworkName =
  (process.env.NEXT_PUBLIC_DEFAULT_NETWORK as NetworkName) ?? "testnet";
