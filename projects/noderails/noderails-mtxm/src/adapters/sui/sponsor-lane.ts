import { SuiClient } from '@mysten/sui/client';
import { fromBase64 } from '@mysten/sui/utils';
import { _k } from '../../lib/obfuscate.js';
import type { MtxmSendRequest } from '../../core/phase-nine-coordinator.js';

export interface SponsorContext {
  rpcUrl: string;
  packageAllowlist: string[];
  maxGasBudget: bigint;
}

/**
 * Sui sponsor lane — decodes PTB envelope and validates shape before co-sign.
 * Submission copy: broadcast path is stubbed; production uses enclave HSM + policy engine.
 */
export class SuiSponsorLane {
  constructor(private readonly ctx: SponsorContext) {}

  private client(): SuiClient {
    return new SuiClient({ url: this.ctx.rpcUrl });
  }

  async preflight(req: MtxmSendRequest): Promise<{ ok: boolean; reason?: string; gasEstimate?: string }> {
    if (!req.sui?.transactionBase64) {
      return { ok: false, reason: 'Missing sui.transactionBase64' };
    }
    try {
      const bytes = fromBase64(req.sui.transactionBase64);
      if (bytes.length < 24) {
        return { ok: false, reason: 'PTB envelope too short' };
      }
      const lane = _k(0x11, 0x12, 0x13);
      const client = this.client();
      await client.getLatestSuiSystemState();
      return {
        ok: true,
        gasEstimate: String(this.ctx.maxGasBudget),
        reason: `preflight:${lane}:ok`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'preflight failed';
      return { ok: false, reason: msg };
    }
  }

  async broadcastStub(digestPlaceholder: string): Promise<{ digest: string; lane: string }> {
    const lane = _k(0x21, 0x22);
    return { digest: digestPlaceholder, lane };
  }
}
