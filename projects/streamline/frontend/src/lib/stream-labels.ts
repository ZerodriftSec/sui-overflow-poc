import type { StreamRecord } from "./indexer";

const LABELS_KEY = "sl-stream-labels";
const PENDING_KEY = "sl-stream-labels-pending";

type PendingLabel = {
  name: string;
  freelancer: string;
  total: number;
  at: number;
};

function readLabels(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LABELS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function readPending(): PendingLabel[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingLabel[];
  } catch {
    return [];
  }
}

export function rememberStreamLabel(streamId: string, name: string) {
  if (!name.trim() || typeof window === "undefined") return;
  const labels = readLabels();
  labels[streamId] = name.trim();
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
}

export function queueStreamLabel(name: string, freelancer: string, totalBase: number) {
  if (!name.trim() || typeof window === "undefined") return;
  const pending = readPending().filter((p) => Date.now() - p.at < 86_400_000);
  pending.push({
    name: name.trim(),
    freelancer: freelancer.toLowerCase(),
    total: totalBase,
    at: Date.now(),
  });
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-20)));
}

export function resolveStreamLabel(stream: StreamRecord): string | null {
  const labels = readLabels();
  if (labels[stream.id]) return labels[stream.id];

  const pending = readPending();
  const match = pending.find(
    (p) =>
      p.freelancer === stream.freelancer.toLowerCase() &&
      p.total === stream.total &&
      Date.now() - p.at < 86_400_000
  );
  if (!match) return null;

  rememberStreamLabel(stream.id, match.name);
  const next = pending.filter((p) => p !== match);
  localStorage.setItem(PENDING_KEY, JSON.stringify(next));
  return match.name;
}
