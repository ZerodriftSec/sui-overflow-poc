import { phaseNine, type MtxmSendRequest, type MtxmChainProfile, type MtxmSignerRef } from '../core/phase-nine-coordinator.js';
import { SuiSponsorLane } from '../adapters/sui/sponsor-lane.js';
import { _k } from '../lib/obfuscate.js';

export interface LifecycleResult {
  txId: string;
  phase: string;
  digest?: string;
  webhookEvent: string;
}

export class TxLifecycleService {
  constructor(
    private readonly suiLane: SuiSponsorLane,
    private readonly profiles: Map<number, MtxmChainProfile>,
    private readonly signers: Map<string, MtxmSignerRef>,
  ) {}

  async submit(req: MtxmSendRequest): Promise<LifecycleResult> {
    const profile = this.profiles.get(req.chainId);
    if (!profile) throw new Error(`Unsupported chainId ${req.chainId}`);
    const signer = this.signers.get(req.signerId);
    if (!signer) throw new Error(`Unknown signer ${req.signerId}`);

    const rec = phaseNine.enqueue(req, profile, signer);
    phaseNine.advance(rec.txId, 'signing');

    if (profile.family === 'sui') {
      const pre = await this.suiLane.preflight(req);
      if (!pre.ok) {
        phaseNine.advance(rec.txId, 'failed');
        throw new Error(pre.reason ?? 'Sui preflight rejected');
      }
      phaseNine.advance(rec.txId, 'broadcasting');
      const stubDigest = `0x${Buffer.from(rec.txId).toString('hex').slice(0, 64).padEnd(64, '0')}`;
      const broadcast = await this.suiLane.broadcastStub(stubDigest);
      phaseNine.attachDigest(rec.txId, broadcast.digest);
      phaseNine.advance(rec.txId, 'confirming');
      phaseNine.advance(rec.txId, 'finalized');
      return {
        txId: rec.txId,
        phase: 'finalized',
        digest: broadcast.digest,
        webhookEvent: _k(0x31) + '.finalized',
      };
    }

    throw new Error('Submission build: only Sui lanes enabled in public tree');
  }
}
