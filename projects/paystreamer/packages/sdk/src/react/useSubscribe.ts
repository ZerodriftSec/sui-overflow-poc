import { useState, useCallback } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { usePayStreamerConfig } from "./provider";
import { buildSubscribeTx } from "../core/transactions";
import { useSponsoredTransaction } from "./useSponsoredTransaction";

export interface UseSubscribeParams {
  platformId: string;
  tierIndex: number | bigint;
  tierAmount: bigint;
  tierFrequencyMs: bigint;
  accountId?: string;
  accountCapId?: string;
  maxAttempts?: number;
}

export function useSubscribe(params: UseSubscribeParams) {
  const config = usePayStreamerConfig();
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const { executeSponsored } = useSponsoredTransaction();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const hasAccount = !!params.accountId && !!params.accountCapId;

  // Calculate recommended deposit (e.g. 3 months worth)
  const THREE_MONTHS_MS = 90n * 24n * 60n * 60n * 1000n;
  let cyclesBuffer = 3n;
  if (params.tierFrequencyMs > 0n) {
    cyclesBuffer = THREE_MONTHS_MS / params.tierFrequencyMs;
    if (cyclesBuffer < 3n) cyclesBuffer = 3n;
    if (cyclesBuffer > 10n) cyclesBuffer = 10n;
  }
  const recommendedDeposit = params.tierAmount * cyclesBuffer;

  const subscribe = useCallback(
    async (depositAmount: bigint = 0n) => {
      if (config.isMockMode) {
        setIsLoading(true);
        setError(null);
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            setIsLoading(false);
            resolve("mock_digest_1234567890abcdef");
          }, 1500);
        });
      }

      if (!account) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        let coinsToUse: string[] = [];

        // Fetch coins if deposit is requested
        if (depositAmount > 0n) {
          if (!config.graphqlClient) throw new Error("GraphQL client not configured");
          
          const coinsQuery = `query GetCoins($owner: SuiAddress!, $type: String!) {
            address(address: $owner) {
              objects(first: 50, filter: { type: $type }) {
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
          }`;

          const res = await config.graphqlClient.query({
            query: coinsQuery,
            variables: { owner: account.address, type: config.pusdType }
          });

          const nodes = (res.data as any)?.address?.objects?.nodes || [];
          let total = 0n;
          for (const node of nodes) {
            const balance = BigInt(node.asMoveObject?.contents?.json?.balance || 0);
            total += balance;
            coinsToUse.push(node.address);
            if (total >= depositAmount) break;
          }

          if (total < depositAmount) {
            throw new Error(`Insufficient balance for deposit. Found ${total.toString()}, required ${depositAmount.toString()}`);
          }
        }

        const tx = new Transaction();
        // tx.setGasBudget(100_000_000); // Usually automatically handled

        buildSubscribeTx({
          tx,
          packageId: config.packageId,
          registryId: config.registryId,
          clockId: config.clockId,
          denomination: config.pusdType,
          platformId: params.platformId,
          tierIndex: params.tierIndex,
          tierAmount: params.tierAmount,
          tierFrequencyMs: params.tierFrequencyMs,
          maxAttempts: params.maxAttempts,
          accountId: params.accountId,
          accountCapId: params.accountCapId,
          depositAmount,
          coinsToUse,
        });

        const result = await executeSponsored(tx);
        
        if (result.error || result.status === "failure") {
          throw new Error(result.error || "Transaction failed");
        }

        return result.digest;
      } catch (err: any) {
        console.error("useSubscribe error:", err);
        setError(err.message || String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [account, client, config, params, executeSponsored]
  );

  return {
    subscribe,
    isLoading,
    error,
    recommendedDeposit,
    hasAccount,
  };
}
