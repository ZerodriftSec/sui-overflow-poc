import { useQuery } from '@tanstack/react-query';
import { usePayStreamerConfig } from './provider';

export interface PlatformTier {
  name: string;
  amount: string;
  frequency: string;
  subscriber_count: number;
  is_active: boolean;
}

export interface PlatformWithTiers {
  id: string;
  owner: string;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  is_paused: boolean;
  created_at: number;
  tiers: PlatformTier[];
}

export function usePlatform(platformId: string | undefined) {
  const config = usePayStreamerConfig();

  return useQuery({
    queryKey: ['paystreamer', 'platform', platformId, config.network],
    queryFn: async () => {
      if (!platformId) return null;
      if (config.isMockMode) {
        return {
          id: platformId,
          owner: "0xMockOwner",
          name: "Mock Platform",
          description: "This is a mock platform for the playground.",
          category: "Education",
          image_url: null,
          is_paused: false,
          created_at: Date.now(),
          tiers: [
            {
              name: "Pro Tier",
              amount: "5000000000",
              frequency: "2592000000",
              subscriber_count: 42,
              is_active: true
            }
          ],
          initialSharedVersion: 1
        } as PlatformWithTiers & { initialSharedVersion: number };
      }
      
      if (!config.graphqlClient) {
        throw new Error("GraphQL client is not configured in PayStreamerProvider");
      }

      const query = `
        query GetPlatform($id: SuiAddress!) {
          object(address: $id) {
            asMoveObject {
              contents {
                json
              }
            }
            owner {
              ... on Shared {
                initialSharedVersion
              }
            }
          }
        }
      `;

      const result = await config.graphqlClient.query({
        query,
        variables: { id: platformId }
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const data = result.data as any;
      if (!data?.object?.asMoveObject?.contents?.json) {
        return null;
      }

      return {
        ...data.object.asMoveObject.contents.json,
        initialSharedVersion: data.object.owner?.initialSharedVersion ?? 0,
      } as PlatformWithTiers & { initialSharedVersion: number };
    },
    enabled: !!platformId,
  });
}
