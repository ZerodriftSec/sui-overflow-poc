import { useCurrentAccount, useDAppKit, useCurrentClient } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

const SPONSOR_API_URL = import.meta.env.VITE_SPONSOR_API_URL || "/api";

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
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const client = useCurrentClient();

  async function executeSponsored(tx: Transaction): Promise<ExecuteSponsoredResult> {
    if (!account) {
      return { error: "No wallet connected", status: "failure" };
    }

    try {
      // Check if user has enough SUI to pay for gas. If so, bypass the sponsor flow.
      const suiBalance = await client.getBalance({
        owner: account.address,
        coinType: "0x2::sui::SUI",
      });

      // 100,000,000 MIST = 0.1 SUI
      if (BigInt(suiBalance?.balance?.balance || "0") >= 100_000_000n) {
        console.log("Wallet has sufficient SUI balance, skipping sponsor flow...");
        
        const { signature, bytes } = await dAppKit.signTransaction({
          transaction: tx,
        });

        const res = await client.executeTransaction({
          transaction: fromBase64(bytes),
          signatures: [signature],
          include: { effects: true, events: true }
        });

        const txData = res.Transaction || res.FailedTransaction;

        if ((txData as any)?.effects?.status.status === "failure") {
          return { error: (txData as any).effects.status.error || "Local execution failed", status: "failure" };
        }

        return { digest: txData?.digest || "", status: "success" };
      }

      // For sponsored transactions, user has no SUI so we always use the sponsored flow
      tx.setSender(account.address);

      // First API call: backend builds with sponsor's gas and returns bytes
      const prepareResponse = await fetch(`${SPONSOR_API_URL}/prepare`, {
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
      const executeResponse = await fetch(`${SPONSOR_API_URL}/execute`, {
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

      try {
        // Fallback: Sign and execute the original transaction directly using the user's SUI for gas
        const { signature, bytes } = await dAppKit.signTransaction({
          transaction: tx,
        });

        const res = await client.executeTransaction({
          transaction: fromBase64(bytes),
          signatures: [signature],
          include: { effects: true, events: true }
        });

        const txData = res.Transaction || res.FailedTransaction;

        if ((txData as any)?.effects?.status.status === "failure") {
          return { error: (txData as any).effects.status.error || "Local execution failed", status: "failure" };
        }

        return { digest: txData?.digest || "", status: "success" };
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
