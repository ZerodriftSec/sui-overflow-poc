/**
 * EIP-712 typed-data helpers for backend signing.
 *
 * The Escrow and MerchantManager contracts verify EIP-712
 * signatures. These helpers build the typed-data structs
 * that a viem `WalletClient` or `privateKeyToAccount` can sign.
 */

import type { Hex, Address } from 'viem';
import { EIP712_DOMAINS } from '@noderails/common';

// ── Escrow: CaptureNativePayment ──

export interface CaptureNativeTypedData {
  paymentIntentId: Hex;
  merchant: Address;
  amount: bigint;
  feeBps: number;
  timelocks: bigint;
  nonce: Hex;
}

export function buildCaptureNativeTypedData(
  params: CaptureNativeTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.ESCROW.name,
      version: EIP712_DOMAINS.ESCROW.version,
      chainId,
      verifyingContract,
    },
    types: {
      CaptureNativePayment: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'timelocks', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'CaptureNativePayment' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      amount: params.amount,
      feeBps: params.feeBps,
      timelocks: params.timelocks,
      nonce: params.nonce,
    },
  };
}

// ── Escrow: CaptureERC20Payment ──

export interface CaptureERC20TypedData {
  paymentIntentId: Hex;
  merchant: Address;
  token: Address;
  amount: bigint;
  payer: Address;
  feeBps: number;
  timelocks: bigint;
  nonce: Hex;
}

export function buildCaptureERC20TypedData(
  params: CaptureERC20TypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.ESCROW.name,
      version: EIP712_DOMAINS.ESCROW.version,
      chainId,
      verifyingContract,
    },
    types: {
      CaptureERC20Payment: [
        { name: 'paymentIntentId', type: 'bytes32' },
        { name: 'merchant', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payer', type: 'address' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'timelocks', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'CaptureERC20Payment' as const,
    message: {
      paymentIntentId: params.paymentIntentId,
      merchant: params.merchant,
      token: params.token,
      amount: params.amount,
      payer: params.payer,
      feeBps: params.feeBps,
      timelocks: params.timelocks,
      nonce: params.nonce,
    },
  };
}

// ── MerchantManager: NoderailsPayout ──

export interface PayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  nonce: Hex;
}

export function buildPayoutTypedData(
  params: PayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      NoderailsPayout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'NoderailsPayout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      recipient: params.recipient,
      token: params.token,
      amount: params.amount,
      nonce: params.nonce,
    },
  };
}

// ── MerchantManager: NoderailsNativePayout ──

export interface NativePayoutTypedData {
  payoutIntentId: Hex;
  merchantWallet: Address;
  recipient: Address;
  amount: bigint;
  nonce: Hex;
}

export function buildNativePayoutTypedData(
  params: NativePayoutTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      NoderailsNativePayout: [
        { name: 'payoutIntentId', type: 'bytes32' },
        { name: 'merchantWallet', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'NoderailsNativePayout' as const,
    message: {
      payoutIntentId: params.payoutIntentId,
      merchantWallet: params.merchantWallet,
      recipient: params.recipient,
      amount: params.amount,
      nonce: params.nonce,
    },
  };
}

// ── MerchantManager: Session (for merchant to sign) ──

export interface SessionTypedData {
  merchantWallet: Address;
  sessionExpiry: bigint;
}

export function buildSessionTypedData(
  params: SessionTypedData,
  chainId: number,
  verifyingContract: Address,
) {
  return {
    domain: {
      name: EIP712_DOMAINS.MERCHANT_MANAGER.name,
      version: EIP712_DOMAINS.MERCHANT_MANAGER.version,
      chainId,
      verifyingContract,
    },
    types: {
      Session: [
        { name: 'merchantWallet', type: 'address' },
        { name: 'sessionExpiry', type: 'uint256' },
      ],
    },
    primaryType: 'Session' as const,
    message: {
      merchantWallet: params.merchantWallet,
      sessionExpiry: params.sessionExpiry,
    },
  };
}
