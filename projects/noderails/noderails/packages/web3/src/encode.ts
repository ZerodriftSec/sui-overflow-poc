/**
 * Calldata builders for NodeRails smart contracts.
 *
 * These pure functions ABI-encode contract call data that you pass
 * to MTXM via `sendTransaction({ data: ... })`.
 */

import { encodeFunctionData, type Hex, type Address } from 'viem';
import { nodeRailsEscrowAbi, merchantManagerAbi } from './abis.js';

// ─────────── Escrow: Capture ───────────

export interface CaptureNativeParams {
  paymentIntentId: Hex;
  merchant: Address;
  feeBps: number;
  timelocks: bigint;
  noderailsSignature: Hex;
}

export function encodeCaptureNative(params: CaptureNativeParams): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureNativePayment',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.feeBps,
      params.timelocks,
      params.noderailsSignature,
    ],
  });
}

export interface PermitData {
  amount: bigint;
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
}

export interface CaptureERC20Params {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  payer: Address;
  feeBps: number;
  timelocks: bigint;
  permitData: PermitData;
  noderailsSignature: Hex;
}

export function encodeCaptureERC20(params: CaptureERC20Params): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'captureERC20Payment',
    args: [
      params.paymentIntentId,
      params.merchant,
      params.token,
      params.amount,
      params.payer,
      params.feeBps,
      params.timelocks,
      params.permitData,
      params.noderailsSignature,
    ],
  });
}

// ─────────── Escrow: Settle ───────────

export function encodeSettle(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'settlePayment',
    args: [paymentIntentId],
  });
}

// ─────────── Escrow: Refund ───────────

export function encodeRefundPayment(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'refundPayment',
    args: [paymentIntentId],
  });
}

// ─────────── Escrow: Dispute ───────────

export function encodeInitiateDispute(paymentIntentId: Hex): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'initiateDispute',
    args: [paymentIntentId],
  });
}

export function encodeResolveDispute(paymentIntentId: Hex, winner: Address): Hex {
  return encodeFunctionData({
    abi: nodeRailsEscrowAbi,
    functionName: 'resolveDispute',
    args: [paymentIntentId, winner],
  });
}

// ─────────── Merchant Manager: Payout ───────────

export interface ExecutePayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  sessionSignature: Hex;
  sessionExpiry: bigint;
  nonce: Hex;
  noderailsSignature: Hex;
}

export function encodeExecutePayout(params: ExecutePayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executePayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.recipient,
      params.token,
      params.amount,
      params.sessionSignature,
      params.sessionExpiry,
      params.nonce,
      params.noderailsSignature,
    ],
  });
}

export interface ExecuteNativePayoutParams {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  sessionSignature: Hex;
  sessionExpiry: bigint;
  nonce: Hex;
  noderailsSignature: Hex;
}

export function encodeExecuteNativePayout(params: ExecuteNativePayoutParams): Hex {
  return encodeFunctionData({
    abi: merchantManagerAbi,
    functionName: 'executeNativePayout',
    args: [
      params.payoutIntentId,
      params.merchantWallet,
      params.recipient,
      params.sessionSignature,
      params.sessionExpiry,
      params.nonce,
      params.noderailsSignature,
    ],
  });
}
