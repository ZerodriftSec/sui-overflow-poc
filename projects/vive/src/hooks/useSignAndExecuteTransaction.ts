import { useCallback } from "react";
import {
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import type { Transaction } from "@mysten/sui/transactions";

export interface ExecutedTransactionSummary {
  digest: string;
  createdObjectIds: string[];
  createdFileIds: string[];
  createdDirectoryIds: string[];
  createdProjectIds: string[];
}

interface ObjectChangeLike {
  type?: string;
  objectType?: string;
  objectId?: string;
}

function collectCreatedIds(objectChanges: ObjectChangeLike[] | undefined): ExecutedTransactionSummary {
  const createdObjectIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdDirectoryIds: string[] = [];
  const createdProjectIds: string[] = [];

  for (const change of objectChanges ?? []) {
    if (change.type !== "created" || !change.objectId) continue;
    createdObjectIds.push(change.objectId);
    const objectType = change.objectType ?? "";
    if (objectType.includes("::file::File")) {
      createdFileIds.push(change.objectId);
    } else if (objectType.includes("::directory::Directory")) {
      createdDirectoryIds.push(change.objectId);
    } else if (objectType.includes("::project::Project")) {
      createdProjectIds.push(change.objectId);
    }
  }

  return {
    digest: "",
    createdObjectIds,
    createdFileIds,
    createdDirectoryIds,
    createdProjectIds,
  };
}

/**
 * Signs and executes transactions through the connected wallet (Sui Wallet, Enoki zkLogin, etc.).
 * Enoki wallets handle zkLogin proof assembly internally via the wallet standard.
 */
export function useSignAndExecuteTransaction() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();

  const signAndExecute = useCallback(
    async (tx: Transaction): Promise<ExecutedTransactionSummary> => {
      if (!account?.address) {
        throw new Error("Connect your wallet to sign transactions.");
      }

      tx.setSender(account.address);

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error("Transaction failed.");
      }

      // Only object changes are consumed below — events aren't read anywhere,
      // so skip requesting them and let the full node respond sooner.
      const waited = (await client.waitForTransaction({
        result,
        include: { objectChanges: true, effects: true },
      })) as {
        digest?: string;
        objectChanges?: ObjectChangeLike[];
      };

      const resultChanges = (result as { objectChanges?: ObjectChangeLike[] }).objectChanges;
      const summary = collectCreatedIds(waited.objectChanges ?? resultChanges);
      summary.digest =
        waited.digest ?? (result as { digest?: string }).digest ?? "";
      return summary;
    },
    [account?.address, client, dAppKit],
  );

  return { signAndExecute, account, client };
}
