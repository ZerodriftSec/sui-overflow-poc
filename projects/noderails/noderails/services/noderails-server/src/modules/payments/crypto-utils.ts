import type { Hex } from 'viem';

/**
 * Convert a UUID string to bytes32 (hex-encoded, left-padded).
 * UUID: 550e8400-e29b-41d4-a716-446655440000
 * → 0x00000000000000000000000000000000550e8400e29b41d4a716446655440000
 */
export function uuidToBytes32(uuid: string): Hex {
  const hex = uuid.replace(/-/g, '');
  return `0x${hex.padStart(64, '0')}` as Hex;
}

/**
 * Convert a bytes32 hex string back to a UUID.
 * 0x00000000000000000000000000000000550e8400e29b41d4a716446655440000
 * → 550e8400-e29b-41d4-a716-446655440000
 *
 * Returns null if the input is not a valid bytes32-encoded UUID.
 */
export function bytes32ToUuid(bytes32: string): string | null {
  // Strip 0x prefix if present
  const raw = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;

  // Must be exactly 64 hex characters
  if (raw.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(raw)) {
    return null;
  }

  // The UUID is stored in the last 32 hex chars (right-aligned, left-padded with zeros)
  const padding = raw.slice(0, 32);
  const uuidHex = raw.slice(32);

  // Verify padding is all zeros
  if (padding !== '0'.repeat(32)) {
    return null;
  }

  // Format as UUID: 8-4-4-4-12
  const uuid = [
    uuidHex.slice(0, 8),
    uuidHex.slice(8, 12),
    uuidHex.slice(12, 16),
    uuidHex.slice(16, 20),
    uuidHex.slice(20, 32),
  ].join('-');

  return uuid.toLowerCase();
}

/**
 * Read NodeRails payment intent id from indexer webhook `args`.
 * EVM logs pass `paymentIntentId` as a hex bytes32 string. Solana Anchor fields
 * often arrive as `payment_intent_id`: number[32] (UINT8 array in JSON).
 */
export function paymentIntentUuidFromIndexerArgs(
  args: Record<string, unknown> | undefined,
): string | null {
  if (!args) return null;
  const raw = args.paymentIntentId ?? args.payment_intent_id;
  if (raw == null) return null;

  if (typeof raw === 'string') {
    let s = raw.trim();
    if (s.startsWith('0x')) s = s.slice(2);
    if (s.length === 64 && /^[0-9a-fA-F]+$/.test(s)) {
      return bytes32ToUuid(`0x${s}`);
    }
    return null;
  }

  if (Array.isArray(raw) && raw.length === 32) {
    let hex = '';
    for (const b of raw) {
      const n = typeof b === 'number' ? b : Number(b);
      if (!Number.isInteger(n) || n < 0 || n > 255) return null;
      hex += n.toString(16).padStart(2, '0');
    }
    return bytes32ToUuid(`0x${hex}`);
  }

  return null;
}
