import { useQuery } from "@tanstack/react-query";
import { SupportedNetwork } from "@paystreamer/sdk";
import { queryPlatformsByOwner, queryPlatformRegisteredEvents, queryMultiplePlatforms } from "@paystreamer/sdk/core";
import { useAppConfig } from "../hooks/useAppConfig";

const E2E_TEST_NAME_PREFIX = "PayStreamer E2E";

export interface PlatformObject {
  objectId: string;
  initialSharedVersion: number;
  json: {
    owner: string;
    name: string;
    description: string;
    category: string;
    treasury: string;
    pending_treasury?: string;
    pending_treasury_change_time?: number;
    tiers: Array<{
      name: string;
      amount: string;
      frequency: string;
      subscriber_count: number;
      is_active: boolean;
    }>;
    subscriber_count: number;
    created_at: number;
  };
}

export async function discoverOwnedPlatforms(
  walletAddress: string,
  network?: SupportedNetwork
): Promise<PlatformObject[]> {
  const events = await queryPlatformsByOwner(walletAddress, network);
  const platformIds = Array.from(
    new Set(events.map((e) => e.platform_id).filter(Boolean))
  );

  const objects = await queryMultiplePlatforms(platformIds, network);
  return objects as PlatformObject[];
}

export function useOwnedPlatforms(walletAddress: string | null) {
  const config = useAppConfig();
  return useQuery({
    queryKey: ["owned-platforms", walletAddress, config.network],
    queryFn: async () => {
      if (!walletAddress) return [];
      return discoverOwnedPlatforms(walletAddress, config.network);
    },
    enabled: !!walletAddress,
  });
}

export async function discoverAllPlatforms(network?: SupportedNetwork): Promise<PlatformObject[]> {
  const events = await queryPlatformRegisteredEvents(network);
  const platformIds = Array.from(
    new Set(events.map((e) => e.platform_id).filter(Boolean))
  );

  const objects = await queryMultiplePlatforms(platformIds, network);
  return (objects as PlatformObject[]).filter(
    (p) => !p.json.name?.startsWith(E2E_TEST_NAME_PREFIX)
  );
}

export function useAllPlatforms() {
  const config = useAppConfig();
  return useQuery({
    queryKey: ["all-platforms", config.network],
    queryFn: async () => {
      return discoverAllPlatforms(config.network);
    },
  });
}