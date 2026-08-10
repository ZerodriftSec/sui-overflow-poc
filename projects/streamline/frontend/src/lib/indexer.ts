"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndexerClient,
  type StreamRecord,
  type DripRecord,
  type AuditEventRecord,
  type PayrollRow,
} from "@streamline/sdk";

/**
 * Client for the StreamLine Rust indexer: typed REST reads + a WebSocket hook
 * for live drip / state updates. REST helpers come from `@streamline/sdk`.
 */

export type { StreamRecord, DripRecord, AuditEventRecord, PayrollRow };

export type LiveUpdate =
  | { type: "drip"; stream_id: string; amount: number; timestamp_ms: number }
  | { type: "state"; stream_id: string; state: string };

const HTTP =
  process.env.NEXT_PUBLIC_INDEXER_URL?.replace(/\/$/, "") ??
  "http://localhost:8080";
const WS =
  process.env.NEXT_PUBLIC_INDEXER_WS_URL ??
  HTTP.replace(/^http/, "ws") + "/ws";

const indexer = new IndexerClient(HTTP);

export function fetchStreams(params: {
  freelancer?: string;
  sender?: string;
}): Promise<StreamRecord[]> {
  return indexer.list(params);
}

export function fetchStreamDrips(streamId: string): Promise<DripRecord[]> {
  return indexer.drips(streamId);
}

// === React Query hooks ===

export function useStreams(params: { freelancer?: string; sender?: string }) {
  return useQuery({
    queryKey: ["streams", params],
    queryFn: () => fetchStreams(params),
    enabled: !!(params.freelancer || params.sender),
    refetchInterval: 15_000,
  });
}

export function useStream(id: string | undefined) {
  return useQuery({
    queryKey: ["stream", id],
    queryFn: () => indexer.get(id!),
    enabled: !!id,
  });
}

export function useStreamDrips(id: string | undefined) {
  return useQuery({
    queryKey: ["drips", id],
    queryFn: () => fetchStreamDrips(id!),
    enabled: !!id,
    refetchInterval: 20_000,
  });
}

export function useAuditEvents(params: {
  party?: string;
  subject?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["audit", params],
    queryFn: () => indexer.audit(params),
    enabled: !!(params.party || params.subject),
    refetchInterval: 20_000,
  });
}

export function usePayrollStatement(params: {
  sender?: string;
  fromMs?: number;
  toMs?: number;
}) {
  return useQuery({
    queryKey: ["payroll", params],
    queryFn: () =>
      indexer.payroll({
        sender: params.sender!,
        fromMs: params.fromMs,
        toMs: params.toMs,
      }),
    enabled: !!params.sender,
    refetchInterval: 30_000,
  });
}

/**
 * Subscribe to the indexer's live feed. Reconnects on drop. `onUpdate` is held
 * in a ref so changing the callback doesn't churn the socket.
 */
/** Coalesce bursts of live frames so a refetch fan-out fires at most this often. */
const LIVE_UPDATE_THROTTLE_MS = 5000;

export function useLiveUpdates(onUpdate: (u: LiveUpdate) => void) {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    // Throttle: during an active drip the indexer emits frequently. Firing the
    // full refetch fan-out per frame bursts past RPC rate limits (429s), so
    // coalesce — fire immediately if idle, otherwise once on a trailing timer.
    let lastFire = 0;
    let pending: LiveUpdate | null = null;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const fire = (u: LiveUpdate) => {
      lastFire = Date.now();
      cb.current(u);
    };
    const schedule = (u: LiveUpdate) => {
      const since = Date.now() - lastFire;
      if (since >= LIVE_UPDATE_THROTTLE_MS) {
        fire(u);
        return;
      }
      pending = u;
      if (!trailing) {
        trailing = setTimeout(() => {
          trailing = null;
          if (pending) {
            const next = pending;
            pending = null;
            fire(next);
          }
        }, LIVE_UPDATE_THROTTLE_MS - since);
      }
    };

    const connect = () => {
      ws = new WebSocket(WS);
      ws.onmessage = (e) => {
        try {
          schedule(JSON.parse(e.data) as LiveUpdate);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (trailing) clearTimeout(trailing);
      ws?.close();
    };
  }, []);
}
