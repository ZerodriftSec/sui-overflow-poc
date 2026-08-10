export type PayFlow =
  | 'checkout'
  | 'payment-link'
  | 'subscription-link'
  | 'subscription-checkout';

export interface PayRequestBody {
  flow: PayFlow;
  amount: string;
  currency: string;
  itemName: string;
  itemDescription: string;
  slug: string;
  customerEmail: string;
  customerName: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  planName: string;
  billingInterval: 'MONTH' | 'YEAR';
  billingIntervalCount: number;
}

export interface PaySuccessResponse {
  paymentUrl: string;
  flow: PayFlow;
  debug: Record<string, unknown>;
}

export interface PayErrorResponse {
  error: string;
  details?: string;
}

export const COFFEE_AMOUNTS = ['3', '5', '10', '15'] as const;

export const DEFAULT_PAY_BODY: PayRequestBody = {
  flow: 'checkout',
  amount: '5.00',
  currency: 'USD',
  itemName: 'Buy me a coffee',
  itemDescription: 'Thanks for supporting my work!',
  slug: '',
  customerEmail: 'supporter@example.com',
  customerName: 'Coffee Supporter',
  metadata: { source: 'buy-me-coffee-demo', chain: 'sui' },
  successUrl: '',
  cancelUrl: '',
  planName: 'Monthly Coffee Club',
  billingInterval: 'MONTH',
  billingIntervalCount: 1,
};

export const FLOW_LABELS: Record<PayFlow, { title: string; description: string }> = {
  checkout: {
    title: 'One-time · Checkout session',
    description: 'Creates a hosted checkout session via checkoutSessions.create(), then redirects to pay.',
  },
  'payment-link': {
    title: 'One-time · Payment link',
    description: 'Creates a shareable payment link via paymentLinks.create(). Good for fixed-amount tips.',
  },
  'subscription-link': {
    title: 'Monthly · Payment link + plan',
    description:
      'Creates a subscription product plan (or reuses env plan), then a payment link tied to the monthly price.',
  },
  'subscription-checkout': {
    title: 'Monthly · Subscription API',
    description:
      'Full SDK flow: customers.create → subscriptions.create → subscriptions.createCheckout().',
  },
};
