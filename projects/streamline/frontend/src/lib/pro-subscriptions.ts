/**
 * Pro subscriptions — recurring customer billing as StreamLine payment streams.
 * Merchant shares a stream-request link; customer funds USDC → stream drips to merchant.
 */

import type { DurationUnit } from "@/lib/stream-math";
import type { StreamRequestParams } from "@/lib/request-link";

export type ProSubscriptionStatus = "open" | "active" | "ended" | "void";

export type ProSubscription = {
  id: string;
  planName: string;
  customerLabel: string;
  amountUsd: number;
  durationValue: number;
  durationUnit: DurationUnit;
  payeeAddress: string;
  note: string;
  status: ProSubscriptionStatus;
  createdAtMs: number;
  activatedAtMs?: number;
  streamId?: string;
};

const KEY_PREFIX = "sl-pro-subscriptions";
export const DEMO_SUBSCRIPTION_KEY = "demo";

const DEMO_PAYEE =
  "0x0000000000000000000000000000000000000000000000000000000000d00001";

function storageKey(ownerKey: string) {
  return `${KEY_PREFIX}:${ownerKey.toLowerCase()}`;
}

export function emptySubscriptions(): ProSubscription[] {
  return [];
}

export function seedDemoSubscriptions(): ProSubscription[] {
  const now = Date.now();
  return [
    {
      id: newSubId(),
      planName: "Studio retainer",
      customerLabel: "Northwind Co",
      amountUsd: 2400,
      durationValue: 30,
      durationUnit: "days",
      payeeAddress: DEMO_PAYEE,
      note: "Monthly design retainer",
      status: "open",
      createdAtMs: now - 2 * 86400000,
    },
    {
      id: newSubId(),
      planName: "Support desk",
      customerLabel: "Acme Studio",
      amountUsd: 600,
      durationValue: 14,
      durationUnit: "days",
      payeeAddress: DEMO_PAYEE,
      note: "",
      status: "active",
      createdAtMs: now - 20 * 86400000,
      activatedAtMs: now - 18 * 86400000,
      streamId: "0xseedsubstream01",
    },
  ];
}

export function newSubId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSubscriptions(ownerKey: string): ProSubscription[] {
  if (typeof window === "undefined" || !ownerKey) return emptySubscriptions();
  try {
    const raw = localStorage.getItem(storageKey(ownerKey));
    if (!raw) {
      if (ownerKey === DEMO_SUBSCRIPTION_KEY) {
        const seeded = seedDemoSubscriptions();
        saveSubscriptions(ownerKey, seeded);
        return seeded;
      }
      return emptySubscriptions();
    }
    const parsed = JSON.parse(raw) as ProSubscription[];
    return Array.isArray(parsed) ? parsed : emptySubscriptions();
  } catch {
    return emptySubscriptions();
  }
}

export function saveSubscriptions(
  ownerKey: string,
  subscriptions: ProSubscription[]
) {
  if (typeof window === "undefined" || !ownerKey) return;
  localStorage.setItem(storageKey(ownerKey), JSON.stringify(subscriptions));
}

/** Build StreamRequestParams for customer fulfill (merchant = payee/freelancer). */
export function subscriptionToStreamRequest(
  sub: ProSubscription
): StreamRequestParams {
  return {
    streamName: sub.planName,
    recipient: sub.payeeAddress,
    amount: String(sub.amountUsd),
    durationValue: String(sub.durationValue),
    durationUnit: sub.durationUnit,
    isPrivate: false,
    useMilestones: false,
    milestones: [],
    useSplitConfig: false,
    splits: [],
    note: [sub.customerLabel, sub.note].filter(Boolean).join(" · ") || undefined,
  };
}

/** Share URL — same shape User request links use (scan / paste / fulfill). */
export function buildSubscriptionStreamUrl(
  sub: ProSubscription,
  origin?: string
): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://streamline.app");
  const req = subscriptionToStreamRequest(sub);
  const p = new URLSearchParams({
    recipient: req.recipient,
    amount: req.amount,
    duration_value: req.durationValue,
    duration_unit: req.durationUnit,
    stream_name: req.streamName,
    private: "0",
    milestones: "0",
    milestones_count: "0",
    use_splits: "0",
  });
  if (req.note) p.set("note", req.note);
  p.set("sub", sub.id);
  return `${base}/app?${p.toString()}`;
}

/** Branded lander that still encodes stream params for subscribe CTA. */
export function buildSubscriptionShareUrl(
  sub: ProSubscription,
  orgName: string,
  origin?: string
): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://streamline.app");
  const p = new URLSearchParams({
    id: sub.id,
    plan: sub.planName,
    customer: sub.customerLabel,
    amount: String(sub.amountUsd),
    to: sub.payeeAddress,
    duration_value: String(sub.durationValue),
    duration_unit: sub.durationUnit,
  });
  if (sub.note.trim()) p.set("note", sub.note.trim());
  if (orgName.trim()) p.set("org", orgName.trim());
  return `${base}/pay/subscribe?${p.toString()}`;
}

export type SubscriptionSharePayload = {
  id: string;
  plan: string;
  customer: string;
  amount: number;
  to: string;
  durationValue: number;
  durationUnit: DurationUnit;
  note: string;
  org: string;
};

export function parseSubscriptionShareSearch(
  search: string | URLSearchParams
): SubscriptionSharePayload | null {
  const p =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;
  const to = (p.get("to") ?? "").trim();
  const amount = Number(p.get("amount"));
  const id = (p.get("id") ?? "").trim();
  const durationValue = Number(p.get("duration_value") ?? "0");
  const durationUnit = (p.get("duration_unit") as DurationUnit) || "days";
  if (!to || !id || !(amount > 0) || !(durationValue > 0)) return null;
  return {
    id,
    plan: (p.get("plan") ?? "Subscription").trim() || "Subscription",
    customer: (p.get("customer") ?? "").trim(),
    amount,
    to,
    durationValue,
    durationUnit,
    note: (p.get("note") ?? "").trim(),
    org: (p.get("org") ?? "").trim(),
  };
}

export function sharePayloadToStreamRequest(
  payload: SubscriptionSharePayload
): StreamRequestParams {
  return {
    streamName: payload.plan,
    recipient: payload.to,
    amount: String(payload.amount),
    durationValue: String(payload.durationValue),
    durationUnit: payload.durationUnit,
    isPrivate: false,
    useMilestones: false,
    milestones: [],
    useSplitConfig: false,
    splits: [],
    note:
      [payload.customer, payload.note].filter(Boolean).join(" · ") || undefined,
  };
}

export function periodLabel(sub: Pick<ProSubscription, "durationValue" | "durationUnit">): string {
  const u = sub.durationUnit;
  const n = sub.durationValue;
  if (n === 1) return `1 ${u.replace(/s$/, "")}`;
  return `${n} ${u}`;
}
