import type { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID, SUI_NATIVE_COIN_TYPE, type SuiEscrowObjectIds } from './escrow.js';
import { withSuiRpcRetry } from './sui-rpc-retry.js';

export type SuiWalletSubscriptionState = {
  balance: bigint;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  ruleStatus: number;
};

export function buildWalletInitSubscriptionTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  merchantAddress: string;
  coinObjectId: string;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  expiresAtMs: bigint;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.object(params.coinObjectId), [params.remainingBudget]);
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::wallet_init_subscription`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.walletRegistryObjectId),
      coin,
      tx.pure.address(params.merchantAddress),
      tx.pure.u64(params.remainingBudget),
      tx.pure.u64(params.maxPerCharge),
      tx.pure.u64(params.expiresAtMs),
    ],
  });
  return tx;
}

export function buildWalletFundAndAuthorizeTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  walletObjectId: string;
  merchantAddress: string;
  coinObjectId: string;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  expiresAtMs: bigint;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.object(params.coinObjectId), [params.remainingBudget]);
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::wallet_fund_and_authorize`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.walletObjectId),
      coin,
      tx.pure.address(params.merchantAddress),
      tx.pure.u64(params.remainingBudget),
      tx.pure.u64(params.maxPerCharge),
      tx.pure.u64(params.expiresAtMs),
    ],
  });
  return tx;
}

export function buildWalletCancelSubscriptionTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  walletObjectId: string;
  merchantAddress: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::wallet_cancel_subscription`,
    typeArguments: [params.coinType],
    arguments: [tx.object(params.walletObjectId), tx.pure.address(params.merchantAddress)],
  });
  return tx;
}

export function buildWalletWithdrawTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  walletObjectId: string;
  amount: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::wallet_withdraw`,
    typeArguments: [params.coinType],
    arguments: [tx.object(params.walletObjectId), tx.pure.u64(params.amount)],
  });
  return tx;
}

export function buildCaptureFromWalletTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  walletObjectId: string;
  paymentIntentId: Uint8Array;
  merchantAddress: string;
  payerAddress: string;
  amount: bigint;
  feeBps: number;
  timelocks: Uint8Array;
  platformSignature: Uint8Array;
  platformPublicKey: Uint8Array;
}): Transaction {
  if (params.paymentIntentId.length !== 32 || params.timelocks.length !== 32) {
    throw new Error('paymentIntentId and timelocks must be 32 bytes');
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::capture_from_wallet`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.object(params.walletObjectId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
      tx.pure.address(params.merchantAddress),
      tx.pure.address(params.payerAddress),
      tx.pure.u64(params.amount),
      tx.pure.u16(params.feeBps),
      tx.pure.vector('u8', Array.from(params.timelocks)),
      tx.pure.vector('u8', Array.from(params.platformSignature)),
      tx.pure.vector('u8', Array.from(params.platformPublicKey)),
    ],
  });
  return tx;
}

function decodeU64Return(bytes: number[]): bigint {
  const buf = Buffer.from(bytes);
  if (buf.length < 8) return 0n;
  return buf.readBigUInt64LE(0);
}

function decodeU8Return(bytes: number[]): number {
  return bytes[0] ?? 0;
}

export async function readWalletIdForOwner(
  client: SuiClient,
  params: {
    packageId: string;
    walletRegistryObjectId: string;
    owner: string;
  },
): Promise<string | null> {
  const tx = new Transaction();
  tx.setSender(params.owner);
  tx.moveCall({
    target: `${params.packageId}::escrow::wallet_id_for_owner`,
    arguments: [tx.object(params.walletRegistryObjectId), tx.pure.address(params.owner)],
  });
  const insp = await withSuiRpcRetry(() =>
    client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: params.owner,
    }),
  );
  if (insp.error) {
    throw new Error(insp.error);
  }
  const returnValues = insp.results?.[0]?.returnValues;
  if (!returnValues?.length) {
    return null;
  }
  const [bytes] = returnValues[0];
  if (bytes.length === 0 || bytes[0] === 0) {
    return null;
  }
  // Option::some(ID) — id is 32 bytes after tag byte
  const idBytes = bytes.slice(1);
  if (idBytes.length < 32) {
    return null;
  }
  return `0x${Buffer.from(idBytes).toString('hex')}`;
}

export async function readWalletSubscriptionState(
  client: SuiClient,
  params: {
    packageId: string;
    walletObjectId: string;
    coinType: string;
    merchant: string;
    sender: string;
  },
): Promise<SuiWalletSubscriptionState> {
  const coinType = params.coinType === 'native' ? SUI_NATIVE_COIN_TYPE : params.coinType;
  const tx = new Transaction();
  tx.setSender(params.sender);
  tx.moveCall({
    target: `${params.packageId}::escrow::wallet_subscription_state`,
    typeArguments: [coinType],
    arguments: [tx.object(params.walletObjectId), tx.pure.address(params.merchant)],
  });
  const insp = await withSuiRpcRetry(() =>
    client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: params.sender,
    }),
  );
  if (insp.error) {
    throw new Error(insp.error);
  }
  const returnValues = insp.results?.[0]?.returnValues ?? [];
  return {
    balance: decodeU64Return(returnValues[0]?.[0] ?? []),
    remainingBudget: decodeU64Return(returnValues[1]?.[0] ?? []),
    maxPerCharge: decodeU64Return(returnValues[2]?.[0] ?? []),
    ruleStatus: decodeU8Return(returnValues[3]?.[0] ?? []),
  };
}

export async function pickSuiCoinObjectId(
  client: Pick<SuiClient, 'getCoins'>,
  owner: string,
  coinType: string,
): Promise<string> {
  if (coinType === SUI_NATIVE_COIN_TYPE) {
    return 'gas';
  }
  const coins = await withSuiRpcRetry(() => client.getCoins({ owner, coinType }));
  const primary = coins.data[0];
  if (!primary) {
    throw new Error(`No ${coinType} coins found in wallet`);
  }
  return primary.coinObjectId;
}

export const WALLET_RULE_ACTIVE = 1;
export const WALLET_RULE_CANCELLED = 2;
