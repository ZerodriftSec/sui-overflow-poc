/**
 * Headless REST client for the StreamLine Rust indexer.
 */

export type StreamRecord = {
  id: string;
  sender: string;
  freelancer: string;
  coin_type: string;
  total: number;
  remaining: number;
  state: "locked" | "pending_review" | "dripping" | "paused" | "done";
  current_milestone: number;
  n_milestones: number;
  duration_ms: number;
  drip_interval_ms: number;
  last_drip_ms: number;
  review_deadline_ms: number | null;
  created_at_ms: number;
};

export type DripRecord = {
  id: number;
  stream_id: string;
  amount: number;
  timestamp_ms: number;
  tx_digest: string | null;
};

export type AuditEventRecord = {
  id: number;
  kind: string;
  module: string;
  subject_id: string;
  sender: string;
  counterparty: string;
  amount: number;
  amount_b: number;
  meta_json: string;
  timestamp_ms: number;
  tx_digest: string;
};

export type PayrollRow = {
  stream_id: string;
  freelancer: string;
  coin_type: string;
  total_locked: number;
  total_dripped: number;
  drip_count: number;
  first_drip_ms: number | null;
  last_drip_ms: number | null;
  digests: string;
};

export class IndexerClient {
  constructor(private readonly baseUrl: string) {}

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`indexer ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  }

  health(): Promise<{ ok?: boolean }> {
    return this.getJson("/health");
  }

  list(params: {
    freelancer?: string;
    sender?: string;
  } = {}): Promise<StreamRecord[]> {
    const q = new URLSearchParams();
    if (params.freelancer) q.set("freelancer", params.freelancer);
    if (params.sender) q.set("sender", params.sender);
    const qs = q.toString();
    return this.getJson(`/streams${qs ? `?${qs}` : ""}`);
  }

  get(id: string): Promise<StreamRecord> {
    return this.getJson(`/stream/${id}`);
  }

  drips(streamId: string): Promise<DripRecord[]> {
    return this.getJson(`/stream/${streamId}/drips`);
  }

  audit(params: {
    party?: string;
    subject?: string;
    fromMs?: number;
    toMs?: number;
    limit?: number;
  } = {}): Promise<AuditEventRecord[]> {
    const q = new URLSearchParams();
    if (params.party) q.set("party", params.party);
    if (params.subject) q.set("subject", params.subject);
    if (params.fromMs != null) q.set("from_ms", String(params.fromMs));
    if (params.toMs != null) q.set("to_ms", String(params.toMs));
    if (params.limit != null) q.set("limit", String(params.limit));
    const qs = q.toString();
    return this.getJson(`/audit${qs ? `?${qs}` : ""}`);
  }

  payroll(params: {
    sender: string;
    fromMs?: number;
    toMs?: number;
  }): Promise<PayrollRow[]> {
    const q = new URLSearchParams({ sender: params.sender });
    if (params.fromMs != null) q.set("from_ms", String(params.fromMs));
    if (params.toMs != null) q.set("to_ms", String(params.toMs));
    return this.getJson(`/payroll?${q.toString()}`);
  }
}
