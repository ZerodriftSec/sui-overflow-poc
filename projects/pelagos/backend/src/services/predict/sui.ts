/**
 * Sui client and signer resolution for the Predict service. Lazily caches a
 * a Core gRPC client (getSuiClient) and an Ed25519 signer (getSigner), resolved
 * from PREDICT_SIGNER_PRIVATE_KEY/SUI_PRIVATE_KEY or a Sui CLI keystore at
 * SUI_KEYSTORE_PATH (matched to SUI_ACTIVE_ADDRESS). signerAddress() returns the
 * signer's address or null so read-only/devInspect flows work with no key.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { SuiClientTypes } from '@mysten/sui/client';
import type { SuiObjectChange } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { fromBase64 } from '@mysten/sui/utils';
import type { Transaction } from '@mysten/sui/transactions';
import { PREDICT } from './config';

type LegacyOptions = {
  showEffects?: boolean;
  showEvents?: boolean;
  showBalanceChanges?: boolean;
  showObjectChanges?: boolean;
  showRawEffects?: boolean;
};

type LegacyEffects = Partial<Omit<SuiClientTypes.TransactionEffects, 'status'>> & {
  status: { status: 'success' | 'failure'; error?: string };
};

type LegacyEvent = {
  type: string;
  parsedJson: Record<string, unknown> | null;
  packageId: string;
  transactionModule: string;
  sender: string;
};

type LegacyBalanceChange = {
  coinType: string;
  amount: string;
  owner: { AddressOwner: string };
};

export type LegacyTransactionResult = {
  digest: string;
  effects: LegacyEffects;
  events?: LegacyEvent[];
  balanceChanges?: LegacyBalanceChange[];
  objectChanges?: SuiObjectChange[];
  rawEffects?: number[];
};

function transactionFrom(
  result: SuiClientTypes.TransactionResult<{
    effects: true;
    events: true;
    balanceChanges: true;
    objectTypes: true;
    transaction: true;
  }>,
) {
  return result.$kind === 'Transaction' ? result.Transaction : result.FailedTransaction;
}

function errorMessage(status: SuiClientTypes.ExecutionStatus): string | undefined {
  return status.success ? undefined : status.error.message;
}

function objectChanges(
  tx: ReturnType<typeof transactionFrom>,
): SuiObjectChange[] {
  const sender = tx.transaction?.sender ?? '';
  return (tx.effects?.changedObjects ?? []).map((change) => {
    const objectType = tx.objectTypes?.[change.objectId] ?? '';
    if (change.idOperation === 'Created') {
      return {
        type: 'created',
        sender,
        objectId: change.objectId,
        objectType,
        owner: change.outputOwner ?? { Immutable: true },
        version: change.outputVersion ?? '0',
        digest: change.outputDigest ?? '',
      } as SuiObjectChange;
    }
    if (change.idOperation === 'Deleted' || change.outputState === 'DoesNotExist') {
      return {
        type: 'deleted',
        sender,
        objectId: change.objectId,
        objectType,
        version: change.inputVersion ?? '0',
      } as SuiObjectChange;
    }
    const ownerChanged = JSON.stringify(change.inputOwner) !== JSON.stringify(change.outputOwner);
    if (ownerChanged && change.outputOwner) {
      return {
        type: 'transferred',
        sender,
        objectId: change.objectId,
        objectType,
        recipient: change.outputOwner,
        version: change.outputVersion ?? '0',
        digest: change.outputDigest ?? '',
      } as SuiObjectChange;
    }
    return {
      type: 'mutated',
      sender,
      objectId: change.objectId,
      objectType,
      owner: change.outputOwner ?? change.inputOwner ?? { Immutable: true },
      previousVersion: change.inputVersion ?? '0',
      version: change.outputVersion ?? change.inputVersion ?? '0',
      digest: change.outputDigest ?? change.inputDigest ?? '',
    } as SuiObjectChange;
  });
}

function toLegacyResult(
  result: SuiClientTypes.TransactionResult<{
    effects: true;
    events: true;
    balanceChanges: true;
    objectTypes: true;
    transaction: true;
  }>,
): LegacyTransactionResult {
  const tx = transactionFrom(result);
  const effects: LegacyEffects = tx.effects
    ? {
        ...tx.effects,
        status: {
          status: tx.status.success ? 'success' as const : 'failure' as const,
          error: errorMessage(tx.status),
        },
      }
    : {
        status: {
          status: tx.status.success ? 'success' : 'failure',
          error: errorMessage(tx.status),
        },
      };
  return {
    digest: tx.digest,
    effects,
    events: (tx.events ?? []).map((event) => ({
      type: event.eventType,
      parsedJson: event.json,
      packageId: event.packageId,
      transactionModule: event.module,
      sender: event.sender,
    })),
    balanceChanges: (tx.balanceChanges ?? []).map((change) => ({
      coinType: change.coinType,
      amount: change.amount,
      owner: { AddressOwner: change.address },
    })),
    objectChanges: objectChanges(tx),
    rawEffects: effects.bcs ? Array.from(effects.bcs) : undefined,
  };
}

/**
 * Compatibility facade for the legacy JSON-RPC-shaped service code.
 *
 * Mysten's public fullnodes now expose the Core gRPC API at the same URL and no
 * longer answer JSON-RPC POSTs. Keeping the shape conversion here lets product
 * services migrate transport without duplicating response translation in every
 * quote, prepare, execute, and confirmation path.
 */
