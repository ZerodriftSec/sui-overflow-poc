import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import {
  DEFAULT_WORKSPACE_DIRECTORY_SEGMENTS,
  buildCreateDirectoriesTransaction,
  buildCreateVaultTransaction,
  findVaultContext,
  readCachedVaultContext,
  type VaultContext,
  writeCachedVaultContext,
} from "../lib/vault";
import { Directory } from "../contracts/content_vault/directory";
import {
  useSignAndExecuteTransaction,
  type ExecutedTransactionSummary,
} from "./useSignAndExecuteTransaction";
import { listRootAssetFoldersFromChain } from "../lib/storage/on-chain-directory";

async function readRootDirectoryEntryCount(
  client: ReturnType<typeof useCurrentClient>,
  rootDirectoryId: string,
): Promise<number | null> {
  if (!client.core?.getObject) {
    return null;
  }
  try {
    const { object } = await client.core.getObject({
      objectId: rootDirectoryId,
      include: { content: true },
    });
    const content = object?.content;
    if (!content) return null;
    const bytes = content instanceof Uint8Array ? content : await content;
    const parsed = Directory.parse(bytes);
    return Number(parsed.entry_count);
  } catch {
    return null;
  }
}

// Once we've confirmed (or created) the root workspace directories for a given
// on-chain Project, that fact never changes for the lifetime of the session.
// Module-level so it survives remounts of the hook and is shared across every
// ensureVault() call — without this, each "New project" click paid for an
// extra getObject RPC round trip just to re-confirm something already known.
const seededWorkspaceRootDirectories = new Set<string>();

export function useVaultContext() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const { signAndExecute: executeTransaction } = useSignAndExecuteTransaction();
  const [vault, setVault] = useState<VaultContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const pendingLoadRef = useRef<Promise<VaultContext | null> | null>(null);
  const pendingSeedRef = useRef<Promise<void> | null>(null);

  const ensureWorkspaceRootDirectories = useCallback(
    async (context: VaultContext): Promise<void> => {
      if (seededWorkspaceRootDirectories.has(context.projectId)) {
        return;
      }

      if (pendingSeedRef.current) {
        await pendingSeedRef.current;
        return;
      }

      const run = (async () => {
        const rootEntryCount = await readRootDirectoryEntryCount(
          client,
          context.rootDirectoryId,
        );
        if (rootEntryCount !== null && rootEntryCount > 0) {
          seededWorkspaceRootDirectories.add(context.projectId);
          return;
        }

        if (rootEntryCount === null) {
          const discovered = await listRootAssetFoldersFromChain({
            client,
            projectId: context.projectId,
            rootDirectoryId: context.rootDirectoryId,
          }).catch(() => []);
          if (discovered.length > 0) {
            seededWorkspaceRootDirectories.add(context.projectId);
            return;
          }
        }

        if (rootEntryCount !== 0 && rootEntryCount !== null) {
          return;
        }
        const seedTx = buildCreateDirectoriesTransaction({
          parentDirectoryId: context.rootDirectoryId,
          accessRegistryId: context.accessRegistryId,
          projectId: context.projectId,
          segmentNames: DEFAULT_WORKSPACE_DIRECTORY_SEGMENTS,
        });
        await executeTransaction(seedTx);
        seededWorkspaceRootDirectories.add(context.projectId);
      })();

      pendingSeedRef.current = run.finally(() => {
        pendingSeedRef.current = null;
      });
      await pendingSeedRef.current;
    },
    [client, executeTransaction],
  );

  const loadVault = useCallback(async (): Promise<VaultContext | null> => {
    if (!account?.address) {
      setVault(null);
      return null;
    }

    if (pendingLoadRef.current) {
      return pendingLoadRef.current;
    }

    setLoading(true);
    setError(null);

    const promise = (async (): Promise<VaultContext | null> => {
      try {
        const cached = readCachedVaultContext(account.address);
        if (cached) {
          setVault(cached);
        }

        const found = await findVaultContext(client, account.address);
        setVault(found);
        return found;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load workspace project.";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
        pendingLoadRef.current = null;
      }
    })();

    pendingLoadRef.current = promise;
    return promise;
  }, [account?.address, client]);

  const createVault = useCallback(async (): Promise<VaultContext> => {
    if (!account?.address) {
      throw new Error("Connect your wallet to create a workspace project.");
    }

    setLoading(true);
    setError(null);

    try {
      const existing = await findVaultContext(client, account.address);
      if (existing) {
        await ensureWorkspaceRootDirectories(existing);
        setVault(existing);
        return existing;
      }

      const tx = buildCreateVaultTransaction();
      await executeTransaction(tx);

      const created = await findVaultContext(client, account.address);
      if (!created) {
        throw new Error(
          "Project transaction succeeded but workspace project was not found.",
        );
      }

      // Safety net for older packages / empty seeds; no-ops when the create PTB already seeded dirs.
      await ensureWorkspaceRootDirectories(created);

      writeCachedVaultContext(created);
      setVault(created);
      return created;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create workspace project.";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account?.address, client, ensureWorkspaceRootDirectories]);

  const ensureVault = useCallback(async (): Promise<VaultContext> => {
    // Only trust in-memory state from a completed load/create — not localStorage,
    // which can still hold IDs from a previous package publish.
    if (vaultRef.current) {
      await ensureWorkspaceRootDirectories(vaultRef.current);
      return vaultRef.current;
    }
    const loaded = await loadVault();
    if (loaded) {
      await ensureWorkspaceRootDirectories(loaded);
      return loaded;
    }
    return createVault();
  }, [createVault, ensureWorkspaceRootDirectories, loadVault]);

  useEffect(() => {
    if (!account?.address) {
      setVault(null);
      return;
    }
    void loadVault().catch(() => {
      // Error state is handled in loadVault.
    });
  }, [account?.address, loadVault]);

  const signAndExecute = useCallback(
    async (tx: Transaction): Promise<ExecutedTransactionSummary> => {
      const summary = await executeTransaction(tx);
      // File/Directory mutations never change the Project's own identifying
      // fields, so re-resolving the vault isn't needed to report success —
      // do it in the background instead of blocking the caller on an extra
      // RPC round-trip for every single on-chain write.
      if (account?.address) {
        void findVaultContext(client, account.address)
          .then((refreshed) => {
            if (refreshed) {
              setVault(refreshed);
            }
          })
          .catch(() => {
            // Best-effort refresh; surfaced errors would be misleading here
            // since the write itself already succeeded.
          });
      }
      return summary;
    },
    [account?.address, client, executeTransaction],
  );

  return {
    vault,
    loading,
    error,
    loadVault,
    createVault,
    ensureVault,
    signAndExecute,
    account,
    client,
  };
}
