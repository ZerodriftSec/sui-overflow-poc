import type { GoldRushEnvelope } from './types.js';

export function parseGoldRushJson<T>(raw: unknown): T {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Invalid API response: expected JSON object');
  }
  const obj = raw as GoldRushEnvelope<T> & T;
  if (obj.error === true) {
    const msg = obj.error_message ?? 'GoldRush API error';
    throw new Error(msg);
  }
  if ('data' in obj && obj.data !== undefined && obj.data !== null) {
    return obj.data as T;
  }
  return raw as T;
}