export class PelagosSuiClient {
  readonly grpc: SuiGrpcClient;
  readonly core: SuiGrpcClient['core'];

  constructor(baseUrl: string, network: 'mainnet' | 'testnet' | 'devnet' | 'localnet') {
    this.grpc = new SuiGrpcClient({ baseUrl, network });
    this.core = this.grpc.core;
  }

  async getBalance({ owner, coinType }: { owner: string; coinType?: string }) {
    const { balance } = await this.grpc.getBalance({ owner, coinType });
    return {
      coinType: balance.coinType,
      totalBalance: balance.balance,
      coinObjectCount: 0,
      lockedBalance: {},
    };
  }

  async getCoins({
    owner,
    coinType,
    cursor,
    limit,
  }: {
    owner: string;
    coinType?: string;
    cursor?: string | null;
    limit?: number;
  }) {
    const page = await this.grpc.listCoins({ owner, coinType, cursor, limit });
    return {
      data: page.objects.map((coin) => ({
        coinType: coinType ?? coin.type,
        coinObjectId: coin.objectId,
        version: coin.version,
        digest: coin.digest,
        balance: coin.balance,
        previousTransaction: '',
      })),
      nextCursor: page.cursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async getOwnedObjects({
    owner,
    filter,
    options,
    cursor,
    limit,
  }: {
    owner: string;
    filter?: { StructType?: string };
    options?: { showContent?: boolean };
    cursor?: string | null;
    limit?: number;
  }) {
    const page = await this.grpc.listOwnedObjects({
      owner,
      type: filter?.StructType,
      cursor,
      limit,
      include: { json: true },
    });
    return {
      data: page.objects.map((object) => ({
        data: {
          objectId: object.objectId,
          version: object.version,
          digest: object.digest,
          type: object.type,
          owner: object.owner,
          content: options?.showContent
            ? {
                dataType: 'moveObject' as const,
                type: object.type,
                hasPublicTransfer: true,
                fields: object.json ?? {},
              }
            : null,
        },
      })),
      nextCursor: page.cursor,
      hasNextPage: page.hasNextPage,
    };
  }

  async devInspectTransactionBlock({
    sender,
    transactionBlock,
  }: {
    sender: string;
    transactionBlock: Transaction | Uint8Array;
  }) {
    if (!(transactionBlock instanceof Uint8Array)) {
      transactionBlock.setSenderIfNotSet(sender);
    }
    const simulated = await this.grpc.simulateTransaction({
      transaction: transactionBlock,
      checksEnabled: false,
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
        commandResults: true,
      },
    });
    const base = toLegacyResult(simulated);
    return {
      ...base,
      results: simulated.commandResults?.map((command) => ({
        returnValues: command.returnValues.map(
          (value) => [Array.from(value.bcs), ''] as [number[], string],
        ),
        mutableReferenceOutputs: command.mutatedReferences.map(
          (value) => [Array.from(value.bcs), ''] as [number[], string],
        ),
      })),
    };
  }

  async dryRunTransactionBlock({ transactionBlock }: { transactionBlock: Uint8Array }) {
    const simulated = await this.grpc.simulateTransaction({
      transaction: transactionBlock,
      checksEnabled: true,
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
      },
    });
    return toLegacyResult(simulated);
  }

