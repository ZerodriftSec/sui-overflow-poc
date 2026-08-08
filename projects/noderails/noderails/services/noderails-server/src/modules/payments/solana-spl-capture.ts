import { packTimelocks, timelocksToHex } from '@noderails/web3';
import {
  buildCaptureSplAuthMessage,
  captureSplInstruction,
  ed25519VerifyInstruction,
  encodeCaptureSplInstructionData,
  escrowAuthorityPda,
  instructionToMtxmSolana,
  payerSplAta,
  PublicKey,
  vaultSplAta,
} from '@noderails/solana';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from '@solana/spl-token';
import { ComputeBudgetProgram, Connection } from '@solana/web3.js';
import { type MtxmClient } from '@noderails/mtxm-client';
import bs58 from 'bs58';
import { ValidationError, isValidSolanaAddress } from '@noderails/common';
import type { Logger } from '@noderails/service-base';
import { uuidToBytes32 } from './crypto-utils.js';
import { env } from '../../config.js';
import {
  mtxmSolanaAuthority,
  mtxmSolanaProgramBlock,
  serializeUnsignedLegacyTransactionBase64,
} from './solana-escrow-tx.js';
import { resolveMintTokenProgramId } from './solana-mint-token-program.js';

const VAULT_ATA_CONFIRM_TIMEOUT_MS = 120_000;
const VAULT_ATA_POLL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSolanaPubkeyInput(address: string): string {
  const t = address.trim();
  if (t.startsWith('0x') || t.startsWith('0X')) {
    return t.slice(2).trim();
  }
  return t;
}

export async function assertSplDelegateForCapture(
  rpcUrl: string,
  programId: PublicKey,
  mint: PublicKey,
  payerOwner: PublicKey,
  requiredAmount: bigint,
  splTokenProgramId: PublicKey,
  logger?: Logger,
): Promise<void> {
  const conn = new Connection(rpcUrl, 'confirmed');

  const ata = payerSplAta(mint, payerOwner, splTokenProgramId);
  const expectedDelegate = escrowAuthorityPda(programId);
  let acc;
  try {
    acc = await getAccount(conn, ata, 'finalized', splTokenProgramId);
  } catch (e: unknown) {
    if (e instanceof TokenAccountNotFoundError) {
      logger?.warn('SPL payer ATA missing on capture RPC', {
        ata: ata.toBase58(),
        mint: mint.toBase58(),
        owner: payerOwner.toBase58(),
        rpcUrl,
        splTokenProgram: splTokenProgramId.toBase58(),
      });
      throw new ValidationError(
        'No SPL token account found for this wallet and mint on the server RPC. Fund the associated token account for this mint, or align SupportedChain.rpcUrl with the same cluster your wallet uses.',
      );
    }
    throw new ValidationError(
      `Could not read SPL token account: ${e instanceof Error ? e.message : 'unknown error'}`,
    );
  }
  if (!acc.mint.equals(mint)) {
    throw new ValidationError('Token account mint does not match the selected token');
  }
  if (!acc.delegate || !acc.delegate.equals(expectedDelegate)) {
    throw new ValidationError(
      'This SPL token is not delegated to NodeRails escrow. Complete the delegation step in checkout first.',
    );
  }
  if (acc.delegatedAmount < requiredAmount) {
    throw new ValidationError(
      `Delegated SPL amount is too low: delegated ${acc.delegatedAmount.toString()} but this payment needs ${requiredAmount.toString()}. Increase the delegation.`,
    );
  }
  if (acc.amount < requiredAmount) {
    throw new ValidationError('Insufficient SPL token balance for this payment');
  }
}

