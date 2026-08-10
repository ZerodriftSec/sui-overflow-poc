import { Connection, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { getSolanaPublicRpcUrl, isValidSolanaAddress } from '@noderails/common';
import {
  escrowConfigPda,
  parseEscrowConfigFeeRecipient,
  initiateDisputeInstruction,
  instructionToMtxmSolana,
  refundNativeInstruction,
  refundSplInstruction,
  resolveDisputeNativeInstruction,
  resolveDisputeSplInstruction,
  settleNativeInstruction,
  settleSplInstruction,
} from '@noderails/solana';
import type { MtxmSendTxRequest } from '@noderails/mtxm-client';
import { env } from '../../config.js';
import { uuidToBytes32 } from './crypto-utils.js';

/** Re-export parser name aligned with on-chain fetch */
export { parseEscrowConfigFeeRecipient } from '@noderails/solana';

export function paymentIntentIdSolanaBytes(intentUuid: string): Uint8Array {
  const hex = uuidToBytes32(intentUuid);
  return Uint8Array.from(Buffer.from(hex.slice(2), 'hex'));
}

export function mtxmSolanaAuthority(): PublicKey {
  if (!env.MTXM_SOLANA_SIGNER_PUBKEY?.trim()) {
    throw new Error('MTXM_SOLANA_SIGNER_PUBKEY is required for Solana escrow transactions');
  }
  return new PublicKey(env.MTXM_SOLANA_SIGNER_PUBKEY.trim());
}

/** Unsigned legacy `Transaction` as base64 for MTXM `solana.transactionBase64` (bypasses per-ix `keys` validation). */
export function serializeUnsignedLegacyTransactionBase64(params: {
  feePayer: PublicKey;
  recentBlockhash: string;
  instructions: TransactionInstruction[];
}): string {
  const tx = new Transaction();
  for (const ix of params.instructions) {
    tx.add(ix);
  }
  tx.feePayer = params.feePayer;
  tx.recentBlockhash = params.recentBlockhash;
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }) as Uint8Array;
  return Buffer.from(serialized).toString('base64');
}

export type MtxmSolanaProgramBlock = NonNullable<MtxmSendTxRequest['solana']>;

/** CU budget for MTXM `solana` program sends (see MTXM `cuLimit` / `cuPriceMicroLamports`). */
export function mtxmSolanaProgramBlock(
  instructions: NonNullable<MtxmSolanaProgramBlock['instructions']>,
): MtxmSolanaProgramBlock {
  const units = env.MTXM_SOLANA_CU_LIMIT >= 1 ? env.MTXM_SOLANA_CU_LIMIT : 1_400_000;
  /** MTXM rejects `instructions` with empty `keys`; compute-budget ixs have no accounts, so use `cuLimit` only. */
  const block: MtxmSolanaProgramBlock = { instructions };
  if (units >= 1) {
    block.cuLimit = Math.floor(units);
  }
  if (env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS != null && env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS > 0) {
    block.cuPriceMicroLamports = env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS;
  }
  return block;
}

export function solanaRpcForChain(chain: { rpcUrl: string | null; chainId: number }): string {
  const trimmed = chain.rpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }
  const pub = getSolanaPublicRpcUrl(chain.chainId);
  if (pub) {
    return pub;
  }
  throw new Error(
    `No Solana RPC configured for chainId ${chain.chainId}. Set SupportedChain.rpcUrl in admin, or use a standard NodeRails Solana chain id (101 / 102 / 103).`,
  );
}

export async function fetchEscrowFeeRecipientPubkey(
  rpcUrl: string,
  programId: PublicKey,
): Promise<PublicKey> {
  const conn = new Connection(rpcUrl, 'confirmed');
  const cfg = escrowConfigPda(programId);
  const acc = await conn.getAccountInfo(cfg, 'confirmed');
  if (!acc?.data) throw new Error('Escrow config PDA not found on-chain');
  return parseEscrowConfigFeeRecipient(new Uint8Array(acc.data));
}

type AppWithChains = {
  receivingWallet: string | null;
  appChains: { chainId: number; settlementAddress: string | null }[];
};

export function merchantSolanaPubkey(intent: { app: AppWithChains }, chainId: number): PublicKey {
  const row = intent.app.appChains.find((c) => c.chainId === chainId);
  const addr = row?.settlementAddress?.trim() || intent.app.receivingWallet?.trim();
  if (!addr || !isValidSolanaAddress(addr)) {
    throw new Error('Invalid or missing Solana merchant settlement address for this app/chain');
  }
  return new PublicKey(addr);
}

export function buildSettleNativeMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  merchantRecipient: PublicKey,
  feeRecipient: PublicKey,
) {
  const ix = settleNativeInstruction({
    programId,
    authority,
    paymentIntentId,
    merchantRecipient,
    feeRecipient,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildRefundNativeMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  payerRecipient: PublicKey,
) {
  const ix = refundNativeInstruction({
    programId,
    authority,
    paymentIntentId,
    payerRecipient,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildInitiateDisputeMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
) {
  const ix = initiateDisputeInstruction({ programId, authority, paymentIntentId });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildResolveDisputeNativeMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  merchantRecipient: PublicKey,
  payerRecipient: PublicKey,
  feeRecipient: PublicKey,
  winner: PublicKey,
) {
  const ix = resolveDisputeNativeInstruction({
    programId,
    authority,
    paymentIntentId,
    merchantRecipient,
    payerRecipient,
    feeRecipient,
    winner,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildSettleSplMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  mint: PublicKey,
  merchantRecipient: PublicKey,
  feeRecipient: PublicKey,
  tokenProgramId: PublicKey,
) {
  const ix = settleSplInstruction({
    programId,
    authority,
    paymentIntentId,
    mint,
    merchantRecipient,
    feeRecipient,
    tokenProgramId,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildRefundSplMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  mint: PublicKey,
  payerOwner: PublicKey,
  tokenProgramId: PublicKey,
) {
  const ix = refundSplInstruction({
    programId,
    authority,
    paymentIntentId,
    mint,
    payerOwner,
    tokenProgramId,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}

export function buildResolveDisputeSplMtxmPayload(
  programId: PublicKey,
  authority: PublicKey,
  paymentIntentId: Uint8Array,
  mint: PublicKey,
  merchantRecipient: PublicKey,
  payerOwner: PublicKey,
  feeRecipient: PublicKey,
  winner: PublicKey,
  tokenProgramId: PublicKey,
) {
  const ix = resolveDisputeSplInstruction({
    programId,
    authority,
    paymentIntentId,
    mint,
    merchantRecipient,
    payerOwner,
    feeRecipient,
    winner,
    tokenProgramId,
  });
  return {
    to: programId.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
  };
}
