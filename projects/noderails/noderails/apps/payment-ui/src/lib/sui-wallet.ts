import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@noderails/common';
import { resolveSuiCoinType } from './sui-balance';
import { resolveSuiBrowserRpcUrl } from './sui-rpc';
import { API_BASE } from './api';

export type SuiEscrowObjectIds = {
  packageId: string;
  configObjectId: string;
  registryObjectId: string;
  walletRegistryObjectId: string;
};

const WALLET_RULE_ACTIVE = 1;
const TX_CONFIRM_TIMEOUT_MS = 120_000;
const TX_POLL_INTERVAL_MS = 1_500;
const WALLET_STATE_POLL_MS = 1_500;
const WALLET_STATE_MAX_ATTEMPTS = 12;

function suiClientForBrowser(chainId: number): SuiClient {
  return new SuiClient({ url: resolveSuiBrowserRpcUrl(chainId) });
}

async function waitForSuiTransactionConfirmed(client: SuiClient, digest: string): Promise<void> {
  const deadline = Date.now() + TX_CONFIRM_TIMEOUT_MS;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const tx = await client.getTransactionBlock({
        digest,
        options: { showEffects: true },
      });
      const status = tx.effects?.status?.status;
      if (status === 'success') {
        return;
      }
      if (status === 'failure') {
        throw new Error(tx.effects?.status?.error ?? 'Transaction failed on-chain');
      }
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('failed on-chain') || msg.includes('Transaction failed')) {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  throw new Error(
    lastErr instanceof Error
      ? `Transaction confirmation timed out (${lastErr.message}). If it succeeded on-chain, click Refresh.`
      : 'Transaction confirmation timed out. If it succeeded on-chain, click Refresh.',
  );
}

async function readWalletSubscriptionState(
  client: SuiClient,
  params: {
    packageId: string;
    walletObjectId: string;
    coinType: string;
    merchant: string;
    sender: string;
  },
): Promise<{ balance: bigint; remainingBudget: bigint; maxPerCharge: bigint; ruleStatus: number }> {
  const tx = new Transaction();
  tx.setSender(params.sender);
  tx.moveCall({
    target: `${params.packageId}::escrow::wallet_subscription_state`,
    typeArguments: [params.coinType],
    arguments: [tx.object(params.walletObjectId), tx.pure.address(params.merchant)],
  });
  const insp = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: params.sender,
  });
  if (insp.error) {
    throw new Error(insp.error);
  }
  const rv = insp.results?.[0]?.returnValues ?? [];
  const readU64 = (i: number) => {
    const bytes = rv[i]?.[0] ?? [];
    const buf = Buffer.from(bytes);
    return buf.length >= 8 ? buf.readBigUInt64LE(0) : 0n;
  };
  return {
    balance: readU64(0),
    remainingBudget: readU64(1),
    maxPerCharge: readU64(2),
    ruleStatus: rv[3]?.[0]?.[0] ?? 0,
  };
}

async function readWalletIdForOwner(
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
  const insp = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: params.owner,
  });
  if (insp.error) {
    throw new Error(insp.error);
  }
  const rv = insp.results?.[0]?.returnValues?.[0]?.[0] ?? [];
  if (rv.length === 0 || rv[0] === 0) {
    return null;
  }
  const idBytes = rv.slice(1);
  if (idBytes.length < 32) {
    return null;
  }
  return `0x${Buffer.from(idBytes).toString('hex')}`;
}

export async function fetchSuiWalletSubscriptionState(params: {
  objects: SuiEscrowObjectIds;
  chainId: number;
  tokenContractAddress: string;
  payer: string;
  merchant: string;
}): Promise<{
  balance: bigint;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  ruleStatus: number;
  authorized: boolean;
  walletFound: boolean;
}> {
  const client = suiClientForBrowser(params.chainId);
  const coinType = resolveSuiCoinType(params.tokenContractAddress);
  const payer = normalizeSuiAddress(params.payer);
  const merchant = normalizeSuiAddress(params.merchant);
  const walletId = await readWalletIdForOwner(client, {
    packageId: params.objects.packageId,
    walletRegistryObjectId: params.objects.walletRegistryObjectId,
    owner: payer,
  });
  if (!walletId) {
    return {
      balance: 0n,
      remainingBudget: 0n,
      maxPerCharge: 0n,
      ruleStatus: 0,
      authorized: false,
      walletFound: false,
    };
  }
  const state = await readWalletSubscriptionState(client, {
    packageId: params.objects.packageId,
    walletObjectId: walletId,
    coinType,
    merchant,
    sender: payer,
  });
  return {
    balance: state.balance,
    remainingBudget: state.remainingBudget,
    maxPerCharge: state.maxPerCharge,
    ruleStatus: state.ruleStatus,
    authorized: state.ruleStatus === WALLET_RULE_ACTIVE && state.remainingBudget > 0n,
    walletFound: true,
  };
}