async function ensureEscrowVaultSplAtaExists(
  mtxm: MtxmClient,
  params: {
    mtxmChainId: string;
    conn: Connection;
    payer: PublicKey;
    programId: PublicKey;
    mint: PublicKey;
    splTokenProgramId: PublicKey;
    logger: Logger;
  },
): Promise<void> {
  const vaultAta = vaultSplAta(params.mint, params.programId, params.splTokenProgramId);
  const info = await params.conn.getAccountInfo(vaultAta, 'confirmed');
  if (info) {
    return;
  }

  const escrowAuth = escrowAuthorityPda(params.programId);
  const setupIx = createAssociatedTokenAccountIdempotentInstruction(
    params.payer,
    vaultAta,
    escrowAuth,
    params.mint,
    params.splTokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  params.logger.info('Creating escrow vault ATA via MTXM (required before capture_spl)', {
    vaultAta: vaultAta.toBase58(),
    mint: params.mint.toBase58(),
    escrowAuth: escrowAuth.toBase58(),
  });

  const setupSend = await mtxm.sendTransaction({
    chainId: params.mtxmChainId,
    to: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
    solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(setupIx)]),
  });

  const deadline = Date.now() + VAULT_ATA_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const acc = await params.conn.getAccountInfo(vaultAta, 'confirmed');
    if (acc) {
      params.logger.info('Escrow vault ATA confirmed on-chain', { vaultAta: vaultAta.toBase58() });
      return;
    }
    const st = await mtxm.getTransaction(setupSend.id);
    if (st.status === 'FAILED' || st.status === 'CANCELLED') {
      throw new Error(
        `Escrow vault ATA setup failed in MTXM (${st.status}). id=${setupSend.id}`,
      );
    }
    await sleep(VAULT_ATA_POLL_MS);
  }

  throw new Error(
    `Timed out after ${VAULT_ATA_CONFIRM_TIMEOUT_MS}ms waiting for escrow vault ATA ${vaultAta.toBase58()}`,
  );
}

export interface SolanaSplCaptureMtxmParams {
  intentId: string;
  escrowProgramId: string;
  payerWallet: string;
  merchantWallet: string;
  mint: string;
  amountRaw: bigint;
  feeBps: number;
  disputeStartSeconds: number;
  settlementSeconds: number;
  mtxmChainId: string;
  /** Numeric Solana cluster id (e.g. 101 mainnet, 102 testnet) for MTXM `solana.domain.chainId`. */
  solanaChainId: number;
  rpcUrl: string;
  logger: Logger;
}

/**
 * Sign `capture_spl` auth via MTXM and broadcast the instruction (delegation must already be set).
 */
