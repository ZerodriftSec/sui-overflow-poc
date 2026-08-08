/**
 * Dispute Service
 *
 * Handles the full dispute lifecycle:
 * 1. Customer initiates a dispute (off-chain record + on-chain tx)
 * 2. Admin resolves dispute (merchant wins or customer wins + on-chain tx)
 * 3. Webhook notifications for both events
 */

import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import { encodeResolveDispute, encodeInitiateDispute } from '@noderails/web3';
import {
  QUEUE_NAMES,
  WEBHOOK_EVENTS,
  NotFoundError,
  ValidationError,
  PaymentError,
  isValidSolanaAddress,
  isValidSuiAddress,
  normalizeSuiAddress,
  isNativeToken,
  blockExplorerTxUrl,
} from '@noderails/common';
import { queueRegistry } from '@noderails/queue';
import type { EmailSendJob } from '@noderails/queue';
import type { PdfReceiptData } from '@noderails/common/email';
import type { Hex, Address } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js';
import { getPresignedDownloadUrl, S3_BUCKETS, STORAGE_LIMITS } from '@noderails/storage';
import { env } from '../../config.js';
import { uuidToBytes32 } from '../payments/crypto-utils.js';
import {
  buildInitiateDisputeMtxmPayload,
  buildResolveDisputeNativeMtxmPayload,
  buildResolveDisputeSplMtxmPayload,
  fetchEscrowFeeRecipientPubkey,
  merchantSolanaPubkey,
  mtxmSolanaAuthority,
  paymentIntentIdSolanaBytes,
  solanaRpcForChain,
} from '../payments/solana-escrow-tx.js';
import {
  buildInitiateDisputeSuiMtxmPayload,
  buildResolveDisputeSuiMtxmPayload,
  merchantSuiAddress,
  paymentIntentIdSuiBytes,
} from '../payments/sui-escrow-tx.js';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/sui';
import { resolveMintTokenProgramId } from '../payments/solana-mint-token-program.js';
import { enqueueAppWebhook } from '../webhooks/webhook.service.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

// ── Types ──

export interface InitiateDisputeInput {
  paymentIntentId: string;
  reason: string;
  customerEmail: string;
  customerProofKey?: string;
}

export interface RespondToDisputeInput {
  disputeId: string;
  merchantId: string;
  response: string;
  proofKey?: string;
}

export interface ResolveDisputeInput {
  disputeId: string;
  winner: 'MERCHANT' | 'CUSTOMER';
}

// ── Helpers ──

function computeDisputeWindow(capturedAt: Date, disputeStartDuration: number, timelockDuration: number) {
  const capturedAtSec = Math.floor(capturedAt.getTime() / 1000);
  const disputeOpensAt = new Date((capturedAtSec + disputeStartDuration) * 1000);
  const disputeClosesAt = new Date((capturedAtSec + timelockDuration) * 1000);
  return { disputeOpensAt, disputeClosesAt };
}

const DISPLAY_DECIMALS = 4;

function formatRawTokenAmount(rawAmount: string, decimals: number): string {
  if (decimals <= 0) return rawAmount;

  const value = BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) return whole.toString();

  // Pad to full decimal width, truncate to DISPLAY_DECIMALS, strip trailing zeros
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, DISPLAY_DECIMALS)
    .replace(/0+$/, '');

  return fractionStr.length > 0 ? `${whole.toString()}.${fractionStr}` : whole.toString();
}

// ── Get dispute window status for a payment intent (public) ──

