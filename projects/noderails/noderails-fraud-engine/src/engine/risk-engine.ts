import type { BalanceItem, TransactionSummaryItem, TxItem } from '../goldrush/types.js';

/** Rolling window (hours) for short-term transaction velocity signals */
const VELOCITY_WINDOW_HOURS = 24;
/** Warn when ≥ this many txs in the velocity window appear in the merged recent sample */
const VELOCITY_WARN_TX_COUNT = 35;
/** Warn when distinct counterparties (from/to excluding self) exceed this ratio × sample size */
const COUNTERPARTY_FANOUT_RATIO = 0.72;
/** Minimum sample size before fan-out heuristic applies */
const COUNTERPARTY_MIN_SAMPLE = 8;
/** Quote-notional threshold (USD by default) for a single recent tx to count as “large” */
const LARGE_RECENT_QUOTE_USD = 25_000;
/** Points added when any recent tx exceeds LARGE_RECENT_QUOTE_USD */
const LARGE_RECENT_POINTS = 14;

export type RiskTier = 'low' | 'medium' | 'high';

export interface RiskFinding {
  code: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  metric?: number | string;
}

export interface RiskAssessmentInput {
  walletAddress: string;
  chainName: string;
  balances: BalanceItem[];
  recentTransactions: TxItem[];
  summary: TransactionSummaryItem | undefined;
  dataFetchedAt?: string;
}

