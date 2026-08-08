import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import {
  NODE_RAILS_SUI_CHAIN_IDS,
  isValidSuiAddress,
  normalizeSuiAddress,
} from '@noderails/common';
import { env } from '../../config.js';
import {
  buildInitiateDisputeTx,
  buildRefundPaymentTx,
  buildResolveDisputeTx,
  buildSettlePaymentTx,
  mtxmSuiRawPtbPayload,
  transactionToMtxmSuiBase64,
  type SuiEscrowObjectIds,
} from '@noderails/sui';
import type { MtxmClient, MtxmSendTxRequest } from '@noderails/mtxm-client';
import { resolveMtxmSuiSigner } from './sui-mtxm-signer.js';
import { uuidToBytes32 } from './crypto-utils.js';

/** Official Sui JSON-RPC endpoints for NodeRails chain IDs (201 / 202 / 203). */
export const SUI_PUBLIC_RPC_URL: Record<number, string> = {
  201: getFullnodeUrl('devnet'),
  202: getFullnodeUrl('testnet'),
  203: getFullnodeUrl('mainnet'),
};

export function paymentIntentIdSuiBytes(intentUuid: string): Uint8Array {
  const hex = uuidToBytes32(intentUuid);
  return Uint8Array.from(Buffer.from(hex.slice(2), 'hex'));
}

export function suiRpcForChain(chain: { rpcUrl: string | null; chainId: number }): string {
  const trimmed = chain.rpcUrl?.trim();
  if (trimmed) return trimmed;
  if (chain.chainId === 202 && env.SUI_TESTNET_RPC_URL) {
    return env.SUI_TESTNET_RPC_URL;
  }
  const pub = SUI_PUBLIC_RPC_URL[chain.chainId];
  if (pub) return pub;
  throw new Error(
    `No Sui RPC configured for chainId ${chain.chainId}. Set SupportedChain.rpcUrl in admin, or use a standard NodeRails Sui chain id (201 / 202 / 203).`,
  );
}

export function suiClientForChain(chain: { rpcUrl: string | null; chainId: number }): SuiClient {
  return new SuiClient({ url: suiRpcForChain(chain) });
}

/** MIST — sponsored one-time capture (split coin + capture_payment). Actual use ~1–3M. */
export const SUI_SPONSOR_GAS_BUDGET_CAPTURE = '15000000';

/**
 * MIST — wallet_init / fund_and_authorize (creates wallet objects + storage).
 * Must be ≤ MTXM sponsor gas-coin balance at execute time (Sui reserves full budget).
 */
export const SUI_SPONSOR_GAS_BUDGET_WALLET_SETUP = '35000000';

/** MIST — default for other sponsored checkout PTBs (cancel, withdraw, etc.). */
export const SUI_SPONSOR_GAS_BUDGET_DEFAULT = '20000000';

export function requireSuiEscrowObjects(chain: {
  escrowAddress: string;
  escrowConfigObjectId: string | null;
  paymentRegistryObjectId: string | null;
  walletRegistryObjectId?: string | null;
}): SuiEscrowObjectIds {
  if (!chain.escrowConfigObjectId?.trim() || !chain.paymentRegistryObjectId?.trim()) {
    throw new Error(
      'SupportedChain is missing Sui escrowConfigObjectId or paymentRegistryObjectId. Register them in admin after publish.',
    );
  }
  if (!chain.walletRegistryObjectId?.trim()) {
    throw new Error(
      'SupportedChain is missing Sui walletRegistryObjectId. Register it in admin after publish (initialize creates WalletRegistry).',
    );
  }
  return {
    packageId: chain.escrowAddress.trim(),
    configObjectId: chain.escrowConfigObjectId.trim(),
    registryObjectId: chain.paymentRegistryObjectId.trim(),
    walletRegistryObjectId: chain.walletRegistryObjectId.trim(),
  };
}

type AppWithChains = {
  receivingWallet: string | null;
  appChains: { chainId: number; settlementAddress: string | null }[];
};

export function merchantSuiAddress(intent: { app: AppWithChains }, chainId: number): string {
  const row = intent.app.appChains.find((c) => c.chainId === chainId);
  const addr = row?.settlementAddress?.trim() || intent.app.receivingWallet?.trim();
  if (!addr || !isValidSuiAddress(addr)) {
    throw new Error('Invalid or missing Sui merchant settlement address for this app/chain');
  }
  return normalizeSuiAddress(addr);
}

