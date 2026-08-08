import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { encodeRefundPayment } from '@noderails/web3';
import { PaymentError, NotFoundError, isValidSolanaAddress, isNativeToken } from '@noderails/common';
import type { Hex } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js';
import { env } from '../../config.js';
import { uuidToBytes32 } from './crypto-utils.js';
import { buildRefundNativeMtxmPayload, buildRefundSplMtxmPayload, mtxmSolanaAuthority, paymentIntentIdSolanaBytes, solanaRpcForChain } from './solana-escrow-tx.js';
import { buildRefundSuiMtxmPayload, paymentIntentIdSuiBytes } from './sui-escrow-tx.js';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/sui';
import { resolveMintTokenProgramId } from './solana-mint-token-program.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

// ── Initiate a refund for a captured payment ──

export async function initiateRefund(merchantId: string, paymentIntentId: string, reason: string) {
  const db = getDatabaseClient();

  // Step 1: Load the payment intent with its app + chain info
  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { include: { appChains: true } },
      transactions: {
        where: { type: 'REFUND', status: { in: ['PENDING', 'CONFIRMED'] } },
        take: 1,
      },
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  // Step 2: Verify the merchant owns this payment intent
  if (intent.app.merchantId !== merchantId) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  // Step 3: Verify payment is in CAPTURED status (only captured payments can be refunded)
  if (intent.status !== 'CAPTURED') {
    throw new PaymentError(
      `Cannot refund payment in ${intent.status} status. Only CAPTURED payments can be refunded.`,
      paymentIntentId,
    );
  }

  // Step 4: Check if a refund tx is already pending or confirmed
  if (intent.transactions.length > 0) {
    throw new PaymentError(
      'A refund transaction is already in progress for this payment.',
      paymentIntentId,
    );
  }

  // Step 5: Validate timelock — refund must happen before settlement time
  if (intent.timelockEndsAt) {
    const now = new Date();
    if (now >= intent.timelockEndsAt) {
      throw new PaymentError(
        'Refund window has expired. The settlement timelock has passed.',
        paymentIntentId,
      );
    }
  } else if (intent.capturedAt) {
    // Fallback: compute from capturedAt + timelockDuration
    const settlementTime = new Date(intent.capturedAt.getTime() + intent.timelockDuration * 1000);
    if (new Date() >= settlementTime) {
      throw new PaymentError(
        'Refund window has expired. The settlement timelock has passed.',
        paymentIntentId,
      );
    }
  }

  // Step 6: Resolve chain + escrow address
  const chainId = intent.authorizationChainId;
  if (!chainId) {
    throw new PaymentError('No authorizationChainId on payment intent', paymentIntentId);
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    throw new PaymentError(`No escrow address for chain ${chainId}`, paymentIntentId);
  }

  // Step 7: Build and submit refund tx via MTXM
  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);

  let txResult;
  if (chain.chainType === ChainType.SOLANA) {
    const payer = intent.authorizationWalletAddress?.trim();
    if (!payer || !isValidSolanaAddress(payer)) {
      throw new PaymentError('Invalid Solana payer wallet on payment intent', paymentIntentId);
    }
    if (!intent.cryptoTokenKey) {
      throw new PaymentError('Payment intent is missing cryptoTokenKey for Solana refund', paymentIntentId);
    }
    const tokenRow = await db.supportedToken.findFirst({
      where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
    });
    if (!tokenRow) {
      throw new PaymentError(`Unknown token ${intent.cryptoTokenKey} for refund`, paymentIntentId);
    }
    const programId = new PublicKey(chain.escrowAddress);
    const authority = mtxmSolanaAuthority();
    const pi = paymentIntentIdSolanaBytes(intent.id);
    const payerPk = new PublicKey(payer);
    if (isNativeToken(tokenRow.contractAddress)) {
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...buildRefundNativeMtxmPayload(programId, authority, pi, payerPk),
      });
    } else {
      const mint = new PublicKey(tokenRow.contractAddress);
      const conn = new Connection(solanaRpcForChain(chain), 'confirmed');
      const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
      if (!splTokenProgramId) {
        throw new PaymentError(
          'SPL mint was not found on-chain or is not owned by SPL Token / Token-2022',
          paymentIntentId,
        );
      }
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...buildRefundSplMtxmPayload(programId, authority, pi, mint, payerPk, splTokenProgramId),
      });
    }
  } else if (chain.chainType === ChainType.SUI) {
    if (!intent.cryptoTokenKey) {
      throw new PaymentError('Payment intent is missing cryptoTokenKey for Sui refund', paymentIntentId);
    }
    const tokenRow = await db.supportedToken.findFirst({
      where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
    });
    if (!tokenRow) {
      throw new PaymentError(`Unknown token ${intent.cryptoTokenKey} for refund`, paymentIntentId);
    }
    const coinType = isNativeToken(tokenRow.contractAddress)
      ? SUI_NATIVE_COIN_TYPE
      : tokenRow.contractAddress.trim();
    const payload = await buildRefundSuiMtxmPayload(mtxm, {
      chain,
      coinType,
      paymentIntentId: paymentIntentIdSuiBytes(intent.id),
    });
    txResult = await mtxm.sendTransaction({
      chainId: mtxmChainId,
      ...payload,
    });
  } else {
    const calldata = encodeRefundPayment(paymentIntentBytes32);
    txResult = await mtxm.sendTransaction({
      chainId: mtxmChainId,
      to: chain.escrowAddress,
      data: calldata as string,
    });
  }

  // Step 8: Create Transaction record
  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(chainId),
      type: 'REFUND',
      status: 'PENDING',
    },
  });

  // Step 9: Store the refund reason on the intent
  await db.paymentIntent.update({
    where: { id: intent.id },
    data: { refundReason: reason },
  });

  return {
    paymentIntentId: intent.id,
    transactionId: transaction.id,
    mtxmTxId: txResult.id,
    txHash: txResult.txHash ?? null,
    status: 'PENDING',
  };
}

// ── Get refund details for a payment intent ──

export async function getRefundInfo(paymentIntentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    select: {
      id: true,
      status: true,
      refundedAt: true,
      refundTxHash: true,
      refundReason: true,
      timelockEndsAt: true,
      capturedAt: true,
      timelockDuration: true,
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  // Compute whether refund is still possible
  let canRefund = intent.status === 'CAPTURED';
  let refundWindowEndsAt: Date | null = null;

  if (intent.timelockEndsAt) {
    refundWindowEndsAt = intent.timelockEndsAt;
  } else if (intent.capturedAt) {
    refundWindowEndsAt = new Date(intent.capturedAt.getTime() + intent.timelockDuration * 1000);
  }

  if (canRefund && refundWindowEndsAt && new Date() >= refundWindowEndsAt) {
    canRefund = false;
  }

  return {
    ...intent,
    canRefund,
    refundWindowEndsAt,
  };
}