export interface RiskAssessment {
  walletAddress: string;
  chainName: string;
  score: number;
  tier: RiskTier;
  findings: RiskFinding[];
  metrics: Record<string, number | string | null>;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursSince(ts: Date, ref: Date): number {
  return Math.abs(ref.getTime() - ts.getTime()) / (1000 * 60 * 60);
}

/**
 * Rule-based risk scoring from GoldRush balances + tx summary + recent txs.
 * Scores are heuristic (not legal/financial advice); tune weights for your deployment.
 */
export function assessWalletRisk(input: RiskAssessmentInput): RiskAssessment {
  const findings: RiskFinding[] = [];
  let score = 0;

  const items = input.balances ?? [];
  const denom = Math.max(1, items.length);
  const spamCount = items.filter((i) => i.is_spam === true).length;
  const spamRatio = spamCount / denom;
  const spamPoints = spamRatio * 35;
  score += spamPoints;
  if (spamRatio > 0.4) {
    findings.push({
      code: 'SPAM_TOKEN_LOAD',
      severity: spamRatio > 0.65 ? 'critical' : 'warn',
      message: 'Large share of token positions flagged as suspected spam by GoldRush.',
      metric: Math.round(spamRatio * 100),
    });
  }

  const dustCount = items.filter((i) => i.type === 'dust').length;
  const dustRatio = dustCount / denom;
  score += dustRatio * 18;
  if (dustRatio > 0.5) {
    findings.push({
      code: 'DUST_HEAVY',
      severity: 'warn',
      message: 'Portfolio dominated by dust-tier positions (low economic weight).',
      metric: Math.round(dustRatio * 100),
    });
  }

  const summary = input.summary;
  const totalTx = summary?.total_count ?? null;
  if (totalTx !== null && totalTx < 8) {
    score += 12;
    findings.push({
      code: 'LOW_TX_COUNT',
      severity: 'info',
      message: 'Few lifetime transactions, limited behavioral history for scoring.',
      metric: totalTx,
    });
  }

  const earliestStr = summary?.earliest_transaction?.block_signed_at;
  const earliest = parseIsoDate(earliestStr ?? undefined);
  if (earliest) {
    const ageDays = Math.abs(Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 14) {
      score += 18;
      findings.push({
        code: 'RECENT_ORIGIN',
        severity: 'warn',
        message: 'Wallet first activity within approximately the last 14 days.',
        metric: Math.round(ageDays),
      });
    }
  }

  const txs = input.recentTransactions ?? [];
  const sample = txs.length;
  const refNow = new Date();
  let velocityWindowCount = 0;
  let distinctCounterpartyCount = 0;

  if (sample > 0) {
    const failed = txs.filter((t) => t.successful === false).length;
    const failRatio = failed / sample;
    score += failRatio * 28;
    if (failRatio > 0.35) {
      findings.push({
        code: 'HIGH_FAILED_TX_RATIO',
        severity: failRatio > 0.55 ? 'critical' : 'warn',
        message: 'Elevated ratio of failed transactions in recent activity sample.',
        metric: Math.round(failRatio * 100),
      });
    }

    let largeQuoteHits = 0;
    const counterpartySet = new Set<string>();
    const wallet = input.walletAddress.trim();

    for (const t of txs) {
      const bt = parseIsoDate(t.block_signed_at ?? undefined);
      if (bt && hoursSince(bt, refNow) <= VELOCITY_WINDOW_HOURS) {
        velocityWindowCount += 1;
      }
      const vq = t.value_quote;
      if (typeof vq === 'number' && Number.isFinite(vq) && vq >= LARGE_RECENT_QUOTE_USD) {
        largeQuoteHits += 1;
      }
      const from = typeof t.from_address === 'string' ? t.from_address.trim() : '';
      const to = typeof t.to_address === 'string' ? t.to_address.trim() : '';
      if (from && from !== wallet) counterpartySet.add(`f:${from}`);
      if (to && to !== wallet) counterpartySet.add(`t:${to}`);
    }

    if (velocityWindowCount >= VELOCITY_WARN_TX_COUNT) {
      score += 16;
      findings.push({
        code: 'HIGH_VELOCITY_WINDOW',
        severity: velocityWindowCount >= VELOCITY_WARN_TX_COUNT + 25 ? 'critical' : 'warn',
        message: `High transaction count within approximately the last ${VELOCITY_WINDOW_HOURS}h in sampled activity.`,
        metric: velocityWindowCount,
      });
    }

    if (largeQuoteHits > 0) {
      score += LARGE_RECENT_POINTS;
      findings.push({
        code: 'LARGE_RECENT_NOTIONAL',
        severity: largeQuoteHits > 2 ? 'warn' : 'info',
        message:
          'One or more recent transactions carry elevated quoted notional per GoldRush (indicator only).',
        metric: largeQuoteHits,
      });
    }

    const distinctCp = counterpartySet.size;
    const fanRatio = sample >= COUNTERPARTY_MIN_SAMPLE ? distinctCp / sample : 0;
    if (sample >= COUNTERPARTY_MIN_SAMPLE && fanRatio >= COUNTERPARTY_FANOUT_RATIO) {
      score += 14;
      findings.push({
        code: 'COUNTERPARTY_FANOUT',
        severity: fanRatio > 0.85 ? 'warn' : 'info',
        message:
          'Many distinct counterparties in the recent sample vs tx count — sometimes consistent with farming/airdrops.',
        metric: Math.round(fanRatio * 100),
      });
    }

    distinctCounterpartyCount = counterpartySet.size;
  }

  score = clamp(Math.round(score), 0, 100);

  let tier: RiskTier = 'low';
  if (score >= 65) tier = 'high';
  else if (score >= 38) tier = 'medium';

  const metrics: Record<string, number | string | null> = {
    spam_ratio_pct: Math.round(spamRatio * 1000) / 10,
    dust_ratio_pct: Math.round(dustRatio * 1000) / 10,
    balance_positions: items.length,
    recent_tx_sample_size: sample,
    velocity_window_tx_count: sample > 0 ? velocityWindowCount : null,
    distinct_counterparty_count: sample > 0 ? distinctCounterpartyCount : null,
    lifetime_tx_count: totalTx,
    data_fetched_at: input.dataFetchedAt ?? null,
  };

  return {
    walletAddress: input.walletAddress,
    chainName: input.chainName,
    score,
    tier,
    findings,
    metrics,
  };
}