/** True when an on-chain subscription wallet can cover the next billing charge. */
export function isSuiSubscriptionWalletReadyForCharge(
  state: {
    walletFound: boolean;
    ruleStatus: number;
    balance: bigint;
    remainingBudget: bigint;
    maxPerCharge: bigint;
  },
  chargeAmount: bigint,
): boolean {
  if (!state.walletFound || chargeAmount <= 0n) return false;
  if (state.ruleStatus !== WALLET_RULE_ACTIVE) return false;
  if (state.balance < chargeAmount) return false;
  if (state.remainingBudget < chargeAmount) return false;
  if (state.maxPerCharge > 0n && state.maxPerCharge < chargeAmount) return false;
  return true;
}

export function describeSuiSubscriptionWalletBlocker(
  state: {
    walletFound: boolean;
    ruleStatus: number;
    balance: bigint;
    remainingBudget: bigint;
    maxPerCharge: bigint;
  } | null,
  chargeAmount: bigint,
): string {
  if (!state?.walletFound) {
    return 'Fund your subscription wallet first (step 1), then complete payment.';
  }
  if (state.ruleStatus !== WALLET_RULE_ACTIVE) {
    return 'Subscription wallet found but not authorized for this merchant. Click Authorize in step 1.';
  }
  if (state.maxPerCharge > 0n && state.maxPerCharge < chargeAmount) {
    return 'The subscription wallet max per charge is lower than this payment amount. Click Authorize again to update the limit.';
  }
  if (state.balance < chargeAmount || state.remainingBudget < chargeAmount) {
    return 'Subscription wallet balance is too low for this charge. Click Authorize to add funds.';
  }
  return 'Fund your subscription wallet first (step 1), then complete payment.';
}

export async function waitForSuiSubscriptionWallet(params: {
  objects: SuiEscrowObjectIds;
  chainId: number;
  tokenContractAddress: string;
  payer: string;
  merchant: string;
  minRemainingBudget: bigint;
  digest: string;
  maxAttempts?: number;
}): Promise<Awaited<ReturnType<typeof fetchSuiWalletSubscriptionState>>> {
  const client = suiClientForBrowser(params.chainId);
  await waitForSuiTransactionConfirmed(client, params.digest);

  const attempts = params.maxAttempts ?? WALLET_STATE_MAX_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    const state = await fetchSuiWalletSubscriptionState(params);
    if (
      state.walletFound &&
      state.authorized &&
      state.remainingBudget >= params.minRemainingBudget
    ) {
      return state;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, WALLET_STATE_POLL_MS));
    }
  }

  throw new Error(
    'Subscription wallet transaction confirmed but wallet state is not readable yet. Wait a moment and click Refresh, then complete payment.',
  );
}

type SponsorSignData = {
  transactionBlockBase64: string;
  sponsorSignature: string;
  dualSignRequired?: boolean;
};

async function buildSponsorSignTransactionBase64(
  tx: Transaction,
  sender: string,
  client: SuiClient,
): Promise<string> {
  tx.setSender(sender);
  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  const withSender = Transaction.fromKind(kindBytes);
  withSender.setSender(sender);
  const bytes = await withSender.build({ client });
  return Buffer.from(bytes).toString('base64');
}

async function executeSuiSponsoredCheckout(params: {
  checkoutSessionId: string;
  chainId: number;
  packageId: string;
  sponsorData: SponsorSignData;
  signTransactionBlock: (transactionBlockBase64: string) => Promise<string>;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const needsUserSign = params.sponsorData.dualSignRequired !== false;
  let userSignature: string | undefined;
  if (needsUserSign) {
    userSignature = await params.signTransactionBlock(params.sponsorData.transactionBlockBase64);
  }

  const execRes = await fetch(`${API_BASE}/checkout/sui/execute-sponsored`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkoutSessionId: params.checkoutSessionId,
      chainId: params.chainId,
      packageId: params.packageId,
      transactionBlockBase64: params.sponsorData.transactionBlockBase64,
      userSignature,
      sponsorSignature: params.sponsorData.sponsorSignature,
      dualSignRequired: params.sponsorData.dualSignRequired,
      metadata: params.metadata,
    }),
  });
  if (!execRes.ok) {
    const err = await execRes.json().catch(() => ({}));
    throw new Error(err.error?.message ?? 'Sui execute-sponsored failed');
  }
  const execJson = await execRes.json();
  const execData = execJson.data ?? execJson;
  return execData.digest as string;
}