export async function getDisputeWindow(paymentIntentId: string) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { name: true } },
      dispute: true,
      customerAccount: { select: { email: true, name: true } },
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', paymentIntentId);
  }

  if (!intent.capturedAt) {
    return {
      paymentIntentId: intent.id,
      status: intent.status,
      disputeWindowOpen: false,
      reason: 'Payment has not been captured yet',
      merchantName: intent.app.name,
    };
  }

  const { disputeOpensAt, disputeClosesAt } = computeDisputeWindow(
    intent.capturedAt,
    intent.disputeStartDuration,
    intent.timelockDuration,
  );

  const now = new Date();
  const isOpen = now >= disputeOpensAt && now < disputeClosesAt && intent.status === 'CAPTURED';
  const hasExistingDispute = !!intent.dispute;

  return {
    paymentIntentId: intent.id,
    status: intent.status,
    amount: intent.amount.toString(),
    currency: intent.currency,
    cryptoAmount: intent.cryptoAmount,
    cryptoTokenKey: intent.cryptoTokenKey,
    merchantName: intent.app.name,
    capturedAt: intent.capturedAt.toISOString(),
    disputeOpensAt: disputeOpensAt.toISOString(),
    disputeClosesAt: disputeClosesAt.toISOString(),
    disputeWindowOpen: isOpen && !hasExistingDispute,
    hasExistingDispute,
    existingDispute: intent.dispute
      ? {
          id: intent.dispute.id,
          reason: intent.dispute.reason,
          status: intent.dispute.status,
          createdAt: intent.dispute.createdAt.toISOString(),
          resolvedAt: intent.dispute.resolvedAt?.toISOString() ?? null,
        }
      : null,
    customerEmail: intent.customerAccount?.email ?? null,
    customerName: intent.customerAccount?.name ?? null,
  };
}

// ── Initiate dispute (customer-facing) ──

export async function initiateDispute(input: InitiateDisputeInput) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
    include: {
      app: { select: { id: true, name: true, merchantId: true } },
      dispute: true,
      customerAccount: { select: { email: true } },
    },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', input.paymentIntentId);
  }

  // Verify the customer email matches
  if (!intent.customerAccount?.email || intent.customerAccount.email !== input.customerEmail) {
    throw new ValidationError('Email does not match the payment record');
  }

  // Must be in CAPTURED status
  if (intent.status !== 'CAPTURED') {
    throw new PaymentError(
      `Cannot dispute payment in ${intent.status} status. Only CAPTURED payments can be disputed.`,
      input.paymentIntentId,
    );
  }

  // Must NOT have an existing dispute
  if (intent.dispute) {
    throw new ValidationError('A dispute has already been filed for this payment');
  }

  // Verify dispute window is open
  if (!intent.capturedAt) {
    throw new PaymentError('Payment has no capturedAt timestamp', input.paymentIntentId);
  }

  const { disputeOpensAt, disputeClosesAt } = computeDisputeWindow(
    intent.capturedAt,
    intent.disputeStartDuration,
    intent.timelockDuration,
  );

  const now = new Date();
  if (now < disputeOpensAt) {
    throw new PaymentError(
      `Dispute window has not opened yet. Opens at ${disputeOpensAt.toISOString()}`,
      input.paymentIntentId,
    );
  }
  if (now >= disputeClosesAt) {
    throw new PaymentError(
      'Dispute window has closed. The settlement timelock has passed.',
      input.paymentIntentId,
    );
  }

  // Get chain + escrow for the on-chain initiateDispute call
  const chainId = intent.authorizationChainId;
  if (!chainId) {
    throw new PaymentError('No authorizationChainId on payment intent', intent.id);
  }
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    throw new PaymentError(`No escrow address for chain ${chainId}`, intent.id);
  }

  // Merchant response deadline: 30 days from when the dispute is raised.
  // This is purely off-chain — the contract has no response deadline.
  const DISPUTE_RESPONSE_DAYS = 30;
  const responseDeadline = new Date(Date.now() + DISPUTE_RESPONSE_DAYS * 24 * 60 * 60 * 1000);

  // Create Dispute record (PI status stays CAPTURED until on-chain tx confirms)
  const dispute = await db.dispute.create({
    data: {
      paymentIntentId: intent.id,
      reason: input.reason,
      status: 'OPEN',
      deadline: responseDeadline,
      ...(input.customerProofKey ? { customerProofKey: input.customerProofKey } : {}),
    },
  });

  // Submit initiateDispute on-chain via MTXM
  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const calldata = encodeInitiateDispute(paymentIntentBytes32 as Hex);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);

  const txResult =
    chain.chainType === ChainType.SOLANA
      ? await mtxm.sendTransaction({
          chainId: mtxmChainId,
          ...buildInitiateDisputeMtxmPayload(
            new PublicKey(chain.escrowAddress),
            mtxmSolanaAuthority(),
            paymentIntentIdSolanaBytes(intent.id),
          ),
          metadata: {
            type: 'dispute_initiation',
            disputeId: dispute.id,
            paymentIntentId: intent.id,
          },
        })
      : chain.chainType === ChainType.SUI
        ? await mtxm.sendTransaction({
            chainId: mtxmChainId,
            ...(await buildInitiateDisputeSuiMtxmPayload(mtxm, {
              chain,
              paymentIntentId: paymentIntentIdSuiBytes(intent.id),
            })),
            metadata: {
              type: 'dispute_initiation',
              disputeId: dispute.id,
              paymentIntentId: intent.id,
            },
          })
        : await mtxm.sendTransaction({
          chainId: mtxmChainId,
          to: chain.escrowAddress,
          data: calldata as string,
          metadata: {
            type: 'dispute_initiation',
            disputeId: dispute.id,
            paymentIntentId: intent.id,
          },
        });

  await db.transaction.create({
    data: {
      paymentIntentId: intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(chainId),
      type: 'DISPUTE_INITIATE',
      status: 'PENDING',
    },
  });

  // Fire webhooks
  // Webhook fires from ingest.service.ts once the on-chain tx confirms.

  return {
    id: dispute.id,
    paymentIntentId: intent.id,
    reason: dispute.reason,
    status: dispute.status,
    deadline: dispute.deadline.toISOString(),
    createdAt: dispute.createdAt.toISOString(),
  };
}

