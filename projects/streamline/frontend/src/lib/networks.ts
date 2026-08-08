import { createNetworkConfig } from "@mysten/dapp-kit";

import {
  CONF_DEFINING_PACKAGE_IDS,
  DEFAULT_NETWORK,
  FULLNODE_URLS,
  ORIGINAL_PACKAGE_IDS,
  PACKAGE_IDS,
  TEST_USDC,
  USDC_TYPE,
  YIELD_VAULT,
  LENDING_POOL,
  GIFT_CARD_VAULT,
  YIELD_DEFINING_PACKAGE,
  LENDING_DEFINING_PACKAGE,
  type NetworkName,
} from "./constants";

/**
 * StreamLine targets Sui mainnet (gasless stablecoin transfers via Address
 * Balances launched on mainnet in May 2026). Testnet stays wired for dev.
 *
 * Pure constants live in `constants.ts` so server route handlers can reuse them
 * without pulling in dApp Kit.
 */
export {
  DEFAULT_NETWORK,
  FULLNODE_URLS,
  PACKAGE_IDS,
  TEST_USDC,
  USDC_TYPE,
};
export type { NetworkName };

/**
 * Next.js only inlines *statically* referenced `process.env.NEXT_PUBLIC_*` into
 * the browser bundle. The SDK reads env dynamically (`process.env[name]`), which
 * is NOT inlined client-side — so in the browser the RPC silently fell back to
 * the public fullnode (which now 404s), breaking every SuiClient call including
 * `tx.build`. Referencing the vars statically here gives the browser the real
 * endpoints; the SDK value is the server/CLI fallback.
 */
const RPC_URLS = {
  mainnet: process.env.NEXT_PUBLIC_SUI_MAINNET_RPC || FULLNODE_URLS.mainnet,
  testnet: process.env.NEXT_PUBLIC_SUI_TESTNET_RPC || FULLNODE_URLS.testnet,
  devnet: process.env.NEXT_PUBLIC_SUI_DEVNET_RPC || FULLNODE_URLS.devnet,
};

export const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    mainnet: {
      url: RPC_URLS.mainnet,
      variables: {
        packageId: PACKAGE_IDS.mainnet,
        usdcType: USDC_TYPE.mainnet,
        originalPackageId: ORIGINAL_PACKAGE_IDS.mainnet,
        confPackageId: CONF_DEFINING_PACKAGE_IDS.mainnet,
        yieldVaultId: YIELD_VAULT.mainnet,
        lendingPoolId: LENDING_POOL.mainnet,
        giftCardVaultId: GIFT_CARD_VAULT.mainnet,
        yieldDefiningPackage: YIELD_DEFINING_PACKAGE.mainnet,
        lendingDefiningPackage: LENDING_DEFINING_PACKAGE.mainnet,
      },
    },
    testnet: {
      url: RPC_URLS.testnet,
      variables: {
        packageId: PACKAGE_IDS.testnet,
        usdcType: USDC_TYPE.testnet,
        originalPackageId: ORIGINAL_PACKAGE_IDS.testnet,
        confPackageId: CONF_DEFINING_PACKAGE_IDS.testnet,
        yieldVaultId: YIELD_VAULT.testnet,
        lendingPoolId: LENDING_POOL.testnet,
        giftCardVaultId: GIFT_CARD_VAULT.testnet,
        yieldDefiningPackage: YIELD_DEFINING_PACKAGE.testnet,
        lendingDefiningPackage: LENDING_DEFINING_PACKAGE.testnet,
      },
    },
    devnet: {
      url: RPC_URLS.devnet,
      variables: {
        packageId: PACKAGE_IDS.devnet,
        usdcType: USDC_TYPE.devnet,
        originalPackageId: ORIGINAL_PACKAGE_IDS.devnet,
        confPackageId: CONF_DEFINING_PACKAGE_IDS.devnet,
        yieldVaultId: YIELD_VAULT.devnet,
        lendingPoolId: LENDING_POOL.devnet,
        giftCardVaultId: GIFT_CARD_VAULT.devnet,
        yieldDefiningPackage: YIELD_DEFINING_PACKAGE.devnet,
        lendingDefiningPackage: LENDING_DEFINING_PACKAGE.devnet,
      },
    },
  });
