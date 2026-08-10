export interface WalrusService {
  id: string;
  name: string;
  publisherUrl: string;
  aggregatorUrl: string;
}

export type WalrusNetwork = "mainnet" | "testnet" | "devnet";

export const DEFAULT_WALRUS_EPOCHS = 30;
export const SEAL_THRESHOLD = 2;
/** Seal SDK allows 1–30 minutes; use the maximum to minimize re-signing. */
export const SEAL_SESSION_TTL_MIN = 30;

/** Verified open-mode Seal key servers on Sui testnet. */
export const TESTNET_SEAL_KEY_SERVER_IDS = [
  "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
  "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
] as const;

/** On-chain URLs for {@link TESTNET_SEAL_KEY_SERVER_IDS} (index-aligned). */
export const TESTNET_SEAL_KEY_SERVER_ORIGINS = [
  "https://seal-key-server-testnet-1.mystenlabs.com",
  "https://seal-key-server-testnet-2.mystenlabs.com",
] as const;

export const TESTNET_WALRUS_SERVICES: WalrusService[] = [
  {
    id: "walrus-space",
    name: "walrus.space",
    publisherUrl: "https://publisher.walrus-testnet.walrus.space",
    aggregatorUrl: "https://aggregator.walrus-testnet.walrus.space",
  },
  {
    id: "cetus",
    name: "cetus.zone",
    publisherUrl: "http://walrus-publisher-testnet.cetus.zone:9001",
    aggregatorUrl: "https://walrus-aggregator-testnet.cetus.zone",
  },
  {
    id: "nansen",
    name: "banansen.dev",
    publisherUrl: "https://publisher.walrus.banansen.dev",
    aggregatorUrl: "https://aggregator.walrus.banansen.dev",
  },
  {
    id: "nodes_guru",
    name: "nodes.guru",
    publisherUrl: "https://walrus-testnet-publisher.nodes.guru",
    aggregatorUrl: "https://walrus-testnet-aggregator.nodes.guru",
  },
  {
    id: "blockscope",
    name: "blockscope.net",
    publisherUrl: "https://walrus-testnet.blockscope.net:11444",
    aggregatorUrl: "https://walrus-testnet.blockscope.net",
  },
  {
    id: "staketab",
    name: "staketab.org",
    publisherUrl: "https://wal-publisher-testnet.staketab.org",
    aggregatorUrl: "https://wal-aggregator-testnet.staketab.org",
  },
  
  {
    id: "redundex",
    name: "redundex.com",
    publisherUrl: "https://walrus-testnet-publisher.redundex.com",
    aggregatorUrl: "https://walrus-testnet-aggregator.redundex.com",
  },
  {
    id: "stakely",
    name: "stakely.io",
    publisherUrl: "https://walrus-testnet-aggregator.stakely.io",
    aggregatorUrl: "https://walrus-testnet-publisher.stakely.io",
  },
];

export const MAINNET_WALRUS_SERVICES: WalrusService[] = [
  {
    id: "walrus-space-mainnet",
    name: "walrus.space",
    publisherUrl: "https://publisher.walrus-mainnet.walrus.space",
    aggregatorUrl: "https://aggregator.walrus-mainnet.walrus.space",
  },
];

/**
 * Backward-compatible alias for existing testnet provider list usage.
 */
export const WALRUS_SERVICES = TESTNET_WALRUS_SERVICES;
export const DEFAULT_WALRUS_SERVICE = TESTNET_WALRUS_SERVICES[0];

export const WALRUS_SERVICES_BY_NETWORK: Record<WalrusNetwork, WalrusService[]> = {
  mainnet: MAINNET_WALRUS_SERVICES,
  testnet: TESTNET_WALRUS_SERVICES,
  // Keep devnet aligned with testnet infra in this app.
  devnet: TESTNET_WALRUS_SERVICES,
};

export function getWalrusServicesForNetwork(network: WalrusNetwork): WalrusService[] {
  return WALRUS_SERVICES_BY_NETWORK[network];
}

export function getPublisherUrl(path: string, service = DEFAULT_WALRUS_SERVICE): string {
  return `${service.publisherUrl}${path}`;
}

export function getAggregatorUrl(path: string, service = DEFAULT_WALRUS_SERVICE): string {
  return `${service.aggregatorUrl}${path}`;
}
