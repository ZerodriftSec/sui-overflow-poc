/**
 * Timelock encoding utilities.
 *
 * Mirrors TimelocksLib.sol bit-packing layout:
 *   [224-255]  capturedAt   (32 bits)
 *   [64-95]    settlement   (32 bits)
 *   [32-63]    disputeStart (32 bits)
 */

/**
 * Pack timelock parameters into a single uint256 bigint.
 *
 * @param capturedAt   - Unix timestamp when payment was captured (0 if not yet captured)
 * @param disputeStart - Seconds from capture until dispute window opens
 * @param settlement   - Seconds from capture until settlement allowed
 */
export function packTimelocks(
  capturedAt: number,
  disputeStart: number,
  settlement: number,
): bigint {
  return (
    (BigInt(capturedAt) << 224n) |
    (BigInt(settlement) << 64n) |
    (BigInt(disputeStart) << 32n)
  );
}

/**
 * Pack timelocks with default dispute start (0 = immediate).
 * @deprecated Use packTimelocks(capturedAt, disputeStart, settlement) for explicit control
 */
export function packTimelocksWithDuration(
  capturedAt: number,
  timelockDuration: number,
): bigint {
  return packTimelocks(capturedAt, 0, timelockDuration);
}

/**
 * Unpack a uint256 timelocks value.
 */
export function unpackTimelocks(timelocks: bigint): {
  capturedAt: number;
  disputeStart: number;
  settlement: number;
  /** Absolute timestamp when dispute window opens */
  disputeStartsAt: number;
  /** Absolute timestamp when settlement is allowed */
  settlementAt: number;
} {
  const capturedAt = Number((timelocks >> 224n) & 0xffffffffn);
  const settlement = Number((timelocks >> 64n) & 0xffffffffn);
  const disputeStart = Number((timelocks >> 32n) & 0xffffffffn);

  return {
    capturedAt,
    settlement,
    disputeStart,
    disputeStartsAt: capturedAt + disputeStart,
    settlementAt: capturedAt + settlement,
  };
}

/**
 * Convert packed timelocks bigint to hex string for contract calls.
 */
export function timelocksToHex(timelocks: bigint): string {
  return '0x' + timelocks.toString(16).padStart(64, '0');
}

/**
 * Parse timelocks hex string back to bigint.
 */
export function hexToTimelocks(hex: string): bigint {
  return BigInt(hex);
}

/**
 * Check if a payment is currently in the dispute window.
 */
export function isInDisputeWindow(timelocks: bigint): boolean {
  const { disputeStartsAt, settlementAt } = unpackTimelocks(timelocks);
  const now = Math.floor(Date.now() / 1000);
  return now >= disputeStartsAt && now < settlementAt;
}

/**
 * Check if a payment is ready for settlement.
 */
export function isSettleable(timelocks: bigint): boolean {
  const { settlementAt } = unpackTimelocks(timelocks);
  return Math.floor(Date.now() / 1000) >= settlementAt;
}

/**
 * Get time remaining until settlement (in seconds).
 * Returns 0 if already settleable.
 */
export function getTimeUntilSettlement(timelocks: bigint): number {
  const { settlementAt } = unpackTimelocks(timelocks);
  const remaining = settlementAt - Math.floor(Date.now() / 1000);
  return remaining > 0 ? remaining : 0;
}
