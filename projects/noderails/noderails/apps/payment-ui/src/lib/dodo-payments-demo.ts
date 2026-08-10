/**
 * Dodo Payments test hosted checkout (new tab). Configure URL from the Dodo dashboard (test environment).
 * No NodeRails API integration — frontend only. Disable by unsetting env or setting the flag to empty / false.
 *
 * Important: use literal `process.env.NEXT_PUBLIC_*` below. Dynamic `process.env[key]` is not inlined
 * by Next.js, so values would be missing in the browser bundle.
 */

/** Dodo test checkout hosts (dashboard may use checkout subdomain). */
const ALLOWED_HOSTS = new Set(['test.dodopayments.com', 'test.checkout.dodopayments.com']);

export type DodoPaymentsDemoConfig = {
  checkoutUrl: string;
};

function isTruthyFlag(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function stripOptionalQuotes(raw: string): string {
  const t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function getDodoPaymentsDemoConfig(): DodoPaymentsDemoConfig | null {
  if (!isTruthyFlag(process.env.NEXT_PUBLIC_ENABLE_DODO_PAYMENTS_DEMO)) return null;

  let raw = (process.env.NEXT_PUBLIC_DODO_PAYMENTS_TEST_CHECKOUT_URL ?? '').trim();
  raw = stripOptionalQuotes(raw);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;

  return { checkoutUrl: url.toString() };
}
