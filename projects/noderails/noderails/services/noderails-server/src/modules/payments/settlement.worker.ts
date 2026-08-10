import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { encodeSettle } from '@noderails/web3';
import { Connection, PublicKey } from '@solana/web3.js';
import { QUEUE_NAMES, WORKER_CONFIG, isNativeToken } from '@noderails/common';
import { createWorker, queueRegistry, configureQueue } from '@noderails/queue';
import type { PaymentAutoSettleJob } from '@noderails/queue';
import type { Logger } from '@noderails/service-base';
import { env } from '../../config.js';
import { uuidToBytes32 } from './crypto-utils.js';
import {
  buildSettleNativeMtxmPayload,
  buildSettleSplMtxmPayload,
  fetchEscrowFeeRecipientPubkey,
  merchantSolanaPubkey,
  mtxmSolanaAuthority,
  paymentIntentIdSolanaBytes,
  solanaRpcForChain,
} from './solana-escrow-tx.js';
import {
  buildSettleSuiMtxmPayload,
  merchantSuiAddress,
  paymentIntentIdSuiBytes,
} from './sui-escrow-tx.js';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/sui';
import { resolveMintTokenProgramId } from './solana-mint-token-program.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

// ── Settle a single payment ──

async function processSettle(paymentIntentId: string, expectedSettlementAt: number, logger: Logger) {
  const db = getDatabaseClient();

  // Step 1: Load intent with app + chain info
  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: {
        include: {
          appChains: true,
        },
      },
      transactions: {
        where: { type: 'SETTLE', status: { in: ['PENDING', 'CONFIRMED'] } },
        take: 1,
      },
    },
  });

  if (!intent) {
    logger.warn('Settlement: PaymentIntent not found', { paymentIntentId });
    return;
  }

  // Step 2: Verify still CAPTURED (not disputed, refunded, or already settled)
  if (intent.status !== 'CAPTURED') {
    logger.info('Settlement: Skipping — intent no longer CAPTURED', {
      paymentIntentId,
      currentStatus: intent.status,
    });
    return;
  }

  // Step 3: Check if a settle tx is already pending or confirmed
  if (intent.transactions.length > 0) {
    logger.info('Settlement: Skipping — settle tx already exists', {
      paymentIntentId,
      existingTxStatus: intent.transactions[0].status,
    });
    return;
  }

  // Step 4: Verify the settlement timelock has actually passed
  const now = Math.floor(Date.now() / 1000);
  if (now < expectedSettlementAt) {
    // This shouldn't happen with correct delay, but be safe
    const remainingMs = (expectedSettlementAt - now) * 1000;
    logger.warn('Settlement: Timelock not yet passed, re-enqueuing', {
      paymentIntentId,
      expectedSettlementAt,
      now,
      remainingMs,
    });
    const queue = queueRegistry.getOrCreateQueue<PaymentAutoSettleJob>(QUEUE_NAMES.PAYMENT_AUTO_SETTLE);
    await queue.add(`settle-${paymentIntentId}`, {
      paymentIntentId,
      settlementAt: expectedSettlementAt,
    }, { delay: remainingMs + 5000 }); // 5s buffer
    return;
  }

  // Step 5: Resolve chain + escrow address
  const chainId = intent.authorizationChainId;
  if (!chainId) {
    logger.error('Settlement: No authorizationChainId on intent', { paymentIntentId });
    return;
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    logger.error('Settlement: No escrow address for chain', { paymentIntentId, chainId });
    return;
  }

  // Step 6: Build and submit settle tx via MTXM
  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);

  try {
    let txResult;

    if (chain.chainType === ChainType.SOLANA) {
      const programId = new PublicKey(chain.escrowAddress);
      const rpc = solanaRpcForChain(chain);
      const feeRecipient = await fetchEscrowFeeRecipientPubkey(rpc, programId);
      const merchantRecipient = merchantSolanaPubkey(intent, chainId);
      const pi = paymentIntentIdSolanaBytes(intent.id);
      const authority = mtxmSolanaAuthority();

      if (!intent.cryptoTokenKey) {
        logger.error('Settlement: Solana intent missing cryptoTokenKey', { paymentIntentId });
        return;
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        logger.error('Settlement: unknown Solana token for intent', {
          paymentIntentId,
          tokenKey: intent.cryptoTokenKey,
        });
        return;
      }

      let payload;
      if (isNativeToken(tokenRow.contractAddress)) {
        payload = buildSettleNativeMtxmPayload(programId, authority, pi, merchantRecipient, feeRecipient);
      } else {
        const mint = new PublicKey(tokenRow.contractAddress);
        const conn = new Connection(rpc, 'confirmed');
        const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
        if (!splTokenProgramId) {
          logger.error('Settlement: SPL mint missing or not Token / Token-2022', {
            paymentIntentId,
            mint: mint.toBase58(),
          });
          return;
        }
        payload = buildSettleSplMtxmPayload(
          programId,
          authority,
          pi,
          mint,
          merchantRecipient,
          feeRecipient,
          splTokenProgramId,
        );
      }
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...payload,
      });
    } else if (chain.chainType === ChainType.SUI) {
      if (!intent.cryptoTokenKey) {
        logger.error('Settlement: Sui intent missing cryptoTokenKey', { paymentIntentId });
        return;
      }
      const tokenRow = await db.supportedToken.findFirst({
        where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
      });
      if (!tokenRow) {
        logger.error('Settlement: unknown Sui token for intent', {
          paymentIntentId,
          tokenKey: intent.cryptoTokenKey,
        });
        return;
      }
      const coinType = isNativeToken(tokenRow.contractAddress)
        ? SUI_NATIVE_COIN_TYPE
        : tokenRow.contractAddress.trim();
      const payload = await buildSettleSuiMtxmPayload(mtxm, {
        chain,
        coinType,
        paymentIntentId: paymentIntentIdSuiBytes(intent.id),
      });
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...payload,
      });
    } else {
      const calldata = encodeSettle(paymentIntentBytes32);
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        to: chain.escrowAddress,
        data: calldata,
      });
    }

    await db.transaction.create({
      data: {
        paymentIntentId: intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash ?? null,
        chain: String(chainId),
        type: 'SETTLE',
        status: 'PENDING',
      },
    });

    logger.info('Settlement: Settle tx submitted', {
      paymentIntentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash,
      chainId,
    });
  } catch (err) {
    logger.error('Settlement: Failed to submit settle tx', {
      paymentIntentId,
      chainId,
      error: String(err),
    });
    // BullMQ will retry based on worker config
    throw err;
  }
}

