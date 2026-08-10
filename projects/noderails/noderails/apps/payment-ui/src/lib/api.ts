const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export { API_BASE };

export async function getPaymentIntent(intentId: string) {
  const res = await fetch(`${API_BASE}/payments/intents/${intentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getInvoicePublic(invoiceId: string) {
  const res = await fetch(`${API_BASE}/invoices/public/${invoiceId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function getPaymentLinkBySlug(slug: string) {
  const res = await fetch(`${API_BASE}/payment-links/public/${slug}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

// ── Checkout Sessions ──

/**
 * Create a checkout session from a payment link slug.
 * This is the primary entry point — the payment-ui calls this when a
 * customer visits a payment link URL.
 *
 * Returns: session data + resolved chains/tokens + display info.
 */
export async function createCheckoutSessionFromLink(slug: string) {
  const res = await fetch(`${API_BASE}/checkout-sessions/from-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Create a checkout session from an invoice ID.
 * Called by payment-ui when a customer clicks "Pay Invoice".
 *
 * Returns: session data + resolved chains/tokens + invoice display info.
 */
export async function createCheckoutSessionFromInvoice(invoiceId: string) {
  const res = await fetch(`${API_BASE}/checkout-sessions/from-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Load a checkout session for the payment UI (with resolved chains/tokens).
 */
export type CheckoutSessionLoadResult =
  | { error: string }
  | (Record<string, unknown> & { error?: never });

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSessionLoadResult | null> {
  const res = await fetch(`${API_BASE}/checkout-sessions/public/${sessionId}`, {
    cache: 'no-store',
  });
  let json: { data?: unknown; error?: { message?: string }; message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message =
      json?.error?.message ?? json?.message ?? 'This checkout session is unavailable.';
    return { error: message };
  }
  if (!json) return null;
  return (json.data ?? json) as Record<string, unknown>;
}

// ── Price Conversion ──

export async function getTokenPrice(symbol: string, currency = 'USD'): Promise<{
  symbol: string;
  currency: string;
  priceFiat: number;
  priceUsd: number;
  cachedAt: string;
}> {
  const res = await fetch(`${API_BASE}/prices/${symbol}?currency=${currency}`);
  if (!res.ok) throw new Error(`Failed to fetch price for ${symbol}`);
  const json = await res.json();
  return json.data ?? json;
}

export async function convertFiatToToken(
  symbol: string,
  amountFiat: number,
  currency = 'USD',
): Promise<{
  symbol: string;
  currency: string;
  priceFiat: number;
  priceUsd: number;
  amountFiat: number;
  tokenAmount: string;
}> {
  const res = await fetch(
    `${API_BASE}/prices/convert?symbol=${symbol}&amountFiat=${amountFiat}&currency=${currency}`,
  );
  if (!res.ok) throw new Error(`Failed to convert price for ${symbol}`);
  const json = await res.json();
  return json.data ?? json;
}

/** @deprecated Use convertFiatToToken */
export const convertUsdToToken = (symbol: string, amountUsd: number) =>
  convertFiatToToken(symbol, amountUsd, 'USD');

// ── Checkout / Authorization ──

export interface AuthorizePaymentInput {
  /** Primary: authorize via a checkout session (universal path) */
  checkoutSessionId?: string;
  /** Legacy: authorize directly from a payment link */
  paymentLinkId?: string;
  walletAddress: string;
  chainId: number;
  tokenKey: string;
  authorizationMethod: 'NATIVE' | 'PERMIT';
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  approvalTxHash?: string;
  cryptoAmount: string;
  exchangeRate: string;
  /** Customer email — required for all checkout sessions */
  customerEmail: string;
  /** Customer name */
  customerName?: string;
  /** Billing address fields */
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
}

export async function authorizePayment(input: AuthorizePaymentInput): Promise<{
  intentId: string;
  status: string;
  transactionId?: string;
  /** Returned for native tokens — frontend must send this tx from the user's wallet */
  captureData?:
    | {
        to: string;
        data: string;
        value: string;
        chainId: number;
      }
      | {
        chainType: 'SOLANA';
        chainId: number;
        /** Ed25519 program verify ix — must appear before `instruction` in the same tx */
        preInstructions?: Array<{
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        }>;
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }
    | {
        chainType: 'SUI';
        chainId: number;
        packageId: string;
        configObjectId: string;
        registryObjectId: string;
        coinType: string;
        paymentIntentIdHex: string;
        merchantAddress: string;
        amount: string;
        feeBps: number;
        timelocksHex: string;
        platformPublicKeyBase64: string;
        platformSignatureBase64: string;
        sponsored?: boolean;
        mtxmChainId?: string;
        transactionBlockBase64?: string;
        sponsorSignature?: string;
        dualSignRequired?: boolean;
      };
}> {
  const res = await fetch(`${API_BASE}/checkout/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Authorization failed (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Native Capture Reporting ──

/**
 * Report a native token capture transaction sent by the user.
 * Called after the user sends the tx from their wallet.
 */
export async function reportNativeCapture(intentId: string, txHash: string): Promise<{
  transactionId: string;
}> {
  const res = await fetch(`${API_BASE}/checkout/report-native-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intentId, txHash }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? `Failed to report native capture (${res.status})`);
  }
  const json = await res.json();
  return json.data ?? json;
}

// ── Intent Status Polling ──

export async function getCheckoutIntentStatus(intentId: string): Promise<{
  id: string;
  status: string;
  amount: string;
  currency: string;
  successUrl?: string;
  cancelUrl?: string;
}> {
  const res = await fetch(`${API_BASE}/checkout/intent/${intentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch intent status');
  const json = await res.json();
  return json.data ?? json;
}

// ── Dispute Portal ──

export async function getDisputeWindow(paymentIntentId: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/window/${paymentIntentId}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

export async function sendCustomerOtp(email: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to send OTP');
  return json.data ?? json;
}

export async function verifyCustomerOtp(email: string, code: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, code }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Invalid OTP');
  return json.data ?? json;
}

export async function getCustomerPayments() {
  const res = await fetch(`${API_BASE}/disputes/customer/payments`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load payments');
  return json.data ?? json;
}

export async function raiseDispute(
  paymentIntentId: string,
  reason: string,
  proofFile?: File,
) {
  const formData = new FormData();
  formData.append('paymentIntentId', paymentIntentId);
  formData.append('reason', reason);
  if (proofFile) formData.append('proof', proofFile);

  const res = await fetch(`${API_BASE}/disputes/customer/raise`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to raise dispute');
  return json.data ?? json;
}

export async function downloadReceipt(paymentIntentId: string) {
  const res = await fetch(`${API_BASE}/disputes/customer/receipt/${paymentIntentId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to download receipt');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${paymentIntentId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
