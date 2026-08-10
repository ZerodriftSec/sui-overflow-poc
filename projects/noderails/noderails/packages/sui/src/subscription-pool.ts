/**
 * @deprecated Subscription pool removed — use `./wallet.js` (NodeRailsWallet path).
 * Re-exports wallet builders for backward compatibility during migration.
 */
export {
  buildCaptureFromWalletTx as buildCaptureFromSubscriptionPoolTx,
  readWalletSubscriptionState,
  pickSuiCoinObjectId,
  WALLET_RULE_ACTIVE,
  type SuiWalletSubscriptionState,
} from './wallet.js';

import type { SuiClient } from '@mysten/sui/client';
import { SUI_NATIVE_COIN_TYPE, type SuiEscrowObjectIds } from './escrow.js';
import {
  buildWalletFundAndAuthorizeTx,
  buildWalletInitSubscriptionTx,
  readWalletIdForOwner,
  readWalletSubscriptionState,
} from './wallet.js';

/** @deprecated Use buildWalletInitSubscriptionTx / buildWalletFundAndAuthorizeTx */
export function buildFundSubscriptionPoolTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  merchantAddress: string;
  coinObjectId: string;
  amount: bigint;
}): import('@mysten/sui/transactions').Transaction {
  const expiresAtMs = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return buildWalletInitSubscriptionTx({
    objects: params.objects,
    coinType: params.coinType,
    merchantAddress: params.merchantAddress,
    coinObjectId: params.coinObjectId,
    remainingBudget: params.amount,
    maxPerCharge: params.amount,
    expiresAtMs,
  });
}

/** @deprecated Use readWalletSubscriptionState */
export async function readSubscriptionPoolBalance(
  client: SuiClient,
  params: {
    packageId: string;
    registryObjectId: string;
    walletRegistryObjectId?: string;
    coinType: string;
    payer: string;
    merchant: string;
  },
): Promise<bigint> {
  if (!params.walletRegistryObjectId) {
    return 0n;
  }
  const walletId = await readWalletIdForOwner(client, {
    packageId: params.packageId,
    walletRegistryObjectId: params.walletRegistryObjectId,
    owner: params.payer,
  });
  if (!walletId) {
    return 0n;
  }
  const state = await readWalletSubscriptionState(client, {
    packageId: params.packageId,
    walletObjectId: walletId,
    coinType: params.coinType === 'native' ? SUI_NATIVE_COIN_TYPE : params.coinType,
    merchant: params.merchant,
    sender: params.payer,
  });
  return state.balance;
}