export async function buildSettleSuiMtxmPayload(
  mtxm: MtxmClient,
  params: {
    chain: { rpcUrl: string | null; chainId: number; escrowAddress: string; escrowConfigObjectId: string | null; paymentRegistryObjectId: string | null; mtxmChainDbId: string | null };
    coinType: string;
    paymentIntentId: Uint8Array;
  },
): Promise<Pick<MtxmSendTxRequest, 'to' | 'sui'>> {
  const signer = await resolveMtxmSuiSigner(mtxm);
  const objects = requireSuiEscrowObjects(params.chain);
  const client = suiClientForChain(params.chain);
  const tx = buildSettlePaymentTx({
    objects,
    coinType: params.coinType,
    paymentIntentId: params.paymentIntentId,
  });
  const transactionBase64 = await transactionToMtxmSuiBase64(tx, signer.address, client);
  return mtxmSuiRawPtbPayload({
    chainMtxmId: params.chain.mtxmChainDbId?.trim() || String(params.chain.chainId),
    signerId: signer.signerId,
    packageId: objects.packageId,
    transactionBase64,
  });
}

export async function buildRefundSuiMtxmPayload(
  mtxm: MtxmClient,
  params: {
    chain: { rpcUrl: string | null; chainId: number; escrowAddress: string; escrowConfigObjectId: string | null; paymentRegistryObjectId: string | null; mtxmChainDbId: string | null };
    coinType: string;
    paymentIntentId: Uint8Array;
  },
): Promise<Pick<MtxmSendTxRequest, 'to' | 'sui'>> {
  const signer = await resolveMtxmSuiSigner(mtxm);
  const objects = requireSuiEscrowObjects(params.chain);
  const client = suiClientForChain(params.chain);
  const tx = buildRefundPaymentTx({
    objects,
    coinType: params.coinType,
    paymentIntentId: params.paymentIntentId,
  });
  const transactionBase64 = await transactionToMtxmSuiBase64(tx, signer.address, client);
  return mtxmSuiRawPtbPayload({
    chainMtxmId: params.chain.mtxmChainDbId?.trim() || String(params.chain.chainId),
    signerId: signer.signerId,
    packageId: objects.packageId,
    transactionBase64,
  });
}

export async function buildInitiateDisputeSuiMtxmPayload(
  mtxm: MtxmClient,
  params: {
    chain: { rpcUrl: string | null; chainId: number; escrowAddress: string; escrowConfigObjectId: string | null; paymentRegistryObjectId: string | null; mtxmChainDbId: string | null };
    paymentIntentId: Uint8Array;
  },
): Promise<Pick<MtxmSendTxRequest, 'to' | 'sui'>> {
  const signer = await resolveMtxmSuiSigner(mtxm);
  const objects = requireSuiEscrowObjects(params.chain);
  const client = suiClientForChain(params.chain);
  const tx = buildInitiateDisputeTx({
    objects,
    paymentIntentId: params.paymentIntentId,
  });
  const transactionBase64 = await transactionToMtxmSuiBase64(tx, signer.address, client);
  return mtxmSuiRawPtbPayload({
    chainMtxmId: params.chain.mtxmChainDbId?.trim() || String(params.chain.chainId),
    signerId: signer.signerId,
    packageId: objects.packageId,
    transactionBase64,
  });
}

export async function buildResolveDisputeSuiMtxmPayload(
  mtxm: MtxmClient,
  params: {
    chain: { rpcUrl: string | null; chainId: number; escrowAddress: string; escrowConfigObjectId: string | null; paymentRegistryObjectId: string | null; mtxmChainDbId: string | null };
    coinType: string;
    paymentIntentId: Uint8Array;
    winnerAddress: string;
  },
): Promise<Pick<MtxmSendTxRequest, 'to' | 'sui'>> {
  const signer = await resolveMtxmSuiSigner(mtxm);
  const objects = requireSuiEscrowObjects(params.chain);
  const client = suiClientForChain(params.chain);
  const tx = buildResolveDisputeTx({
    objects,
    coinType: params.coinType,
    paymentIntentId: params.paymentIntentId,
    winnerAddress: params.winnerAddress,
  });
  const transactionBase64 = await transactionToMtxmSuiBase64(tx, signer.address, client);
  return mtxmSuiRawPtbPayload({
    chainMtxmId: params.chain.mtxmChainDbId?.trim() || String(params.chain.chainId),
    signerId: signer.signerId,
    packageId: objects.packageId,
    transactionBase64,
  });
}

export function isNodeRailsSuiChainId(chainId: number): boolean {
  return NODE_RAILS_SUI_CHAIN_IDS.has(chainId);
}
