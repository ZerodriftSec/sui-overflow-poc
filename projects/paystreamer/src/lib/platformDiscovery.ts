import { useQuery } from "@tanstack/react-query";
import {  SupportedNetwork  } from "@paystreamer/sdk";
import { getGraphQLClient, queryPlatformsByOwner } from "@paystreamer/sdk/core";
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

  if (platformIds.length === 0) return [];

  const client = getGraphQLClient(network);

  const query = `
    query GetPlatforms {
      ${platformIds.map((id, index) => `
        obj${index}: object(address: "${id}") {
          address
          owner {
            ... on Shared {
              initialSharedVersion
            }
          }
          asMoveObject { contents { json } }
        }
      `).join("\n")}
    }
  `;

  const res = await client.query({ query, variables: {} });
  const objects = Object.values(res.data || {}).filter(Boolean) as any[];

  return objects.map((obj: any) => {
    const json = obj.asMoveObject?.contents?.json || {};
    let parsedTiers = [];

    if (json.tiers && Array.isArray(json.tiers)) {
      parsedTiers = json.tiers;
    } else if (json.tiers?.contents && Array.isArray(json.tiers.contents)) {
      parsedTiers = json.tiers.contents.map((t: any) => {
        const val = t.value || {};
        let frequency = val.frequency || val.frequency_ms || "monthly";
        
        // Map common milliseconds back to string labels
        if (frequency === "86400000") frequency = "daily";
        else if (frequency === "604800000") frequency = "weekly";
        else if (frequency === "2592000000") frequency = "monthly";
        else if (frequency === "31536000000") frequency = "yearly";

        return {
          name: val.name || "",
          amount: val.amount || "0",
          frequency,
          subscriber_count: parseInt(val.subscriber_count || "0", 10),
          is_active: val.is_active ?? true,
        };
      });
    }

    return {
      objectId: obj.address,
      initialSharedVersion: obj.owner?.initialSharedVersion ?? 0,
      json: {
        ...json,
        tiers: parsedTiers,
      },
    };
  }) as PlatformObject[];
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
  const events = await import("@paystreamer/sdk/core").then((m) => m.queryPlatformRegisteredEvents(network));
  const platformIds = Array.from(
    new Set(events.map((e) => e.platform_id).filter(Boolean))
  );

  if (platformIds.length === 0) return [];

  const client = getGraphQLClient(network);

  const query = `
    query GetPlatforms {
      ${platformIds.map((id, index) => `
        obj${index}: object(address: "${id}") {
          address
          owner {
            ... on Shared {
              initialSharedVersion
            }
          }
          asMoveObject { contents { json } }
        }
      `).join("\n")}
    }
  `;

  const res = await client.query({ query, variables: {} });
  const objects = Object.values(res.data || {}).filter(Boolean) as any[];

  return objects.map((obj: any) => {
    const json = obj.asMoveObject?.contents?.json || {};
    let parsedTiers = [];

    if (json.tiers && Array.isArray(json.tiers)) {
      parsedTiers = json.tiers;
    } else if (json.tiers?.contents && Array.isArray(json.tiers.contents)) {
      parsedTiers = json.tiers.contents.map((t: any) => {
        const val = t.value || {};
        let frequency = val.frequency || val.frequency_ms || "monthly";
        
        if (frequency === "86400000") frequency = "daily";
        else if (frequency === "604800000") frequency = "weekly";
        else if (frequency === "2592000000") frequency = "monthly";
        else if (frequency === "31536000000") frequency = "yearly";

        return {
          name: val.name || "",
          amount: val.amount || "0",
          frequency,
          subscriber_count: parseInt(val.subscriber_count || "0", 10),
          is_active: val.is_active ?? true,
        };
      });
    }

    return {
      objectId: obj.address,
      initialSharedVersion: obj.owner?.initialSharedVersion ?? 0,
      json: {
        ...json,
        tiers: parsedTiers,
      },
    };
  })
  .filter((p) => !p.json.name?.startsWith(E2E_TEST_NAME_PREFIX)) as PlatformObject[];
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