// ── Resolve dispute (admin only — sends on-chain tx) ──

export async function resolveDispute(input: ResolveDisputeInput) {
  const db = getDatabaseClient();

  const dispute = await db.dispute.findUnique({
    where: { id: input.disputeId },
    include: {
      paymentIntent: {
        include: {
          app: {
            include: {
              appChains: true,
            },
          },
          customerAccount: { select: { email: true, name: true } },
        },
      },
    },
  });

  if (!dispute) {
    throw new NotFoundError('Dispute', input.disputeId);
  }

  if (dispute.status !== 'OPEN' && dispute.status !== 'RESOLVING') {
    throw new ValidationError(`Dispute is already resolved (${dispute.status})`);
  }

  const intent = dispute.paymentIntent;

  // Get chain + escrow for the on-chain call
  const chainId = intent.authorizationChainId;
  if (!chainId) {
    throw new PaymentError('No authorizationChainId on payment intent', intent.id);
  }

  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain?.escrowAddress) {
    throw new PaymentError(`No escrow address for chain ${chainId}`, intent.id);
  }

  const paymentIntentBytes32 = uuidToBytes32(intent.id);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chainId);
  const metadata = {
    type: 'dispute_resolution',
    disputeId: dispute.id,
    paymentIntentId: intent.id,
    winner: input.winner,
  };

  let txResult;
  if (chain.chainType === ChainType.SOLANA) {
    const payerRaw = intent.authorizationWalletAddress?.trim();
    if (!payerRaw || !isValidSolanaAddress(payerRaw)) {
      throw new ValidationError('No valid payer wallet address on record');
    }
    if (!intent.cryptoTokenKey) {
      throw new ValidationError('Payment intent is missing cryptoTokenKey for Solana dispute resolution');
    }
    const tokenRow = await db.supportedToken.findFirst({
      where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
    });
    if (!tokenRow) {
      throw new ValidationError('Unknown token for Solana dispute resolution');
    }
    const payerRecipient = new PublicKey(payerRaw);
    const merchantRecipient = merchantSolanaPubkey(intent, chainId);
    const programId = new PublicKey(chain.escrowAddress);
    const rpcUrl = solanaRpcForChain(chain);
    const feeRecipient = await fetchEscrowFeeRecipientPubkey(rpcUrl, programId);
    const winnerPk = input.winner === 'MERCHANT' ? merchantRecipient : payerRecipient;
    if (isNativeToken(tokenRow.contractAddress)) {
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...buildResolveDisputeNativeMtxmPayload(
          programId,
          mtxmSolanaAuthority(),
          paymentIntentIdSolanaBytes(intent.id),
          merchantRecipient,
          payerRecipient,
          feeRecipient,
          winnerPk,
        ),
        metadata,
      });
    } else {
      const mint = new PublicKey(tokenRow.contractAddress);
      const conn = new Connection(rpcUrl, 'confirmed');
      const splTokenProgramId = await resolveMintTokenProgramId(conn, mint);
      if (!splTokenProgramId) {
        throw new ValidationError('SPL mint was not found or is not owned by SPL Token / Token-2022');
      }
      txResult = await mtxm.sendTransaction({
        chainId: mtxmChainId,
        ...buildResolveDisputeSplMtxmPayload(
          programId,
          mtxmSolanaAuthority(),
          paymentIntentIdSolanaBytes(intent.id),
          mint,
          merchantRecipient,
          payerRecipient,
          feeRecipient,
          winnerPk,
          splTokenProgramId,
        ),
        metadata,
      });
    }
  } else if (chain.chainType === ChainType.SUI) {
    const payerRaw = intent.authorizationWalletAddress?.trim();
    if (!payerRaw || !isValidSuiAddress(payerRaw)) {
      throw new ValidationError('No valid Sui payer wallet address on record');
    }
    if (!intent.cryptoTokenKey) {
      throw new ValidationError('Payment intent is missing cryptoTokenKey for Sui dispute resolution');
    }
    const tokenRow = await db.supportedToken.findFirst({
      where: { tokenKey: intent.cryptoTokenKey, chainId, isEnabled: true },
    });
    if (!tokenRow) {
      throw new ValidationError('Unknown token for Sui dispute resolution');
    }
    const coinType = isNativeToken(tokenRow.contractAddress)
      ? SUI_NATIVE_COIN_TYPE
      : tokenRow.contractAddress.trim();
    const winnerAddress =
      input.winner === 'MERCHANT'
        ? merchantSuiAddress(intent, chainId)
        : normalizeSuiAddress(payerRaw);
    txResult = await mtxm.sendTransaction({
      chainId: mtxmChainId,
      ...(await buildResolveDisputeSuiMtxmPayload(mtxm, {
        chain,
        coinType,
        paymentIntentId: paymentIntentIdSuiBytes(intent.id),
        winnerAddress,
      })),
      metadata,
    });
  } else {
    const winnerAddress: Address = input.winner === 'MERCHANT'
      ? (intent.app.receivingWallet as Address)
      : (intent.authorizationWalletAddress as Address);
    if (!winnerAddress) {
      throw new ValidationError(
        input.winner === 'MERCHANT'
          ? 'Merchant has no receiving wallet set'
          : 'No payer wallet address on record',
      );
    }
    const calldata = encodeResolveDispute(paymentIntentBytes32 as Hex, winnerAddress);
    txResult = await mtxm.sendTransaction({
      chainId: mtxmChainId,
      to: chain.escrowAddress,
      data: calldata as string,
      metadata,
    });
  }

  // Create Transaction record for the resolution
  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: String(chainId),
      type: 'DISPUTE',
      status: 'PENDING',
    },
  });

  // Mark dispute as RESOLVING — final status + email happen when tx confirms in ingest.service.ts
  await db.dispute.update({
    where: { id: dispute.id },
    data: {
      status: 'RESOLVING',
      // Store the intended winner in the metadata field so ingest can finish the job
      evidence: JSON.stringify({ winner: input.winner, transactionId: transaction.id }),
    },
  });

  return {
    id: dispute.id,
    paymentIntentId: intent.id,
    winner: input.winner,
    status: 'RESOLVING',
    transactionId: transaction.id,
    mtxmTxId: txResult.id,
    txHash: txResult.txHash ?? null,
  };
}