// ── Enqueue a settlement job (called from ingest.service.ts) ──

export async function enqueueSettlementJob(paymentIntentId: string, timelockDuration: number, logger: Logger) {
  const delayMs = timelockDuration * 1000;
  const settlementAt = Math.floor(Date.now() / 1000) + timelockDuration;

  const queue = queueRegistry.getOrCreateQueue<PaymentAutoSettleJob>(QUEUE_NAMES.PAYMENT_AUTO_SETTLE);
  await queue.add(`settle-${paymentIntentId}`, {
    paymentIntentId,
    settlementAt,
  }, {
    delay: delayMs,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });

  logger.info('Settlement: Job enqueued', {
    paymentIntentId,
    delayMs,
    settlementAt: new Date(settlementAt * 1000).toISOString(),
  });
}

// ── Startup reconciliation: find CAPTURED intents past settlement time with no settle tx ──

export async function reconcileSettlements(logger: Logger) {
  const db = getDatabaseClient();

  const now = new Date();

  // Find all CAPTURED intents where timelockEndsAt has passed (or capturedAt + timelockDuration has passed)
  // and no SETTLE transaction exists
  const staleIntents = await db.paymentIntent.findMany({
    where: {
      status: 'CAPTURED',
      capturedAt: { not: null },
      transactions: {
        none: {
          type: 'SETTLE',
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      },
    },
    select: {
      id: true,
      capturedAt: true,
      timelockDuration: true,
    },
  });

  let enqueued = 0;

  for (const intent of staleIntents) {
    if (!intent.capturedAt) continue;

    const capturedAtSec = Math.floor(intent.capturedAt.getTime() / 1000);
    const settlementAt = capturedAtSec + intent.timelockDuration;
    const nowSec = Math.floor(now.getTime() / 1000);

    if (nowSec >= settlementAt) {
      // Past due — enqueue immediately (small delay to avoid thundering herd)
      const jitterMs = Math.floor(Math.random() * 10_000); // 0-10s random jitter
      const queue = queueRegistry.getOrCreateQueue<PaymentAutoSettleJob>(QUEUE_NAMES.PAYMENT_AUTO_SETTLE);
      await queue.add(`settle-reconcile-${intent.id}`, {
        paymentIntentId: intent.id,
        settlementAt,
      }, {
        delay: jitterMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      });
      enqueued++;
    } else {
      // Not yet due — enqueue with remaining delay
      const remainingMs = (settlementAt - nowSec) * 1000;
      const queue = queueRegistry.getOrCreateQueue<PaymentAutoSettleJob>(QUEUE_NAMES.PAYMENT_AUTO_SETTLE);
      await queue.add(`settle-reconcile-${intent.id}`, {
        paymentIntentId: intent.id,
        settlementAt,
      }, {
        delay: remainingMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      });
      enqueued++;
    }
  }

  logger.info('Settlement reconciliation complete', {
    found: staleIntents.length,
    enqueued,
  });
}

// ── Worker startup ──

export function startSettlementWorker(logger: Logger) {
  configureQueue({ redisUrl: env.REDIS_URL });

  const settleWorker = createWorker<PaymentAutoSettleJob>(
    QUEUE_NAMES.PAYMENT_AUTO_SETTLE,
    async (job) => {
      logger.info('Processing auto-settlement', {
        jobId: job.id,
        paymentIntentId: job.data.paymentIntentId,
        settlementAt: new Date(job.data.settlementAt * 1000).toISOString(),
      });
      await processSettle(job.data.paymentIntentId, job.data.settlementAt, logger);
    },
    { concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY },
  );

  logger.info('Settlement worker started', {
    queue: QUEUE_NAMES.PAYMENT_AUTO_SETTLE,
    concurrency: WORKER_CONFIG.DEFAULT_CONCURRENCY,
  });

  return { settleWorker };
}