export async function submitSolanaSplCaptureMtxm(
  mtxm: MtxmClient,
  params: SolanaSplCaptureMtxmParams,
) {
  if (!isValidSolanaAddress(normalizeSolanaPubkeyInput(params.escrowProgramId))) {
    throw new ValidationError('Invalid Solana escrow program id');
  }
  if (
    !isValidSolanaAddress(normalizeSolanaPubkeyInput(params.payerWallet)) ||
    !isValidSolanaAddress(normalizeSolanaPubkeyInput(params.merchantWallet))
  ) {
    throw new ValidationError('Invalid Solana wallet address');
  }
  if (!isValidSolanaAddress(normalizeSolanaPubkeyInput(params.mint))) {
    throw new ValidationError('Invalid SPL mint address');
  }

  const programId = new PublicKey(normalizeSolanaPubkeyInput(params.escrowProgramId));
  const payer = new PublicKey(normalizeSolanaPubkeyInput(params.payerWallet));
  const merchantPk = new PublicKey(normalizeSolanaPubkeyInput(params.merchantWallet));
  const mint = new PublicKey(normalizeSolanaPubkeyInput(params.mint));

  const conn = new Connection(params.rpcUrl.trim(), 'confirmed');
  const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
  if (!splTokenProgramId) {
    throw new ValidationError(
      'SPL mint was not found on the RPC used for capture. Confirm SupportedChain.rpcUrl and chainId match the cluster where the payer holds this token (e.g. devnet vs mainnet).',
    );
  }

  await assertSplDelegateForCapture(
    params.rpcUrl,
    programId,
    mint,
    payer,
    params.amountRaw,
    splTokenProgramId,
    params.logger,
  );

  await ensureEscrowVaultSplAtaExists(mtxm, {
    mtxmChainId: params.mtxmChainId,
    conn,
    payer: mtxmSolanaAuthority(),
    programId,
    mint,
    splTokenProgramId,
    logger: params.logger,
  });

  const paymentIntentIdHex = uuidToBytes32(params.intentId);
  const piBytes = Uint8Array.from(Buffer.from(paymentIntentIdHex.slice(2), 'hex'));

  const capturedAt = Math.floor(Date.now() / 1000);
  const timelocks = packTimelocks(capturedAt, params.disputeStartSeconds, params.settlementSeconds);
  const timelocksBytes = Uint8Array.from(
    Buffer.from(timelocksToHex(timelocks).replace(/^0x/, ''), 'hex'),
  );

  const authMessage = buildCaptureSplAuthMessage({
    paymentIntentId: piBytes,
    merchant: merchantPk,
    mint,
    amount: params.amountRaw,
    feeBps: params.feeBps,
    timelocks: timelocksBytes,
  });

  const authorityPk = mtxmSolanaAuthority();
  const signRes = await mtxm.signTypedData({
    chainId: params.mtxmChainId,
    chainType: 'SOLANA',
    solana: {
      domain: {
        name: 'NodeRailsEscrow',
        version: '1',
        chainId: params.solanaChainId,
        verifyingProgramId: normalizeSolanaPubkeyInput(params.escrowProgramId),
        authority: authorityPk.toBase58(),
      },
      rawPreimageBase64: authMessage.toString('base64'),
      payload: { intentId: params.intentId, kind: 'capture_spl' },
    },
  });

  const sigB58 = signRes.signatureBase58;
  if (!sigB58) {
    throw new Error('MTXM Solana sign-typed missing signatureBase58');
  }
  const sigBytes = new Uint8Array(bs58.decode(sigB58));
  if (sigBytes.length !== 64) {
    throw new Error('Invalid Solana signature length from MTXM');
  }

  const edIx = ed25519VerifyInstruction({
    publicKey: authorityPk,
    message: authMessage,
    signature: Buffer.from(sigBytes),
  });

  const ixData = encodeCaptureSplInstructionData({
    paymentIntentId: piBytes,
    amount: params.amountRaw,
    feeBps: params.feeBps,
    timelocks: timelocksBytes,
  });

  const ix = captureSplInstruction({
    programId,
    authority: authorityPk,
    funder: authorityPk,
    owner: payer,
    payerToken: payerSplAta(mint, payer, splTokenProgramId),
    mint,
    merchant: merchantPk,
    paymentIntentId: piBytes,
    data: ixData,
    tokenProgramId: splTokenProgramId,
  });

  const cuLimit = env.MTXM_SOLANA_CU_LIMIT;
  const signerId = env.MTXM_SOLANA_SIGNER_ID;
  if (!signerId) {
    throw new ValidationError(
      'MTXM_SOLANA_SIGNER_ID is required for SPL capture. Set it to the MTXM signer database id from the dashboard (API: list signers). Ed25519 verify instructions have no account keys; MTXM rejects instruction JSON unless you use transactionBase64, which requires signerId.',
    );
  }

  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  // Include compute budget inside the serialized tx. Do **not** also pass
  // `solana.cuLimit` on the MTXM API: their broadcaster may prepend another
  // `SetComputeUnitLimit`, which Solana rejects (only one per tx).
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit });
  const transactionBase64 = serializeUnsignedLegacyTransactionBase64({
    feePayer: authorityPk,
    recentBlockhash: blockhash,
    instructions: [cuIx, edIx, ix],
  });

  const solBlock = {
    transactionBase64,
    ...(env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS != null && env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS > 0
      ? { cuPriceMicroLamports: env.MTXM_SOLANA_CU_PRICE_MICRO_LAMPORTS }
      : {}),
  };

  params.logger.info('Solana SPL capture submitting via MTXM (transactionBase64)', {
    intentId: params.intentId,
    cuLimit,
    configMtxmCuLimit: env.MTXM_SOLANA_CU_LIMIT,
  });

  return mtxm.sendTransaction({
    chainId: params.mtxmChainId,
    signerId,
    to: programId.toBase58(),
    solana: solBlock,
    metadata: {
      kind: 'capture_spl',
      intentId: params.intentId,
      mtxmSolanaCuLimit: cuLimit,
    },
  });
}
