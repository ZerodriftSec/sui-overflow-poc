import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import { usePayStreamerConfig } from './provider';

export interface PayStreamerUserAccount {
  accountCapId: string;
  accountId: string;
  balance: bigint;
}

export function useUserAccount() {
  const account = useCurrentAccount();
  const config = usePayStreamerConfig();

  const { data, isLoading, error } = useQuery({
    queryKey: ['getOwnedObjects', account?.address, config.packageId],
    queryFn: async () => {
      if (config.isMockMode) {
        return {
          accountCapId: "0xMockAccountCap",
          accountId: "0xMockAccount",
          balance: 10000000000n, // 10 PUSD
        };
      }
      
      if (!account?.address) return null;
      if (!config.graphqlClient) {
        throw new Error("GraphQL client is not configured in PayStreamerProvider");
      }

      const query = `
        query GetAccountCap($owner: SuiAddress!, $type: String!) {
          address(address: $owner) {
            objects(filter: { type: $type }) {
              nodes {
                address
                asMoveObject {
                  contents {
                    json
                  }
                }
              }
            }
          }
        }
      `;

      const result = await config.graphqlClient.query({
        query,
        variables: {
          owner: account.address,
          type: `${config.packageId}::account::AccountCap`
        }
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const resData = result.data as any;
      let accountCapId = '';
      let accountId = '';
      let balance = 0n;

      if (resData?.address?.objects?.nodes && resData.address.objects.nodes.length > 0) {
        const obj = resData.address.objects.nodes[0];
        const json = obj.asMoveObject?.contents?.json;
        if (json?.account_id) {
          accountCapId = obj.address || '';
          accountId = json.account_id;

          const balQuery = `
            query GetAccountBal($id: SuiAddress!) {
              object(address: $id) {
                asMoveObject {
                  contents {
                    json
                  }
                }
              }
            }
          `;

          const balResult = await config.graphqlClient.query({
            query: balQuery,
            variables: { id: accountId }
          });

          const balStr = (balResult.data as any)?.object?.asMoveObject?.contents?.json?.balance || "0";
          balance = BigInt(balStr);
        }
      }

      if (!accountId) return null;

      return {
        accountCapId,
        accountId,
        balance,
      };
    },
    enabled: config.isMockMode ? true : (!!account?.address && !!config.packageId),
  });

  return {
    userAccount: data || null,
    isLoading,
    error,
  };
}