export async function executeSuiWalletSetup(params: {
  checkoutSessionId: string;
  chainId: number;
  objects: SuiEscrowObjectIds;
  tokenContractAddress: string;
  merchantAddress: string;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  expiresAtMs: bigint;
  payerAddress: string;
  signTransactionBlock: (transactionBlockBase64: string) => Promise<string>;
}): Promise<string> {
  const merchantAddress = normalizeSuiAddress(params.merchantAddress);
  const payerAddress = normalizeSuiAddress(params.payerAddress);
  const sponsorRes = await fetch(`${API_BASE}/checkout/sui/sponsor-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkoutSessionId: params.checkoutSessionId,
      chainId: params.chainId,
      senderAddress: payerAddress,
      walletSetup: {
        tokenContractAddress: params.tokenContractAddress,
        merchantAddress,
        remainingBudget: params.remainingBudget.toString(),
        maxPerCharge: params.maxPerCharge.toString(),
        expiresAtMs: params.expiresAtMs.toString(),
      },
    }),
  });
  if (!sponsorRes.ok) {
    const err = await sponsorRes.json().catch(() => ({}));
    throw new Error(err.error?.message ?? 'Sui sponsor-sign failed');
  }
  const sponsorJson = await sponsorRes.json();
  const sponsorData = sponsorJson.data ?? sponsorJson;

  return executeSuiSponsoredCheckout({
    checkoutSessionId: params.checkoutSessionId,
    chainId: params.chainId,
    packageId: params.objects.packageId,
    sponsorData,
    signTransactionBlock: params.signTransactionBlock,
    metadata: { kind: 'wallet_setup_subscription' },
  });
}

export async function executeSuiWalletCancelAndWithdraw(params: {
  checkoutSessionId: string;
  chainId: number;
  objects: SuiEscrowObjectIds;
  tokenContractAddress: string;
  walletObjectId: string;
  merchantAddress: string;
  withdrawAmount: bigint;
  payerAddress: string;
  signTransactionBlock: (transactionBlockBase64: string) => Promise<string>;
}): Promise<string> {
  const coinType = resolveSuiCoinType(params.tokenContractAddress);
  const tx = new Transaction();
  tx.setSender(params.payerAddress);
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::wallet_cancel_subscription`,
    typeArguments: [coinType],
    arguments: [tx.object(params.walletObjectId), tx.pure.address(params.merchantAddress)],
  });
  if (params.withdrawAmount > 0n) {
    tx.moveCall({
      target: `${params.objects.packageId}::escrow::wallet_withdraw`,
      typeArguments: [coinType],
      arguments: [tx.object(params.walletObjectId), tx.pure.u64(params.withdrawAmount)],
    });
  }

  const client = suiClientForBrowser(params.chainId);
  const transactionBase64 = await buildSponsorSignTransactionBase64(tx, params.payerAddress, client);

  const sponsorRes = await fetch(`${API_BASE}/checkout/sui/sponsor-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checkoutSessionId: params.checkoutSessionId,
      chainId: params.chainId,
      senderAddress: params.payerAddress,
      transactionBase64,
    }),
  });
  if (!sponsorRes.ok) {
    const err = await sponsorRes.json().catch(() => ({}));
    throw new Error(err.error?.message ?? 'Sui sponsor-sign failed');
  }
  const sponsorJson = await sponsorRes.json();
  const sponsorData = sponsorJson.data ?? sponsorJson;

  return executeSuiSponsoredCheckout({
    checkoutSessionId: params.checkoutSessionId,
    chainId: params.chainId,
    packageId: params.objects.packageId,
    sponsorData,
    signTransactionBlock: params.signTransactionBlock,
    metadata: { kind: 'wallet_cancel_withdraw' },
  });
}

/** @deprecated use fetchSuiWalletSubscriptionState */
export const fetchSuiSubscriptionPoolBalance = async (params: {
  objects: SuiEscrowObjectIds;
  chainId: number;
  walletRegistryObjectId?: string;
  tokenContractAddress: string;
  payer: string;
  merchant: string;
}) => {
  if (!params.walletRegistryObjectId) {
    return 0n;
  }
  const state = await fetchSuiWalletSubscriptionState({
    objects: params.objects,
    chainId: params.chainId,
    tokenContractAddress: params.tokenContractAddress,
    payer: params.payer,
    merchant: params.merchant,
  });
  return state.balance;
};

/** @deprecated use executeSuiWalletSetup */
export const executeSuiFundSubscriptionPool = executeSuiWalletSetup;
