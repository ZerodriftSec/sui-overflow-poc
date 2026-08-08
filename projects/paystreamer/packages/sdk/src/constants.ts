// PayStreamer v3 — Devnet deployment (2026-06-16)
// All deployment-specific IDs live here. Update on every redeployment.

export type SupportedNetwork = "local" | "devnet" | "testnet" | "mainnet";

export interface NetworkConfig {
  PACKAGE_ID: string;
  COIN_TYPE_REGISTRY_ID: string;
  COIN_TYPE_REGISTRY_INIT_VERSION: number;
  PAYMENT_SCHEDULER_ID: string;
  PAYMENT_SCHEDULER_INIT_VERSION: number;
  ACCESS_CONTROL_ID: string;
  GRAPHQL_URL: string;
  PUSD_PACKAGE_ID: string;
  PUSD_TYPE_ARG: string;
  PUSD_TREASURY_CAP_ID: string;
  PUSD_TREASURY_CAP_INIT_VERSION: number;
  DEMO_PLATFORM_ID: string;
  DEMO_PLATFORM_INIT_VERSION: number;
}

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  local: {
    PACKAGE_ID: "0xfc622194842bd044b6f91819b601aec8739542a45333e8b537e8a9af45ada943",
    COIN_TYPE_REGISTRY_ID: "0x0464dd1df5f6df8906e7a2eb2feac6e58b9f8a50f5521942b7c971ceb9150d07",
    COIN_TYPE_REGISTRY_INIT_VERSION: 330413,
    PAYMENT_SCHEDULER_ID: "0x5f92579748fcd5f62e4fe855b86cda9dfc74197934de2157b6e2d92c0b6eaab3",
    PAYMENT_SCHEDULER_INIT_VERSION: 330413,
    ACCESS_CONTROL_ID: "",
    GRAPHQL_URL: "http://127.0.0.1:8000/graphql",
    PUSD_PACKAGE_ID: "0x7cac14e1e2bc908bd27b1b107a255b582c8c0fc42fd5d4d5d1f918157c6ebf5f",
    PUSD_TYPE_ARG: "0x7cac14e1e2bc908bd27b1b107a255b582c8c0fc42fd5d4d5d1f918157c6ebf5f::pusd::PUSD",
    PUSD_TREASURY_CAP_ID: "0x9620b6580f73239687ab6c519a7e6bb0b997e6e06164d9ac9136258b9267fd3a",
    PUSD_TREASURY_CAP_INIT_VERSION: 330412,
    DEMO_PLATFORM_ID: "0x6ebb993f93c4c063f13c0ce5152a2b833c061a2f75c8dae2404df49e4122ea1a",
    DEMO_PLATFORM_INIT_VERSION: 367767,
  },
  devnet: {
    PACKAGE_ID: "0x0808b08199b07c7786c65fdbca996b2a2a0ccae29de8bd467d36225d2a7a9d73",
    COIN_TYPE_REGISTRY_ID: "0x211eeac09d39bac8553147c08f1c33701dcdf106a6886e7b852c5edc84e0e583",
    COIN_TYPE_REGISTRY_INIT_VERSION: 12,
    PAYMENT_SCHEDULER_ID: "0xae8bf7bb2a43da9aa303c353097c5ad23ae590f47a26fbebb5803bbec21dd02f",
    PAYMENT_SCHEDULER_INIT_VERSION: 12,
    ACCESS_CONTROL_ID: "0x872a025c83c65d1d7b66e3d2667eaf617c6624ddfefcced813da89d42eb368cf",
    GRAPHQL_URL: "https://graphql.devnet.sui.io/graphql",
    PUSD_PACKAGE_ID: "0x6fbabf6db1daa7343e34c01a10c196bc6fa324500114c51172547305c5181107",
    PUSD_TYPE_ARG: "0x6fbabf6db1daa7343e34c01a10c196bc6fa324500114c51172547305c5181107::pusd::PUSD",
    PUSD_TREASURY_CAP_ID: "0x2881d13216f36561b41a44a8d39de77f47b972953417904c71b60cdb5d345e48",
    PUSD_TREASURY_CAP_INIT_VERSION: 13,
    DEMO_PLATFORM_ID: "0xa9d5aa6ac94c1508a2a7f93d1498e881f117fd017c5e6932ad4e3045d070403a",
    DEMO_PLATFORM_INIT_VERSION: 6340321,
  },
  testnet: {
    PACKAGE_ID: "0x48c2c4ea663d95748ae53f3945f58433cf259b42c3aedfd62ba6a13ba4f2d38c",
    COIN_TYPE_REGISTRY_ID: "0x48ccd75e970e510e6d94ca4fb94fb117c8c5ed760ef71e8594c311ebba23ca07",
    COIN_TYPE_REGISTRY_INIT_VERSION: 349181685,
    PAYMENT_SCHEDULER_ID: "0xaad10a547fa266be39fabec779149784884f64f0202a103c69787124dacca223",
    PAYMENT_SCHEDULER_INIT_VERSION: 349181685,
    ACCESS_CONTROL_ID: "0x9cfde1ce446211229e8553bdb78265767a3a7514534450371ed17e363586779d",
    GRAPHQL_URL: "https://graphql.testnet.sui.io/graphql",
    PUSD_PACKAGE_ID: "0x74d11b1c40509335fd139b7b173328a1e1d55d2816a55b893861148d3724a61f",
    PUSD_TYPE_ARG: "0x74d11b1c40509335fd139b7b173328a1e1d55d2816a55b893861148d3724a61f::pusd::PUSD",
    PUSD_TREASURY_CAP_ID: "0xca02759942d7c917bb74166c1ea44336f9819e6e36b051ff92b43de6989bcba2",
    PUSD_TREASURY_CAP_INIT_VERSION: 349181682,
    DEMO_PLATFORM_ID: "0x1743834955aca50bc3c79dffbf93531ba2bbfa38c9f124f57afcee3d61d4b0ee",
    DEMO_PLATFORM_INIT_VERSION: 909612921,
  }
};

