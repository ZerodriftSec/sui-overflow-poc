import { getDatabaseClient } from '@noderails/database';

/**
 * Merchant-facing stats: aggregate volumes, per-chain breakdown, per-crypto breakdown,
 * disputes, and MRR/ARR from active subscriptions.
 */
export async function getMerchantStats(merchantId: string, appId?: string) {
  const db = getDatabaseClient();

  // Resolve app IDs scoped to this merchant
  const appFilter: Record<string, unknown> = { merchantId };
  if (appId) appFilter.id = appId;
  const apps = await db.app.findMany({ where: appFilter, select: { id: true } });
  const appIds = apps.map((a) => a.id);

  if (appIds.length === 0) {
    return emptyStats();
  }

  const piWhere = { appId: { in: appIds } };
  const subWhere = { appId: { in: appIds } };

  const [
    totalPayments,
    capturedCount,
    settledCount,
    refundedCount,
    totalSubscriptions,
    activeSubscriptions,
    totalInvoices,
    paidInvoices,
    capturedVolume,
    settledVolume,
    chainBreakdown,
    cryptoBreakdown,
    activeDisputes,
    totalDisputes,
    activeSubsWithPrices,
  ] = await Promise.all([
    db.paymentIntent.count({ where: piWhere }),
    db.paymentIntent.count({ where: { ...piWhere, status: 'CAPTURED' } }),
    db.paymentIntent.count({ where: { ...piWhere, status: 'SETTLED' } }),
    db.paymentIntent.count({ where: { ...piWhere, status: 'REFUNDED' } }),
    db.subscription.count({ where: subWhere }),
    db.subscription.count({ where: { ...subWhere, status: 'ACTIVE' } }),
    db.invoice.count({ where: { appId: { in: appIds } } }),
    db.invoice.count({ where: { appId: { in: appIds }, status: 'PAID' } }),
    db.paymentIntent.aggregate({
      where: { ...piWhere, status: { in: ['CAPTURED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
    db.paymentIntent.aggregate({
      where: { ...piWhere, status: 'SETTLED' },
      _sum: { amount: true },
    }),
    // Per-chain breakdown
    db.paymentIntent.groupBy({
      by: ['authorizationChainId'],
      where: { ...piWhere, authorizationChainId: { not: null }, status: { in: ['CAPTURED', 'SETTLED'] } },
      _count: true,
      _sum: { amount: true },
    }),
    // Per-crypto breakdown
    db.paymentIntent.groupBy({
      by: ['cryptoTokenKey'],
      where: { ...piWhere, cryptoTokenKey: { not: null }, status: { in: ['CAPTURED', 'SETTLED'] } },
      _count: true,
      _sum: { amount: true },
    }),
    // Disputes
    db.dispute.count({
      where: { paymentIntent: { appId: { in: appIds } }, status: 'OPEN' },
    }),
    db.dispute.count({
      where: { paymentIntent: { appId: { in: appIds } } },
    }),
    // Active subscriptions with their price info for MRR calculation
    db.subscription.findMany({
      where: { ...subWhere, status: 'ACTIVE' },
      select: {
        productPlanPrice: {
          select: {
            amount: true,
            billingInterval: true,
            billingIntervalCount: true,
          },
        },
      },
    }),
  ]);

  // ── MRR Calculation ──
  // Normalize each active subscription's price to a monthly amount
  const mrr = activeSubsWithPrices.reduce((sum, sub) => {
    const price = sub.productPlanPrice;
    if (!price.billingInterval || !price.amount) return sum;
    const amount = Number(price.amount);
    const intervalCount = price.billingIntervalCount || 1;
    return sum + normalizeToMonthly(amount, price.billingInterval, intervalCount);
  }, 0);

  const arr = mrr * 12;

  // Resolve chain names for breakdown
  const chainIds = chainBreakdown
    .map((c) => c.authorizationChainId)
    .filter((id): id is number => id != null);

  let chainLookup = new Map<number, string>();
  if (chainIds.length > 0) {
    const chains = await db.supportedChain.findMany({
      where: { chainId: { in: chainIds } },
      select: { chainId: true, displayName: true, name: true },
    });
    chainLookup = new Map(chains.map((c) => [c.chainId, c.displayName || c.name]));
  }

  return {
    totalPayments,
    capturedPayments: capturedCount,
    settledPayments: settledCount,
    refundedPayments: refundedCount,
    totalSubscriptions,
    activeSubscriptions,
    totalInvoices,
    paidInvoices,
    capturedVolume: capturedVolume._sum.amount?.toString() ?? '0',
    settledVolume: settledVolume._sum.amount?.toString() ?? '0',
    activeDisputes,
    totalDisputes,
    mrr: mrr.toFixed(2),
    arr: arr.toFixed(2),
    perChain: chainBreakdown.map((c) => ({
      chainId: c.authorizationChainId,
      chainName: chainLookup.get(c.authorizationChainId!) ?? `Chain ${c.authorizationChainId}`,
      count: c._count,
      volume: c._sum.amount?.toString() ?? '0',
    })),
    perCrypto: cryptoBreakdown.map((c) => ({
      tokenKey: c.cryptoTokenKey,
      count: c._count,
      volume: c._sum.amount?.toString() ?? '0',
    })),
  };
}

/**
 * Normalize a subscription price to a monthly equivalent.
 * E.g. $120/year → $10/month, $10/week → ~$43.33/month
 */
function normalizeToMonthly(amount: number, interval: string, intervalCount: number): number {
  const perInterval = amount / intervalCount;
  switch (interval) {
    case 'MINUTE': return perInterval * 60 * 24 * 30;  // ~30 days
    case 'DAY':    return perInterval * 30;
    case 'WEEK':   return perInterval * 4.333;          // 52 weeks / 12 months
    case 'MONTH':  return perInterval;
    case 'YEAR':   return perInterval / 12;
    default:       return perInterval;
  }
}

function emptyStats() {
  return {
    totalPayments: 0,
    capturedPayments: 0,
    settledPayments: 0,
    refundedPayments: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    capturedVolume: '0',
    settledVolume: '0',
    activeDisputes: 0,
    totalDisputes: 0,
    mrr: '0.00',
    arr: '0.00',
    perChain: [] as { chainId: number | null; chainName: string; count: number; volume: string }[],
    perCrypto: [] as { tokenKey: string | null; count: number; volume: string }[],
  };
}
