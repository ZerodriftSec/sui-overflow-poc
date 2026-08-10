import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isNativeToken,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  generateNonce,
} from '@noderails/common';
import { encodeExecutePayout, encodeExecuteNativePayout } from '@noderails/web3';
import {
  executeNativePayoutInstruction,
  buildNativePayoutMessageSolana,
  buildSolanaSessionMessage,
  instructionToMtxmSolana,
} from '@noderails/solana';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../../config.js';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import { mtxmSolanaAuthority, paymentIntentIdSolanaBytes, mtxmSolanaProgramBlock } from '../payments/solana-escrow-tx.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

function parseNonce32(nonce: string): Uint8Array {
  const h = nonce.startsWith('0x') ? nonce.slice(2) : nonce;
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new ValidationError('Invalid payout nonce (expected 32-byte hex)');
  }
  return Uint8Array.from(Buffer.from(h, 'hex'));
}

function parseEd25519Signature64(input: string): Uint8Array {
  const s = input.trim();
  if (s.startsWith('0x') && s.length === 130) {
    return Uint8Array.from(Buffer.from(s.slice(2), 'hex'));
  }
  if (/^[0-9a-fA-F]{128}$/.test(s)) {
    return Uint8Array.from(Buffer.from(s, 'hex'));
  }
  try {
    const d = bs58.decode(s);
    if (d.length === 64) return Uint8Array.from(d);
  } catch {
    /* try base64 */
  }
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length === 64) return Uint8Array.from(b);
  } catch {
    /* fall through */
  }
  throw new ValidationError(
    'Invalid sessionSignature — use hex (128 chars), base58, or base64 (64 bytes ed25519)',
  );
}

function tokenAmountToWholeLamports(raw: { toString(): string }): bigint {
  const str = raw.toString();
  if (str.includes('e') || str.includes('E')) {
    throw new ValidationError('tokenAmount must be a plain decimal string for Solana');
  }
  const [whole, frac = ''] = str.split('.');
  const f = frac.replace(/0+$/, '');
  if (f !== '') {
    throw new ValidationError('Solana native payout amount must be whole lamports (no fractional part)');
  }
  return BigInt(whole || '0');
}

// ── Create Payout Intent ──

interface CreatePayoutInput {
  merchantId: string;
  appId: string;
  recipientWallet: string;
  amountUsd: string;
  tokenAmount: string;
  tokenAddress: string;
  chain: string;
  sessionSignature?: string;
  sessionExpiry?: Date;
}

export async function createPayout(input: CreatePayoutInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  if (!app.payoutWallet) {
    throw new ValidationError('App has no payout wallet configured');
  }

  const chainIdNum = parseInt(input.chain.trim(), 10);
  if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
    throw new ValidationError('Invalid chain id');
  }

  const supported = await db.supportedChain.findUnique({ where: { chainId: chainIdNum } });
  if (!supported?.isEnabled) {
    throw new ValidationError(`Chain ${chainIdNum} is not available`);
  }

  const recipient = input.recipientWallet.trim();
  const tokenAddr = input.tokenAddress.trim();
  const payoutW = app.payoutWallet.trim();

  if (supported.chainType === ChainType.SOLANA) {
    if (!isValidSolanaAddress(recipient)) {
      throw new ValidationError('Invalid Solana recipient wallet');
    }
    if (!isNativeToken(tokenAddr)) {
      throw new ValidationError(
        'Solana payouts support native SOL only. SPL payouts need merchant token-account co-sign and are not automated yet.',
      );
    }
    if (!isValidSolanaAddress(payoutW)) {
      throw new ValidationError('Configure a valid Solana payout wallet for this app');
    }
  } else if (supported.chainType === ChainType.SUI) {
    if (!isValidSuiAddress(recipient)) {
      throw new ValidationError('Invalid Sui recipient wallet');
    }
    if (!isNativeToken(tokenAddr)) {
      throw new ValidationError('Sui payouts support native SUI only for automated execution');
    }
    if (!isValidSuiAddress(payoutW)) {
      throw new ValidationError('Configure a valid Sui payout wallet for this app');
    }
  } else {
    if (!isValidAddress(recipient)) {
      throw new ValidationError('Invalid EVM recipient wallet');
    }
    if (!isValidAddress(tokenAddr) && !isNativeToken(tokenAddr)) {
      throw new ValidationError('Invalid token address');
    }
    if (!isValidAddress(payoutW)) {
      throw new ValidationError('Configure a valid EVM payout wallet for this app');
    }
  }

  const nonce = generateNonce();

  return db.payoutIntent.create({
    data: {
      merchantId: input.merchantId,
      appId: input.appId,
      recipientWallet: recipient,
      merchantWallet: payoutW,
      amountUsd: input.amountUsd,
      tokenAmount: input.tokenAmount,
      tokenAddress: tokenAddr,
      chain: input.chain,
      nonce,
      sessionSignature: input.sessionSignature,
      sessionExpiry: input.sessionExpiry,
    },
  });
}

