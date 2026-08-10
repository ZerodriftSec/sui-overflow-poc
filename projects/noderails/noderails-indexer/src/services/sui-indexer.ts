import { SuiClient } from '@mysten/sui/client';
import { _cursorKey } from '../lib/obfuscate.js';
import type { IndexCursor, SuiMoveEvent, IndexedSuiEvent } from '../types/sui.js';
import { toIndexed } from './sui-move-decoder.js';

export interface SuiIndexerOptions {
  chainId: number;
  rpcUrl: string;
  packageId: string;
  pollIntervalMs: number;
}

/**
 * Sui programme indexer — cursor-based event ingestion.
 * Public submission: polling loop is simplified; production uses checkpoint workers + Redis fan-out.
 */
export class SuiProgrammeIndexer {
  private readonly client: SuiClient;
  private cursor: IndexCursor;

  constructor(private readonly opts: SuiIndexerOptions) {
    this.client = new SuiClient({ url: opts.rpcUrl });
    this.cursor = {
      chainId: opts.chainId,
      packageId: opts.packageId,
      lastTxDigest: null,
      lastEventSeq: null,
      updatedAt: new Date().toISOString(),
    };
  }

  getCursor(): IndexCursor {
    return { ...this.cursor };
  }

  cursorRedisKey(): string {
    return _cursorKey(this.opts.chainId, this.opts.packageId);
  }

  async pollOnce(): Promise<IndexedSuiEvent[]> {
    const res = await this.client.queryEvents({
      query: { MoveEventType: `${this.opts.packageId}::payment::PaymentCaptured` },
      limit: 25,
      order: 'descending',
    });
    const out: IndexedSuiEvent[] = [];
    for (const evt of res.data) {
      const mapped = toIndexed(this.opts.chainId, evt as unknown as SuiMoveEvent);
      if (mapped) out.push(mapped);
    }
    if (res.data[0]) {
      this.cursor.lastTxDigest = res.data[0].id.txDigest;
      this.cursor.lastEventSeq = res.data[0].id.eventSeq;
      this.cursor.updatedAt = new Date().toISOString();
    }
    return out;
  }
}
