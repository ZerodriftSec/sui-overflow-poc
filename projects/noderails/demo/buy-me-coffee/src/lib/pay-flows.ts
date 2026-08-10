import type { PayRequestBody } from '@/lib/types';
import {
  checkoutUrl,
  formatAmount,
  getAppBase,
  getNodeRails,
  getSuiPaymentConstraints,
  paymentLinkUrl,
  uniqueSlug,
} from '@/lib/noderails';

function suiCheckoutOptions() {
  const { allowedChains, allowedTokens } = getSuiPaymentConstraints();
  return { allowedChains, allowedTokens };
}

function resolveUrls(body: PayRequestBody, orderId: string) {
  const base = getAppBase();
  const successBase = body.successUrl || `${base}/success`;
  const cancelBase = body.cancelUrl || `${base}/cancel`;
  const successSep = successBase.includes('?') ? '&' : '?';
  const cancelSep = cancelBase.includes('?') ? '&' : '?';

  return {
    successUrl: `${successBase}${successSep}order=${orderId}`,
    cancelUrl: `${cancelBase}${cancelSep}order=${orderId}`,
  };
}

function withOrderMetadata(body: PayRequestBody, orderId: string): PayRequestBody {
  return {
    ...body,
    metadata: {
      ...body.metadata,
      orderId,
    },
  };
}

export async function payWithCheckout(body: PayRequestBody, orderId: string) {
  const noderails = getNodeRails();
  const scoped = withOrderMetadata(body, orderId);
  const amount = formatAmount(scoped.amount);
  const { successUrl, cancelUrl } = resolveUrls(scoped, orderId);

  const session = await noderails.checkoutSessions.create({
    mode: 'PAYMENT',
    successUrl,
    cancelUrl,
    ...suiCheckoutOptions(),
    items: [
      {
        name: body.itemName,
        description: body.itemDescription,
        amount,
        currency: body.currency,
        quantity: 1,
      },
    ],
    metadata: scoped.metadata,
  });

  return {
    paymentUrl: checkoutUrl(session.id),
    debug: { orderId, sessionId: session.id, status: session.status, amount, mode: session.mode },
    checkoutSessionId: session.id,
  };
}

export async function payWithPaymentLink(body: PayRequestBody, orderId: string) {
  const noderails = getNodeRails();
  const scoped = withOrderMetadata(body, orderId);
  const amount = formatAmount(scoped.amount);
  const { successUrl, cancelUrl } = resolveUrls(scoped, orderId);
  const slug = scoped.slug.trim() || uniqueSlug('coffee');

  const link = await noderails.paymentLinks.create({
    name: scoped.itemName,
    description: scoped.itemDescription,
    slug,
    amount,
    currency: scoped.currency,
    successUrl,
    cancelUrl,
    ...suiCheckoutOptions(),
    metadata: scoped.metadata,
  });

  const url = link.paymentUrl ?? paymentLinkUrl(link.slug);

  return {
    paymentUrl: url,
    debug: { orderId, linkId: link.id, slug: link.slug, paymentUrl: url },
    paymentLinkSlug: link.slug,
  };
}

async function ensureMonthlyPlan(body: PayRequestBody) {
  const envPlanId = process.env.NODERAILS_MONTHLY_PLAN_ID;
  const envPriceId = process.env.NODERAILS_MONTHLY_PRICE_ID;

  if (envPlanId && envPriceId) {
    return { planId: envPlanId, priceId: envPriceId, reused: true };
  }

  const noderails = getNodeRails();
  const amount = formatAmount(body.amount);

  const plan = await noderails.productPlans.create({
    name: body.planName,
    description: body.itemDescription,
    planType: 'SUBSCRIPTION',
    prices: [
      {
        amount,
        currency: body.currency,
        billingInterval: body.billingInterval,
        billingIntervalCount: body.billingIntervalCount,
        nickname: 'Monthly support',
        isDefault: true,
      },
    ],
  });

  const priceId = plan.prices?.[0]?.id;
  if (!priceId) {
    throw new Error('Product plan was created but no price was returned');
  }

  return { planId: plan.id, priceId, reused: false };
}

export async function payWithSubscriptionLink(body: PayRequestBody, orderId: string) {
  const noderails = getNodeRails();
  const scoped = withOrderMetadata(body, orderId);
  const { successUrl, cancelUrl } = resolveUrls(scoped, orderId);
  const slug = scoped.slug.trim() || uniqueSlug('coffee-monthly');
  const { planId, priceId, reused } = await ensureMonthlyPlan(scoped);

  const link = await noderails.paymentLinks.create({
    name: scoped.planName,
    description: scoped.itemDescription,
    slug,
    productPlanId: planId,
    productPlanPriceId: priceId,
    successUrl,
    cancelUrl,
    ...suiCheckoutOptions(),
    metadata: { ...scoped.metadata, billing: 'recurring' },
  });

  const url = link.paymentUrl ?? paymentLinkUrl(link.slug);

  return {
    paymentUrl: url,
    debug: { orderId, linkId: link.id, slug: link.slug, planId, priceId, reusedPlan: reused },
    paymentLinkSlug: link.slug,
  };
}

export async function payWithSubscriptionCheckout(body: PayRequestBody, orderId: string) {
  const noderails = getNodeRails();
  const scoped = withOrderMetadata(body, orderId);
  const { planId, priceId, reused } = await ensureMonthlyPlan(scoped);

  const customer = await noderails.customers.create({
    email: scoped.customerEmail,
    name: scoped.customerName,
    metadata: scoped.metadata,
  });

  const subscription = await noderails.subscriptions.create({
    customerAccountId: customer.id,
    productPlanId: planId,
    productPlanPriceId: priceId,
    metadata: scoped.metadata,
  });

  const checkout = await noderails.subscriptions.createCheckout(subscription.id);
  const checkoutSessionId =
    (checkout as { checkoutSessionId?: string; id?: string }).checkoutSessionId ??
    (checkout as { id?: string }).id;

  if (!checkoutSessionId) {
    throw new Error('Subscription checkout did not return a checkout session id');
  }

  return {
    paymentUrl: checkoutUrl(checkoutSessionId),
    debug: {
      orderId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      checkoutSessionId,
      planId,
      priceId,
      reusedPlan: reused,
    },
    checkoutSessionId,
    subscriptionId: subscription.id,
  };
}

export async function runPayFlow(body: PayRequestBody, orderId: string) {
  switch (body.flow) {
    case 'checkout':
      return payWithCheckout(body, orderId);
    case 'payment-link':
      return payWithPaymentLink(body, orderId);
    case 'subscription-link':
      return payWithSubscriptionLink(body, orderId);
    case 'subscription-checkout':
      return payWithSubscriptionCheckout(body, orderId);
    default:
      throw new Error(`Unknown flow: ${String(body.flow)}`);
  }
}

export type PayFlowResult = Awaited<ReturnType<typeof runPayFlow>>;