// ── List disputes (admin) ──

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ListDisputesInput {
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listDisputes(input: ListDisputesInput) {
  const db = getDatabaseClient();

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (input.status) {
    where.status = input.status;
  }

  const [disputes, total] = await Promise.all([
    db.dispute.findMany({
      where,
      include: {
        paymentIntent: {
          include: {
            app: { select: { id: true, name: true, merchantId: true } },
            customerAccount: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.dispute.count({ where }),
  ]);

  return {
    disputes: disputes.map((d) => ({
      id: d.id,
      paymentIntentId: d.paymentIntentId,
      reason: d.reason,
      evidence: d.evidence,
      status: d.status,
      deadline: d.deadline.toISOString(),
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      resolvedBy: d.resolvedBy,
      paymentIntent: {
        id: d.paymentIntent.id,
        amount: d.paymentIntent.amount.toString(),
        currency: d.paymentIntent.currency,
        status: d.paymentIntent.status,
        cryptoAmount: d.paymentIntent.cryptoAmount,
        cryptoTokenKey: d.paymentIntent.cryptoTokenKey,
        authorizationWalletAddress: d.paymentIntent.authorizationWalletAddress,
        customerEmail: d.paymentIntent.customerAccount?.email ?? null,
        customerName: d.paymentIntent.customerAccount?.name ?? null,
        appName: d.paymentIntent.app.name,
        appId: d.paymentIntent.app.id,
      },
    })),
    total,
    page,
    pageSize,
  };
}

// ── Get single dispute (admin) ──

export async function getDispute(disputeId: string) {
  const db = getDatabaseClient();

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      paymentIntent: {
        include: {
          app: { select: { id: true, name: true, merchantId: true } },
          customerAccount: { select: { email: true, name: true } },
          transactions: {
            where: { type: 'DISPUTE' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  });

  if (!dispute) {
    throw new NotFoundError('Dispute', disputeId);
  }

  // Generate presigned URLs for proofs if available
  const [customerProofUrl, merchantProofUrl] = await Promise.all([
    dispute.customerProofKey
      ? getPresignedDownloadUrl(S3_BUCKETS.UPLOADS, dispute.customerProofKey, STORAGE_LIMITS.PROOF_URL_EXPIRY_SECONDS)
      : Promise.resolve(null),
    dispute.merchantProofKey
      ? getPresignedDownloadUrl(S3_BUCKETS.UPLOADS, dispute.merchantProofKey, STORAGE_LIMITS.PROOF_URL_EXPIRY_SECONDS)
      : Promise.resolve(null),
  ]);

  return {
    id: dispute.id,
    paymentIntentId: dispute.paymentIntentId,
    reason: dispute.reason,
    evidence: dispute.evidence,
    customerProofKey: dispute.customerProofKey,
    customerProofUrl,
    merchantResponse: dispute.merchantResponse,
    merchantProofKey: dispute.merchantProofKey,
    merchantProofUrl,
    status: dispute.status,
    deadline: dispute.deadline.toISOString(),
    createdAt: dispute.createdAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    resolvedBy: dispute.resolvedBy,
    paymentIntent: {
      id: dispute.paymentIntent.id,
      amount: dispute.paymentIntent.amount.toString(),
      currency: dispute.paymentIntent.currency,
      status: dispute.paymentIntent.status,
      cryptoAmount: dispute.paymentIntent.cryptoAmount,
      cryptoTokenKey: dispute.paymentIntent.cryptoTokenKey,
      authorizationChainId: dispute.paymentIntent.authorizationChainId,
      authorizationWalletAddress: dispute.paymentIntent.authorizationWalletAddress,
      capturedAt: dispute.paymentIntent.capturedAt?.toISOString() ?? null,
      timelockDuration: dispute.paymentIntent.timelockDuration,
      disputeStartDuration: dispute.paymentIntent.disputeStartDuration,
      customerEmail: dispute.paymentIntent.customerAccount?.email ?? null,
      customerName: dispute.paymentIntent.customerAccount?.name ?? null,
      appName: dispute.paymentIntent.app.name,
      appId: dispute.paymentIntent.app.id,
      transactions: dispute.paymentIntent.transactions.map((t) => ({
        id: t.id,
        txHash: t.txHash,
        status: t.status,
        type: t.type,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  };
}

// ── Customer payment history (for customer portal) ──

export async function getCustomerPayments(customerEmail: string) {
  const db = getDatabaseClient();

  const payments = await db.paymentIntent.findMany({
    where: {
      customerAccount: { email: customerEmail },
      status: { not: 'CREATED' }, // Only show payments that have progressed
    },
    include: {
      app: { select: { name: true } },
      dispute: { select: { id: true, status: true, reason: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const tokenKeys = Array.from(
    new Set(payments.map((p) => p.cryptoTokenKey).filter((v): v is string => !!v)),
  );
  const chainIds = Array.from(
    new Set(payments.map((p) => p.authorizationChainId).filter((v): v is number => typeof v === 'number')),
  );

  const [tokens, chains] = await Promise.all([
    tokenKeys.length > 0
      ? db.supportedToken.findMany({
          where: { tokenKey: { in: tokenKeys } },
          select: { tokenKey: true, decimals: true },
        })
      : Promise.resolve([]),
    chainIds.length > 0
      ? db.supportedChain.findMany({
          where: { chainId: { in: chainIds } },
          select: { chainId: true, displayName: true },
        })
      : Promise.resolve([]),
  ]);

  const tokenDecimalsMap = new Map(tokens.map((t) => [t.tokenKey, t.decimals]));
  const chainMap = new Map(chains.map((c) => [c.chainId, c.displayName]));

  return payments.map((p) => {
    let disputeWindowOpen = false;
    let disputeWindowStatus: 'not_applicable' | 'not_open' | 'open' | 'closed' = 'not_applicable';
    let disputeOpensAt: string | null = null;

    if (p.capturedAt && p.status === 'CAPTURED' && !p.dispute) {
      const window = computeDisputeWindow(
        p.capturedAt,
        p.disputeStartDuration,
        p.timelockDuration,
      );
      const now = new Date();
      disputeOpensAt = window.disputeOpensAt.toISOString();
      if (now < window.disputeOpensAt) {
        disputeWindowStatus = 'not_open';
      } else if (now < window.disputeClosesAt) {
        disputeWindowStatus = 'open';
        disputeWindowOpen = true;
      } else {
        disputeWindowStatus = 'closed';
      }
    }

    const decimals = p.cryptoTokenKey ? tokenDecimalsMap.get(p.cryptoTokenKey) : undefined;
    const formattedCryptoAmount =
      p.cryptoAmount && typeof decimals === 'number'
        ? formatRawTokenAmount(p.cryptoAmount, decimals)
        : p.cryptoAmount;
    const chainDisplayName =
      typeof p.authorizationChainId === 'number'
        ? chainMap.get(p.authorizationChainId)
        : undefined;
    const chainName =
      chainDisplayName && typeof p.authorizationChainId === 'number'
        ? `${chainDisplayName} (${p.authorizationChainId})`
        : undefined;

    return {
      id: p.id,
      amount: p.amount.toString(),
      currency: p.currency,
      status: p.status,
      cryptoAmount: formattedCryptoAmount,
      cryptoTokenKey: p.cryptoTokenKey,
      chainName,
      merchantName: p.app.name,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      disputeWindowOpen,
      disputeWindowStatus,
      disputeOpensAt,
      dispute: p.dispute
        ? {
            id: p.dispute.id,
            status: p.dispute.status,
            reason: p.dispute.reason,
            createdAt: p.dispute.createdAt.toISOString(),
          }
        : null,
    };
  });
}

// ── Get receipt data for a customer payment (for PDF download) ──

export async function getPaymentReceiptData(customerEmail: string, paymentIntentId: string): Promise<PdfReceiptData> {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: paymentIntentId },
    include: {
      app: { select: { name: true } },
      customerAccount: { select: { email: true, name: true } },
      transactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { txHash: true, chain: true } },
    },
  });

  if (!intent) throw new NotFoundError('PaymentIntent', paymentIntentId);
  if (!intent.customerAccount?.email || intent.customerAccount.email !== customerEmail) {
    throw new ValidationError('Payment does not belong to this customer');
  }

  const tx = intent.transactions[0];
  const chainId = intent.authorizationChainId;
  let chainName: string | undefined;
  let txExplorerUrl: string | undefined;

  if (chainId) {
    const chain = await db.supportedChain.findUnique({ where: { chainId } });
    if (chain) {
      chainName = chain.displayName;
      if (tx?.txHash) {
        txExplorerUrl = blockExplorerTxUrl(chain.chainId, tx.txHash) ?? undefined;
      }
    }
  }

  const tokenSymbol = intent.cryptoTokenKey?.split('-').pop();
  const paymentUiUrl = env.PAYMENT_UI_URL ?? 'http://localhost:3002';

  return {
    receiptId: intent.id.slice(0, 8).toUpperCase(),
    paymentIntentId: intent.id,
    merchantName: intent.app.name,
    customerName: intent.customerAccount.name ?? undefined,
    customerEmail,
    amount: intent.amount.toString(),
    currency: intent.currency,
    cryptoAmount: intent.cryptoAmount ?? undefined,
    tokenSymbol,
    chainName,
    txHash: tx?.txHash ?? undefined,
    txExplorerUrl,
    paymentDate: (intent.capturedAt ?? intent.createdAt).toISOString(),
    disputeUrl: `${paymentUiUrl}/dispute/${intent.id}`,
  };
}

// ── Merchant dispute functions ────────────────────────────────────────────────

export interface ListMerchantDisputesInput {
  merchantId: string;
  appId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getMerchantDisputes(input: ListMerchantDisputesInput) {
  const db = getDatabaseClient();

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  // Resolve which appIds belong to this merchant
  const appWhere = input.appId
    ? { id: input.appId, merchantId: input.merchantId }
    : { merchantId: input.merchantId };

  const apps = await db.app.findMany({ where: appWhere, select: { id: true } });
  const appIds = apps.map((a) => a.id);

  if (appIds.length === 0) {
    return { disputes: [], total: 0, page, pageSize };
  }

  const disputeWhere: Record<string, unknown> = {
    paymentIntent: { appId: { in: appIds } },
  };
  if (input.status) disputeWhere.status = input.status;

  const [disputes, total] = await Promise.all([
    db.dispute.findMany({
      where: disputeWhere,
      include: {
        paymentIntent: {
          include: {
            app: { select: { id: true, name: true } },
            customerAccount: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.dispute.count({ where: disputeWhere }),
  ]);

  return {
    disputes: disputes.map((d) => ({
      id: d.id,
      paymentIntentId: d.paymentIntentId,
      reason: d.reason,
      status: d.status,
      hasCustomerProof: !!d.customerProofKey,
      hasMerchantProof: !!d.merchantProofKey,
      merchantResponse: d.merchantResponse,
      deadline: d.deadline.toISOString(),
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      paymentIntent: {
        id: d.paymentIntent.id,
        amount: d.paymentIntent.amount.toString(),
        currency: d.paymentIntent.currency,
        status: d.paymentIntent.status,
        customerEmail: d.paymentIntent.customerAccount?.email ?? null,
        customerName: d.paymentIntent.customerAccount?.name ?? null,
        appName: d.paymentIntent.app.name,
        appId: d.paymentIntent.app.id,
      },
    })),
    total,
    page,
    pageSize,
  };
}

export async function getMerchantDispute(merchantId: string, disputeId: string) {
  const db = getDatabaseClient();

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      paymentIntent: {
        include: {
          app: { select: { id: true, name: true, merchantId: true } },
          customerAccount: { select: { email: true, name: true } },
          transactions: {
            where: { type: 'DISPUTE' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  });

  if (!dispute) throw new NotFoundError('Dispute', disputeId);

  // Verify this dispute belongs to the merchant
  if (dispute.paymentIntent.app.merchantId !== merchantId) {
    throw new ValidationError('Dispute not found');
  }

  // Generate presigned URLs for proofs (1-hour expiry)
  const [customerProofUrl, merchantProofUrl] = await Promise.all([
    dispute.customerProofKey
      ? getPresignedDownloadUrl(S3_BUCKETS.UPLOADS, dispute.customerProofKey, STORAGE_LIMITS.PROOF_URL_EXPIRY_SECONDS)
      : Promise.resolve(null),
    dispute.merchantProofKey
      ? getPresignedDownloadUrl(S3_BUCKETS.UPLOADS, dispute.merchantProofKey, STORAGE_LIMITS.PROOF_URL_EXPIRY_SECONDS)
      : Promise.resolve(null),
  ]);

  return {
    id: dispute.id,
    paymentIntentId: dispute.paymentIntentId,
    reason: dispute.reason,
    evidence: dispute.evidence,
    customerProofUrl,
    merchantResponse: dispute.merchantResponse,
    merchantProofUrl,
    status: dispute.status,
    deadline: dispute.deadline.toISOString(),
    createdAt: dispute.createdAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
    paymentIntent: {
      id: dispute.paymentIntent.id,
      amount: dispute.paymentIntent.amount.toString(),
      currency: dispute.paymentIntent.currency,
      status: dispute.paymentIntent.status,
      cryptoAmount: dispute.paymentIntent.cryptoAmount,
      cryptoTokenKey: dispute.paymentIntent.cryptoTokenKey,
      authorizationChainId: dispute.paymentIntent.authorizationChainId,
      authorizationWalletAddress: dispute.paymentIntent.authorizationWalletAddress,
      capturedAt: dispute.paymentIntent.capturedAt?.toISOString() ?? null,
      customerEmail: dispute.paymentIntent.customerAccount?.email ?? null,
      customerName: dispute.paymentIntent.customerAccount?.name ?? null,
      appName: dispute.paymentIntent.app.name,
      appId: dispute.paymentIntent.app.id,
      transactions: dispute.paymentIntent.transactions.map((t) => ({
        id: t.id,
        txHash: t.txHash,
        status: t.status,
        type: t.type,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  };
}

export async function respondToDispute(input: RespondToDisputeInput) {
  const db = getDatabaseClient();

  const dispute = await db.dispute.findUnique({
    where: { id: input.disputeId },
    include: {
      paymentIntent: {
        include: {
          app: { select: { id: true, name: true, merchantId: true } },
          customerAccount: { select: { email: true } },
        },
      },
    },
  });

  if (!dispute) throw new NotFoundError('Dispute', input.disputeId);

  if (dispute.paymentIntent.app.merchantId !== input.merchantId) {
    throw new ValidationError('Dispute not found');
  }

  if (dispute.status !== 'OPEN') {
    throw new ValidationError(`Cannot respond to a dispute in ${dispute.status} status`);
  }

  const updated = await db.dispute.update({
    where: { id: input.disputeId },
    data: {
      merchantResponse: input.response,
      ...(input.proofKey ? { merchantProofKey: input.proofKey } : {}),
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    merchantResponse: updated.merchantResponse,
    hasMerchantProof: !!updated.merchantProofKey,
  };
}
