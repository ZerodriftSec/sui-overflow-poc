import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { usePayStreamerConfig } from "./provider";

export interface SponsoredTransactionResult {
  digest: string;
  status?: "success" | "failure";
}

export interface ExecuteSponsoredResult {
  digest?: string;
  error?: string;
  status?: "success" | "failure";
}

export function useSponsoredTransaction() {
  const config = usePayStreamerConfig();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();

  async function executeSponsored(tx: Transaction): Promise<ExecuteSponsoredResult> {
    if (!account) {
      return { error: "No wallet connected", status: "failure" };
    }

    try {
      if (!config.graphqlClient) throw new Error("GraphQL client not configured");

      const query = `query GetSuiBalance($owner: SuiAddress!) {
        address(address: $owner) {
          balance(type: "0x2::sui::SUI") {
            totalBalance
          }
        }
      }`;

      const balRes = await config.graphqlClient.query({
        query,
        variables: { owner: account.address },
      });

      const suiBalance = (balRes.data as any)?.address?.balance?.totalBalance || "0";

      // 100,000,000 MIST = 0.1 SUI
      if (BigInt(suiBalance) >= 100_000_000n) {
        console.log("Wallet has sufficient SUI balance, skipping sponsor flow...");
        
        const { signature, bytes } = await dAppKit.signTransaction({
          transaction: tx,
        });

        const res = await config.graphqlClient.executeTransaction({
          transaction: fromBase64(bytes),
          signatures: [signature],
        });

        if (res.$kind === "FailedTransaction") {
           const errStr = res.FailedTransaction.status.error ? JSON.stringify(res.FailedTransaction.status.error) : "Local execution failed";
           return { error: errStr, status: "failure" };
        }

        return { digest: res.Transaction?.digest || "", status: "success" };
      }

      if (!config.sponsorApiUrl) {
         throw new Error("sponsorApiUrl not configured in PayStreamerProvider");
      }

      // For sponsored transactions, user has no SUI so we always use the sponsored flow
      tx.setSender(account.address);

      // First API call: backend builds with sponsor's gas and returns bytes
      const prepareResponse = await fetch(`${config.sponsorApiUrl}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction: await tx.toJSON(),
          userAddress: account.address,
        }),
      });

      if (!prepareResponse.ok) {
        const error = await prepareResponse.json();
        throw new Error(error.error || "Failed to prepare transaction");
      }

      const { bytes: preparedBytes } = await prepareResponse.json();

      // Step 2: Frontend creates Transaction from prepared bytes and asks wallet to sign
      const txFromBytes = Transaction.from(preparedBytes);
      const { signature: userSignature } = await dAppKit.signTransaction({
        transaction: txFromBytes,
      });

      // Step 3: Frontend sends signed transaction to backend for execution
      const executeResponse = await fetch(`${config.sponsorApiUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bytes: preparedBytes,
          userSignature,
          userAddress: account.address,
        }),
      });

      if (!executeResponse.ok) {
        const error = await executeResponse.json();
        throw new Error(error.error || "Execution failed");
      }

      const result = await executeResponse.json();
      return { digest: result.digest, status: "success" };

    } catch (sponsorError: any) {
      console.warn("Sponsored execution failed, falling back to local execution:", sponsorError);

      if (!config.graphqlClient) return { error: "GraphQL client not configured", status: "failure" };

      try {
        // Fallback: Sign and execute the original transaction directly using the user's SUI for gas
        const { signature, bytes } = await dAppKit.signTransaction({
          transaction: tx,
        });

        const res = await config.graphqlClient.executeTransaction({
          transaction: fromBase64(bytes),
          signatures: [signature],
        });

        if (res.$kind === "FailedTransaction") {
           const errStr = res.FailedTransaction.status.error ? JSON.stringify(res.FailedTransaction.status.error) : "Local execution failed";
           return { error: errStr, status: "failure" };
        }

        return { digest: res.Transaction?.digest || "", status: "success" };
      } catch (localError: any) {
        return { 
          error: localError.message || sponsorError.message || "Execution failed", 
          status: "failure" 
        };
      }
    }
  }

  return { executeSponsored };
}
