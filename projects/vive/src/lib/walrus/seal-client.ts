import { SealClient, type FetchKeysOptions } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { TESTNET_SEAL_KEY_SERVER_IDS } from "./constants";

function withCoalescedFetchKeys(client: SealClient): SealClient {
  const inflightBySession = new Map<string, Promise<void>>();
  const originalFetchKeys = client.fetchKeys.bind(client);

  client.fetchKeys = async (options: FetchKeysOptions): Promise<void> => {
    const sessionAddress = options.sessionKey.getAddress();
    const inflight = inflightBySession.get(sessionAddress);
    if (inflight) {
      await inflight.catch(() => undefined);
      return originalFetchKeys(options);
    }

    const promise = originalFetchKeys(options);
    inflightBySession.set(sessionAddress, promise);
    try {
      await promise;
    } finally {
      if (inflightBySession.get(sessionAddress) === promise) {
        inflightBySession.delete(sessionAddress);
      }
    }
  };

  return client;
}

export function createSealClient(suiClient: SealCompatibleClient): SealClient {
  return withCoalescedFetchKeys(
    new SealClient({
      suiClient,
      serverConfigs: TESTNET_SEAL_KEY_SERVER_IDS.map((objectId) => ({
        objectId,
        weight: 1,
      })),
      verifyKeyServers: false,
    }),
  );
}
