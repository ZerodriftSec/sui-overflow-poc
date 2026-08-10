/**
 * Event log decoding helpers.
 *
 * These decode raw event logs (from Indexer webhooks)
 * into typed objects.
 */

import {
  decodeEventLog,
  type Hex,
  type DecodeEventLogReturnType,
} from 'viem';
import { nodeRailsEscrowAbi, merchantManagerAbi } from './abis.js';

// ── Escrow events ──

export type EscrowEvent = DecodeEventLogReturnType<typeof nodeRailsEscrowAbi>;

export function decodeEscrowEvent(topics: [Hex, ...Hex[]] | [], data: Hex): EscrowEvent {
  return decodeEventLog({
    abi: nodeRailsEscrowAbi,
    topics,
    data,
  });
}

// ── Merchant Manager events ──

export type MerchantManagerEvent = DecodeEventLogReturnType<typeof merchantManagerAbi>;

export function decodeMerchantManagerEvent(topics: [Hex, ...Hex[]] | [], data: Hex): MerchantManagerEvent {
  return decodeEventLog({
    abi: merchantManagerAbi,
    topics,
    data,
  });
}