// ── Get Payout Intent ──

export async function getPayout(merchantId: string, payoutId: string) {
  const db = getDatabaseClient();

  const payout = await db.payoutIntent.findUnique({
    where: { id: payoutId },
    include: { transactions: true },
  });

  if (!payout || payout.merchantId !== merchantId) {
    throw new NotFoundError('PayoutIntent', payoutId);
  }

  return payout;
}

// ── List Payout Intents ──

interface ListPayoutsInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export async function listPayouts(input: ListPayoutsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { merchantId: input.merchantId };
  if (input.appId) where.appId = input.appId;
  if (input.status) where.status = input.status;

  const [payouts, total] = await Promise.all([
    db.payoutIntent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    db.payoutIntent.count({ where }),
  ]);

  return { payouts, total, page, pageSize };
}

// ── Execute Payout (EVM calldata or Solana native program ix) ──

interface ExecutePayoutInput {
  merchantId: string;
  payoutId: string;
  merchantManagerAddress: string;
  chainId: string;
  /** EVM: platform ECDSA signature. Solana: ignored — MTXM signs the ed25519 payout message. */
  noderailsSignature?: string;
}

export async function executePayout(input: ExecutePayoutInput) {
  const db = getDatabaseClient();

  const payout = await db.payoutIntent.findUnique({
    where: { id: input.payoutId },
    include: { app: true },
  });

  if (!payout || payout.merchantId !== input.merchantId) {
    throw new NotFoundError('PayoutIntent', input.payoutId);
  }

  if (payout.status !== 'PENDING') {
    throw new ValidationError(`Cannot execute payout in ${payout.status} status`);
  }

  if (!payout.app.payoutWallet) {
    throw new ValidationError('App has no payout wallet configured');
  }

  const chainIdNum = parseInt(payout.chain.trim(), 10);
  if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
    throw new ValidationError('Payout record has invalid chain id');
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId: chainIdNum } });
  if (!chain) {
    throw new ValidationError('Supported chain not found for this payout');
  }

  const mgrTrim = input.merchantManagerAddress.trim();
  if (mgrTrim !== chain.merchantManagerAddress.trim()) {
    throw new ValidationError('merchantManagerAddress does not match the configured chain');
  }

  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chain.chainId);

  const finalizeSuccess = async (txResult: { id: string; txHash?: string | null }) => {
    const transaction = await db.transaction.create({
      data: {
        payoutIntentId: payout.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash ?? null,
        chain: payout.chain,
        type: 'PAYOUT',
        status: 'PENDING',
      },
    });

    await db.payoutIntent.update({
      where: { id: payout.id },
      data: { status: 'EXECUTED', txHash: txResult.txHash ?? null, executedAt: new Date() },
    });

    return transaction;
  };

  // ── Solana native (merchant_manager `execute_native_payout`) ──
  if (chain.chainType === ChainType.SOLANA) {
    if (!isNativeToken(payout.tokenAddress.trim())) {
      throw new ValidationError('Only native SOL is supported for automated Solana payouts');
    }
    if (!payout.sessionSignature || !payout.sessionExpiry) {
      throw new ValidationError('sessionSignature and sessionExpiry are required for Solana payouts');
    }

    const programId = new PublicKey(chain.merchantManagerAddress.trim());
    const executor = mtxmSolanaAuthority();
    const noderailsWallet = executor;
    const merchantPk = new PublicKey(payout.merchantWallet.trim());
    const recipientPk = new PublicKey(payout.recipientWallet.trim());
    const payer = executor;

    const sessionExpiryUnix = BigInt(Math.floor(payout.sessionExpiry.getTime() / 1000));
    const sessionMessage = buildSolanaSessionMessage(merchantPk, sessionExpiryUnix);
    const sessionSig = parseEd25519Signature64(payout.sessionSignature);

    const payoutIntentBytes = paymentIntentIdSolanaBytes(payout.id);
    const nonceBytes = parseNonce32(payout.nonce);
    const amountLamports = tokenAmountToWholeLamports(payout.tokenAmount);

    const payoutMessage = buildNativePayoutMessageSolana({
      payoutIntentId: payoutIntentBytes,
      merchant: merchantPk,
      recipient: recipientPk,
      amountLamports,
      nonce: nonceBytes,
    });

    const signRes = await mtxm.signTypedData({
      chainId: mtxmChainId,
      chainType: 'SOLANA',
      solana: {
        domain: {
          name: 'NodeRailsMerchantManager',
          version: '1',
          chainId: chain.chainId,
          verifyingProgramId: programId.toBase58(),
          authority: executor.toBase58(),
        },
        rawPreimageBase64: payoutMessage.toString('base64'),
        payload: { payoutIntentId: payout.id, kind: 'native_payout' },
      },
    });

    const sigB58 = signRes.signatureBase58;
    if (!sigB58) {
      throw new Error('MTXM Solana sign-typed missing signatureBase58 for payout');
    }
    const noderailsSig = bs58.decode(sigB58);
    if (noderailsSig.length !== 64) {
      throw new Error('MTXM returned invalid ed25519 payout signature length');
    }

    const ix = executeNativePayoutInstruction({
      programId,
      executor,
      merchantWallet: merchantPk,
      recipient: recipientPk,
      noderailsWallet,
      payer,
      nonce: nonceBytes,
      payoutIntentId: payoutIntentBytes,
      amountLamports,
      sessionExpiryUnix,
      sessionMessage,
      sessionSignature: sessionSig,
      payoutMessage,
      noderailsSignature: noderailsSig,
    });

    const txResult = await mtxm.sendTransaction({
      chainId: mtxmChainId,
      to: programId.toBase58(),
      solana: mtxmSolanaProgramBlock([instructionToMtxmSolana(ix)]),
    });

    return finalizeSuccess(txResult);
  }

  if (chain.chainType === ChainType.SUI) {
    throw new ValidationError(
      'Automated Sui payouts require merchant-manager exec role and nonce registry object IDs from publish output. Register them in admin, then enable the Sui payout PTB path.',
    );
  }

  // ── EVM ──
  if (!input.noderailsSignature?.trim()) {
    throw new ValidationError('noderailsSignature is required for EVM payouts');
  }

  const merchantWallet = payout.merchantWallet as `0x${string}`;
  const native = isNativeToken(payout.tokenAddress);

  let calldata: `0x${string}`;

  if (native) {
    calldata = encodeExecuteNativePayout({
      payoutIntentId: uuidToBytes32(payout.id) as `0x${string}`,
      merchantWallet,
      recipient: payout.recipientWallet as `0x${string}`,
      sessionSignature: (payout.sessionSignature ?? '0x') as `0x${string}`,
      sessionExpiry: BigInt(payout.sessionExpiry ? Math.floor(payout.sessionExpiry.getTime() / 1000) : 0),
      nonce: payout.nonce as `0x${string}`,
      noderailsSignature: input.noderailsSignature as `0x${string}`,
    });
  } else {
    calldata = encodeExecutePayout({
      payoutIntentId: uuidToBytes32(payout.id) as `0x${string}`,
      merchantWallet,
      recipient: payout.recipientWallet as `0x${string}`,
      token: payout.tokenAddress as `0x${string}`,
      amount: BigInt(payout.tokenAmount.toString().split('.')[0] || '0'),
      sessionSignature: (payout.sessionSignature ?? '0x') as `0x${string}`,
      sessionExpiry: BigInt(payout.sessionExpiry ? Math.floor(payout.sessionExpiry.getTime() / 1000) : 0),
      nonce: payout.nonce as `0x${string}`,
      noderailsSignature: input.noderailsSignature as `0x${string}`,
    });
  }

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.merchantManagerAddress,
    data: calldata,
  });

  return finalizeSuccess(txResult);
}
