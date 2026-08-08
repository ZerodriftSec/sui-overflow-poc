import { suiAddressToBytes } from './addresses.js';
import { coinTypeToMoveTypeName } from './coin-types.js';

function u64LE(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function u16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

/** Must match Move `auth::CAPTURE_NATIVE_V1`. */
export function buildCaptureNativeAuthMessage(params: {
  paymentIntentId: Uint8Array;
  merchantAddress: string;
  amount: bigint;
  feeBps: number;
  timelocks: Uint8Array;
}): Buffer {
  if (params.paymentIntentId.length !== 32 || params.timelocks.length !== 32) {
    throw new Error('paymentIntentId and timelocks must be 32 bytes');
  }
  return Buffer.concat([
    Buffer.from('NodeRailsEscrow::CaptureNative:v1', 'utf8'),
    Buffer.from(params.paymentIntentId),
    Buffer.from(suiAddressToBytes(params.merchantAddress)),
    u64LE(params.amount),
    u16LE(params.feeBps),
    Buffer.from(params.timelocks),
  ]);
}

/** Must match Move `auth::CAPTURE_COIN_V1`. */
export function buildCaptureCoinAuthMessage(params: {
  paymentIntentId: Uint8Array;
  merchantAddress: string;
  coinType: string;
  amount: bigint;
  feeBps: number;
  timelocks: Uint8Array;
}): Buffer {
  if (params.paymentIntentId.length !== 32 || params.timelocks.length !== 32) {
    throw new Error('paymentIntentId and timelocks must be 32 bytes');
  }
  return Buffer.concat([
    Buffer.from('NodeRailsEscrow::CaptureCoin:v1', 'utf8'),
    Buffer.from(params.paymentIntentId),
    Buffer.from(suiAddressToBytes(params.merchantAddress)),
    Buffer.from(coinTypeToMoveTypeName(params.coinType), 'utf8'),
    u64LE(params.amount),
    u16LE(params.feeBps),
    Buffer.from(params.timelocks),
  ]);
}

/** Must match Move `auth::CAPTURE_WALLET_SUBSCRIPTION_V1`. */
export function buildCaptureWalletSubscriptionAuthMessage(params: {
  paymentIntentId: Uint8Array;
  payerAddress: string;
  merchantAddress: string;
  coinType: string;
  amount: bigint;
  feeBps: number;
  timelocks: Uint8Array;
}): Buffer {
  if (params.paymentIntentId.length !== 32 || params.timelocks.length !== 32) {
    throw new Error('paymentIntentId and timelocks must be 32 bytes');
  }
  return Buffer.concat([
    Buffer.from('NodeRailsEscrow::CaptureWalletSubscription:v1', 'utf8'),
    Buffer.from(params.paymentIntentId),
    Buffer.from(suiAddressToBytes(params.payerAddress)),
    Buffer.from(suiAddressToBytes(params.merchantAddress)),
    Buffer.from(coinTypeToMoveTypeName(params.coinType), 'utf8'),
    u64LE(params.amount),
    u16LE(params.feeBps),
    Buffer.from(params.timelocks),
  ]);
}

export function buildSolanaSessionMessage(merchantAddress: string, sessionExpiryMs: bigint): Buffer {
  return Buffer.concat([
    Buffer.from('NodeRailsMerchantManager::Session:v1', 'utf8'),
    Buffer.from(suiAddressToBytes(merchantAddress)),
    (() => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(sessionExpiryMs, 0);
      return b;
    })(),
  ]);
}

export function buildNativePayoutMessageSui(params: {
  payoutIntentId: Uint8Array;
  merchantAddress: string;
  recipientAddress: string;
  amount: bigint;
  nonce: Uint8Array;
}): Buffer {
  if (params.payoutIntentId.length !== 32 || params.nonce.length !== 32) {
    throw new Error('payoutIntentId and nonce must be 32 bytes');
  }
  return Buffer.concat([
    Buffer.from('NodeRailsMerchantManager::NoderailsNativePayout:v1', 'utf8'),
    Buffer.from(params.payoutIntentId),
    Buffer.from(suiAddressToBytes(params.merchantAddress)),
    Buffer.from(suiAddressToBytes(params.recipientAddress)),
    u64LE(params.amount),
    Buffer.from(params.nonce),
  ]);
}
