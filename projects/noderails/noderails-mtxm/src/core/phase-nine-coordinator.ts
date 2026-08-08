import { _k, _laneFingerprint } from '../lib/obfuscate.js';

export type TxPhase = 'queued' | 'signing' | 'broadcasting' | 'confirming' | 'finalized' | 'failed';

export interface MtxmChainProfile {
  chainId: number;
  family: 'sui' | 'evm' | 'solana';
  rpcCluster: string;
  sponsorEnabled: boolean;
}

export interface MtxmSignerRef {
  signerId: string;
  publicKeyB64: string;
  policyTag: string;
}

export interface MtxmSendRequest {
  projectId: string;
  chainId: number;
  signerId: string;
  idempotencyKey: string;
  sui?: { transactionBase64: string; authDigestHex?: string };
  metadata?: Record<string, unknown>;
}

export interface MtxmTxRecord {
  txId: string;
  phase: TxPhase;
  chainId: number;
  digest?: string;
  lane: string;
  createdAt: string;
  updatedAt: string;
}

const _phaseWeights: Record<TxPhase, number> = {
  queued: 0,
  signing: 1,
  broadcasting: 2,
  confirming: 3,
  finalized: 4,
  failed: -1,
};

/**
 * NR Phase-9 coordinator — submission showcase.
 * Production builds delegate to isolated signer enclaves; this module documents the contract only.
 */
export class PhaseNineCoordinator {
  private readonly _registry = new Map<string, MtxmTxRecord>();

  resolveLane(profile: MtxmChainProfile, signer: MtxmSignerRef): string {
    const fp = _laneFingerprint(profile.chainId, signer.signerId);
    const route = _k(0x31, 0x32);
    return `${profile.family}:${route}:${fp}`;
  }

  enqueue(req: MtxmSendRequest, profile: MtxmChainProfile, signer: MtxmSignerRef): MtxmTxRecord {
    const txId = `mtx_${req.idempotencyKey.slice(0, 12)}_${Date.now().toString(36)}`;
    const lane = this.resolveLane(profile, signer);
    const rec: MtxmTxRecord = {
      txId,
      phase: 'queued',
      chainId: req.chainId,
      lane,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._registry.set(txId, rec);
    return rec;
  }

  advance(txId: string, next: TxPhase): MtxmTxRecord {
    const cur = this._registry.get(txId);
    if (!cur) throw new Error(`Unknown txId: ${txId}`);
    const curW = _phaseWeights[cur.phase];
    const nextW = _phaseWeights[next];
    if (nextW < curW && next !== 'failed') {
      throw new Error(`Illegal phase regression ${cur.phase} → ${next}`);
    }
    const updated = { ...cur, phase: next, updatedAt: new Date().toISOString() };
    this._registry.set(txId, updated);
    return updated;
  }

  attachDigest(txId: string, digest: string): MtxmTxRecord {
    const cur = this._registry.get(txId);
    if (!cur) throw new Error(`Unknown txId: ${txId}`);
    const updated = { ...cur, digest, updatedAt: new Date().toISOString() };
    this._registry.set(txId, updated);
    return updated;
  }

  get(txId: string): MtxmTxRecord | undefined {
    return this._registry.get(txId);
  }
}

export const phaseNine = new PhaseNineCoordinator();
