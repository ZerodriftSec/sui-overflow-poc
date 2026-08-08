import { useState, useCallback } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { usePayStreamerConfig } from "./provider";
import { useSponsoredTransaction } from "./useSponsoredTransaction";

export interface UseMintTestPusdResult {
  mint: (amountMist?: bigint) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
}

export function useMintTestPusd(): UseMintTestPusdResult {
  const config = usePayStreamerConfig();
  const account = useCurrentAccount();
  const { executeSponsored } = useSponsoredTransaction();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mint = useCallback(
    async (amountMist: bigint = 100000000000n) => { // Default to 100 PUSD
      if (config.isMockMode) {
        setIsLoading(true);
        setError(null);
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            setIsLoading(false);
            resolve("mock_mint_digest_123");
          }, 1500);
        });
      }

      if (!account) {
        setError("Wallet not connected");
        return null;
      }

      const pusdPackageId = config.pusdPackageId;
      const treasuryCapId = config.pusdTreasuryCapId;

      if (!pusdPackageId || !treasuryCapId) {
        setError("pusdPackageId or pusdTreasuryCapId not configured");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${pusdPackageId}::pusd::mint`,
          arguments: [
            tx.object(treasuryCapId),
            tx.pure.address(account.address),
            tx.pure.u64(amountMist),
          ],
        });

        const result = await executeSponsored(tx);

        if (result.error || result.status === "failure") {
          throw new Error(result.error || "Transaction failed");
        }

        return result.digest || null;
      } catch (err: any) {
        console.error("useMintTestPusd error:", err);
        setError(err.message || String(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [account, config, executeSponsored]
  );

  return {
    mint,
    isLoading,
    error,
  };
}