  async signAndExecuteTransaction({
    transaction,
    signer,
  }: {
    transaction: Transaction | Uint8Array;
    signer: Ed25519Keypair;
    options?: LegacyOptions;
  }) {
    const result = await this.grpc.signAndExecuteTransaction({
      transaction,
      signer,
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
      },
    });
    return toLegacyResult(result);
  }

  async executeTransactionBlock({
    transactionBlock,
    signature,
  }: {
    transactionBlock: string | Uint8Array;
    signature: string | string[];
    options?: LegacyOptions;
  }) {
    const result = await this.grpc.executeTransaction({
      transaction: typeof transactionBlock === 'string' ? fromBase64(transactionBlock) : transactionBlock,
      signatures: Array.isArray(signature) ? signature : [signature],
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
      },
    });
    return toLegacyResult(result);
  }

  async waitForTransaction({
    digest,
    timeout,
  }: {
    digest: string;
    timeout?: number;
    options?: LegacyOptions;
  }) {
    const result = await this.grpc.waitForTransaction({
      digest,
      timeout,
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
      },
    });
    return toLegacyResult(result);
  }

  async getTransactionBlock({ digest }: { digest: string; options?: LegacyOptions }) {
    const result = await this.grpc.getTransaction({
      digest,
      include: {
        effects: true,
        events: true,
        balanceChanges: true,
        objectTypes: true,
        transaction: true,
      },
    });
    return toLegacyResult(result);
  }
}

let cachedClient: PelagosSuiClient | null = null;

export function getSuiClient(): PelagosSuiClient {
  if (!cachedClient) {
    cachedClient = new PelagosSuiClient(
      PREDICT.rpcUrl,
      PREDICT.network as 'mainnet' | 'testnet' | 'devnet' | 'localnet',
    );
  }
  return cachedClient;
}

let cachedSigner: Ed25519Keypair | null = null;

function expandPath(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

/**
 * Load an Ed25519 keypair from the Sui CLI keystore.
 *
 * `SUI_KEYSTORE_PATH` may point either directly at a `sui.keystore` file or at
 * the enclosing `sui_config` directory. Each keystore entry is
 * base64(flag_byte || 32-byte secret); flag 0x00 == Ed25519.
 */
function loadFromKeystore(activeAddress?: string): Ed25519Keypair | null {
  const raw = process.env.SUI_KEYSTORE_PATH;
  if (!raw) return null;
  const expanded = expandPath(raw);
  const file = expanded.endsWith('.keystore')
    ? expanded
    : path.join(expanded, 'sui.keystore');
  if (!fs.existsSync(file)) return null;

  const entries = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
  const want = activeAddress?.toLowerCase();
  let firstEd25519: Ed25519Keypair | null = null;

  for (const b64 of entries) {
    const bytes = fromBase64(b64);
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue; // Ed25519 only
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (!firstEd25519) firstEd25519 = kp;
    if (want && kp.getPublicKey().toSuiAddress() === want) return kp;
  }

  // No active address requested (or it didn't match) -> first Ed25519 key.
  return want ? firstEd25519 : firstEd25519;
}

/**
 * Resolve the backend signing keypair.
 *
 * Resolution order:
 *   1. PREDICT_SIGNER_PRIVATE_KEY / SUI_PRIVATE_KEY (bech32 `suiprivkey...` or
 *      base64 of [flag||secret] or raw 32-byte secret)
 *   2. Sui CLI keystore at SUI_KEYSTORE_PATH, matched against SUI_ACTIVE_ADDRESS
 *
 * Read-only flows (server reads, devInspect previews) never call this, so the
 * integration is usable with no key configured.
 */
export function getSigner(): Ed25519Keypair {
  if (cachedSigner) return cachedSigner;

  // NOTE: `||` not `??` — PREDICT_SIGNER_PRIVATE_KEY is often set to an EMPTY
  // string in .env (not unset), and `??` would keep that empty string, silently
  // dropping the valid SUI_PRIVATE_KEY fallback → "no signer configured".
  const pk = process.env.PREDICT_SIGNER_PRIVATE_KEY || process.env.SUI_PRIVATE_KEY;
  if (pk) {
    if (pk.startsWith('suiprivkey')) {
      const { secretKey } = decodeSuiPrivateKey(pk.trim());
      cachedSigner = Ed25519Keypair.fromSecretKey(secretKey);
    } else {
      const bytes = fromBase64(pk.trim());
      cachedSigner = Ed25519Keypair.fromSecretKey(
        bytes.length === 33 ? bytes.slice(1) : bytes,
      );
    }
    return cachedSigner;
  }

  const fromStore = loadFromKeystore(process.env.SUI_ACTIVE_ADDRESS);
  if (fromStore) {
    cachedSigner = fromStore;
    return cachedSigner;
  }

  throw new Error(
    'No Predict signer configured. Set PREDICT_SIGNER_PRIVATE_KEY (suiprivkey... or base64), ' +
      'or SUI_KEYSTORE_PATH (+ optional SUI_ACTIVE_ADDRESS) pointing at your Sui CLI keystore.',
  );
}

/** Address of the configured signer, or null when no key is available. */
export function signerAddress(): string | null {
  try {
    return getSigner().getPublicKey().toSuiAddress();
  } catch {
    return null;
  }
}
