/**
 * Pro invoices — merchant-side bills paid as USDC wallet transfers.
 * Share links encode the full bill (no server); merchant list is localStorage.
 */

import { newId } from "@/components/app/pro/types";

export type ProInvoiceStatus = "open" | "paid" | "void";

export type ProInvoice = {
  id: string;
  number: string;
  customer: string;
  amountUsd: number;
  payeeAddress: string;
  note: string;
  dueAtMs: number | null;
  status: ProInvoiceStatus;
  createdAtMs: number;
  paidAtMs?: number;
  paidDigest?: string;
  /** Org treasury the pay link settles into (POS `pos::pay`). */
  treasuryId?: string;
  /** True when settled by hand rather than reconciled from a PosPaid event. */
  paidManual?: boolean;
};

const KEY_PREFIX = "sl-pro-invoices";

/** Demo explore mode (no wallet) uses this storage bucket. */
export const DEMO_INVOICE_KEY = "demo";

function storageKey(ownerKey: string) {
  return `${KEY_PREFIX}:${ownerKey.toLowerCase()}`;
}

export function emptyInvoices(): ProInvoice[] {
  return [];
}

export function seedDemoInvoices(payeeAddress: string): ProInvoice[] {
  const now = Date.now();
  return [
    {
      id: newId("inv"),
      number: "INV-1001",
      customer: "Northwind Co",
      amountUsd: 2400,
      payeeAddress,
      note: "Q2 retainer",
      dueAtMs: now + 7 * 86400000,
      status: "open",
      createdAtMs: now - 2 * 86400000,
    },
    {
      id: newId("inv"),
      number: "INV-1000",
      customer: "Acme Studio",
      amountUsd: 850,
      payeeAddress,
      note: "Brand kit delivery",
      dueAtMs: now - 3 * 86400000,
      status: "open",
      createdAtMs: now - 10 * 86400000,
    },
    {
      id: newId("inv"),
      number: "INV-0998",
      customer: "Orbit Labs",
      amountUsd: 1200,
      payeeAddress,
      note: "",
      dueAtMs: null,
      status: "paid",
      createdAtMs: now - 20 * 86400000,
      paidAtMs: now - 18 * 86400000,
      paidDigest: "0xseedinvoice01",
    },
  ];
}

export function loadInvoices(ownerKey: string): ProInvoice[] {
  if (typeof window === "undefined" || !ownerKey) return emptyInvoices();
  try {
    const raw = localStorage.getItem(storageKey(ownerKey));
    if (!raw) {
      if (ownerKey === DEMO_INVOICE_KEY) {
        const seeded = seedDemoInvoices(
          "0x0000000000000000000000000000000000000000000000000000000000d00001"
        );
        saveInvoices(ownerKey, seeded);
        return seeded;
      }
      return emptyInvoices();
    }
    const parsed = JSON.parse(raw) as ProInvoice[];
    return Array.isArray(parsed) ? parsed : emptyInvoices();
  } catch {
    return emptyInvoices();
  }
}

export function saveInvoices(ownerKey: string, invoices: ProInvoice[]) {
  if (typeof window === "undefined" || !ownerKey) return;
  localStorage.setItem(storageKey(ownerKey), JSON.stringify(invoices));
}

export function nextInvoiceNumber(existing: ProInvoice[]): string {
  let max = 1000;
  for (const inv of existing) {
    const m = /^INV-(\d+)$/i.exec(inv.number);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `INV-${max + 1}`;
}

export function effectiveStatus(
  inv: ProInvoice,
  nowMs = Date.now()
): ProInvoiceStatus | "overdue" {
  if (inv.status !== "open") return inv.status;
  if (inv.dueAtMs != null && inv.dueAtMs < nowMs) return "overdue";
  return "open";
}

export type InvoiceSharePayload = {
  id: string;
  number: string;
  customer: string;
  amount: number;
  to: string;
  note: string;
  due: number | null;
  org: string;
};

export function buildInvoiceShareUrl(
  inv: ProInvoice,
  orgName: string,
  origin?: string
): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://streamline.app");
  const p = new URLSearchParams({
    id: inv.id,
    number: inv.number,
    customer: inv.customer,
    amount: String(inv.amountUsd),
    to: inv.payeeAddress,
  });
  if (inv.note.trim()) p.set("note", inv.note.trim());
  if (inv.dueAtMs != null) p.set("due", String(inv.dueAtMs));
  if (orgName.trim()) p.set("org", orgName.trim());
  return `${base}/pay/invoice?${p.toString()}`;
}

/**
 * Customer-facing pay link. Routes through the real POS pay page so the payment
 * runs `pos::pay` — depositing USDC into the org treasury and emitting a
 * `PosPaid` event tagged with `qr_id = invoice.id`. Pro reconciles those events
 * to auto-settle the bill (real, verifiable), instead of a manual mark.
 */
export function buildInvoicePayUrl(
  inv: ProInvoice,
  treasuryId: string,
  orgName: string,
  origin?: string
): string {
  const base =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://strmln.space");
  const p = new URLSearchParams({
    t: treasuryId,
    q: inv.id,
    l: `${inv.number} · ${inv.customer}`,
    a: String(inv.amountUsd),
  });
  if (orgName.trim()) p.set("org", orgName.trim());
  return `${base}/pay/qr?${p.toString()}`;
}

export function parseInvoiceShareSearch(
  search: string | URLSearchParams
): InvoiceSharePayload | null {
  const p =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;
  const to = (p.get("to") ?? "").trim();
  const amount = Number(p.get("amount"));
  const id = (p.get("id") ?? "").trim();
  if (!to || !id || !(amount > 0)) return null;
  const dueRaw = p.get("due");
  return {
    id,
    number: (p.get("number") ?? "INV").trim() || "INV",
    customer: (p.get("customer") ?? "Customer").trim() || "Customer",
    amount,
    to,
    note: (p.get("note") ?? "").trim(),
    due: dueRaw ? Number(dueRaw) : null,
    org: (p.get("org") ?? "").trim(),
  };
}