const getEnvNetwork = () => {
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env && process.env.VITE_NETWORK) return process.env.VITE_NETWORK;
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_NETWORK) return (import.meta as any).env.VITE_NETWORK;
  return null;
};
const isProd = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.PROD;
export const NETWORK = (getEnvNetwork() || (isProd ? "testnet" : "devnet")) as SupportedNetwork;

export function getConfig(network?: SupportedNetwork): NetworkConfig {
  const targetNetwork = network || (NETWORK as SupportedNetwork);
  return NETWORK_CONFIGS[targetNetwork] || NETWORK_CONFIGS.testnet!;
}

const fallbackConfig = getConfig();

export const SUBSCRIPTION_DEVNET_PACKAGE_ID = fallbackConfig.PACKAGE_ID;
export const SUBSCRIPTION_TESTNET_PACKAGE_ID = NETWORK_CONFIGS.testnet?.PACKAGE_ID;
export const SUBSCRIPTION_MAINNET_PACKAGE_ID = undefined;

export const COIN_TYPE_REGISTRY_ID = fallbackConfig.COIN_TYPE_REGISTRY_ID;
export const COIN_TYPE_REGISTRY_INIT_VERSION = fallbackConfig.COIN_TYPE_REGISTRY_INIT_VERSION;

export const PAYMENT_SCHEDULER_ID = fallbackConfig.PAYMENT_SCHEDULER_ID;
export const PAYMENT_SCHEDULER_INIT_VERSION = fallbackConfig.PAYMENT_SCHEDULER_INIT_VERSION;

export const ACCESS_CONTROL_ID = fallbackConfig.ACCESS_CONTROL_ID;

export const GRAPHQL_URL = fallbackConfig.GRAPHQL_URL;
export const SUI_TYPE_ARG = "0x2::sui::SUI";
export const CLOCK_OBJECT_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";

export const PUSD_DEVNET_PACKAGE_ID = fallbackConfig.PUSD_PACKAGE_ID;
export const PUSD_TYPE_ARG = fallbackConfig.PUSD_TYPE_ARG;
export const PUSD_TREASURY_CAP_ID = fallbackConfig.PUSD_TREASURY_CAP_ID;
export const PUSD_TREASURY_CAP_INIT_VERSION = fallbackConfig.PUSD_TREASURY_CAP_INIT_VERSION;

export const DEMO_DENOMINATIONS: string[] = [fallbackConfig.PUSD_TYPE_ARG];

export const DEMO_PLATFORM_ID = fallbackConfig.DEMO_PLATFORM_ID;
export const DEMO_PLATFORM_INIT_VERSION = fallbackConfig.DEMO_PLATFORM_INIT_VERSION;
