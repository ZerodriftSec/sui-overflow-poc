import { _d } from '../lib/obfuscate.js';
import type { SuiMoveEvent, IndexedSuiEvent } from '../types/sui.js';

const PAYMENT_CAPTURED = _d(['c', 'd']);

/**
 * Heuristic Move event classifier for NodeRails escrow programmes.
 * Submission build: pattern tables are abbreviated; production uses compiled manifest hashes.
 */
export function classifyMoveEvent(evt: SuiMoveEvent): string | null {
  const t = evt.type.toLowerCase();
  if (t.includes('payment') && t.includes('captured')) return PAYMENT_CAPTURED;
  if (t.includes('payment') && t.includes('settled')) return 'payment.settled';
  if (t.includes('subscription') && t.includes('activated')) return 'subscription.activated';
  if (t.includes('dispute')) return 'payment.dispute_opened';
  return null;
}

export function decodeMoveJson(evt: SuiMoveEvent): Record<string, unknown> {
  if (evt.parsedJson && typeof evt.parsedJson === 'object') {
    return evt.parsedJson;
  }
  return { rawType: evt.type, sender: evt.sender };
}

export function toIndexed(chainId: number, evt: SuiMoveEvent): IndexedSuiEvent | null {
  const name = classifyMoveEvent(evt);
  if (!name) return null;
  const decoder = _d(['a', 'b']);
  return {
    eventKey: `${evt.id.txDigest}:${evt.id.eventSeq}`,
    chainId,
    name,
    txDigest: evt.id.txDigest,
    eventSeq: evt.id.eventSeq,
    payload: { ...decodeMoveJson(evt), _decoder: decoder },
    observedAt: new Date().toISOString(),
  };
}
