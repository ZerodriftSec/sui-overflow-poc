import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { usePayStreamerConfig } from './provider';

export function usePusdBalance() {
  const account = useCurrentAccount();
  const config = usePayStreamerConfig();

  return useQuery({
    queryKey: ['paystreamer', 'balance', account?.address, config.pusdType],
    queryFn: async () => {
      if (config.isMockMode) {
        return 50000000000n; // 50 PUSD
      }
      
      if (!account?.address) return 0n;
      if (!config.graphqlClient) {
        throw new Error("GraphQL client is not configured in PayStreamerProvider");
      }

      const query = `
        query GetPusdBalance($owner: SuiAddress!, $type: String!) {
          address(address: $owner) {
            balance(type: $type) {
              totalBalance
            }
          }
        }
      `;

      const result = await config.graphqlClient.query({
        query,
        variables: {
          owner: account.address,
          type: config.pusdType,
        }
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const totalBalance = (result.data as any)?.address?.balance?.totalBalance || "0";
      return BigInt(totalBalance);
    },
    enabled: config.isMockMode ? true : (!!account?.address && !!config.pusdType && !!config.graphqlClient),
  });
}
