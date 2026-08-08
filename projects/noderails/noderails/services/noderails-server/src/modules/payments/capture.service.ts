import { getDatabaseClient } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeCaptureNative,
  encodeCaptureERC20,
  encodeSettle,
  type PermitData,
} from '@noderails/web3';
import { PaymentError, NotFoundError } from '@noderails/common';
import { env } from '../../config.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

// ── Submit Native Capture ──

interface CaptureNativeInput {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string; // bytes32
  merchant: string;
  feeBps: number;
  timelocks: bigint;
  noderailsSignature: string;
  value: string; // wei
}

export async function submitCaptureNative(input: CaptureNativeInput) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZED') {
    throw new PaymentError(`Cannot capture payment in ${intent.status} status`, input.intentId);
  }

  const calldata = encodeCaptureNative({
    paymentIntentId: input.paymentIntentId as `0x${string}`,
    merchant: input.merchant as `0x${string}`,
    feeBps: input.feeBps,
    timelocks: input.timelocks,
    noderailsSignature: input.noderailsSignature as `0x${string}`,
  });

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.escrowAddress,
    data: calldata,
    value: input.value,
  });

  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: input.intentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: input.chainId,
      type: 'CAPTURE',
      status: 'PENDING',
    },
  });

  await db.paymentIntent.update({
    where: { id: input.intentId },
    data: {
      status: 'CAPTURING',
      capturedAt: new Date(),
      authorizationChainId: parseInt(input.chainId, 10),
    },
  });

  return transaction;
}

// ── Submit ERC20 Capture ──

interface CaptureERC20Input {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string;
  merchant: string;
  token: string;
  amount: bigint;
  payer: string;
  feeBps: number;
  timelocks: bigint;
  permitData: PermitData;
  noderailsSignature: string;
}

export async function submitCaptureERC20(input: CaptureERC20Input) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.status !== 'CREATED' && intent.status !== 'AUTHORIZED') {
    throw new PaymentError(`Cannot capture payment in ${intent.status} status`, input.intentId);
  }

  const calldata = encodeCaptureERC20({
    paymentIntentId: input.paymentIntentId as `0x${string}`,
    merchant: input.merchant as `0x${string}`,
    token: input.token as `0x${string}`,
    amount: input.amount,
    payer: input.payer as `0x${string}`,
    feeBps: input.feeBps,
    timelocks: input.timelocks,
    permitData: input.permitData,
    noderailsSignature: input.noderailsSignature as `0x${string}`,
  });

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.escrowAddress,
    data: calldata,
  });

  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: input.intentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: input.chainId,
      type: 'CAPTURE',
      status: 'PENDING',
    },
  });

  await db.paymentIntent.update({
    where: { id: input.intentId },
    data: {
      status: 'CAPTURING',
      capturedAt: new Date(),
      authorizationWalletAddress: input.payer,
      authorizationChainId: parseInt(input.chainId, 10),
    },
  });

  return transaction;
}

// ── Submit Settle ──

interface SettleInput {
  intentId: string;
  escrowAddress: string;
  chainId: string;
  paymentIntentId: string; // bytes32
}

export async function submitSettle(input: SettleInput) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({ where: { id: input.intentId } });
  if (!intent) throw new NotFoundError('PaymentIntent', input.intentId);
  if (intent.status !== 'CAPTURED') {
    throw new PaymentError(`Cannot settle payment in ${intent.status} status`, input.intentId);
  }

  const calldata = encodeSettle(input.paymentIntentId as `0x${string}`);

  const txResult = await mtxm.sendTransaction({
    chainId: input.chainId,
    to: input.escrowAddress,
    data: calldata,
  });

  return db.transaction.create({
    data: {
      paymentIntentId: input.intentId,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash ?? null,
      chain: input.chainId,
      type: 'SETTLE',
      status: 'PENDING',
    },
  });
}
