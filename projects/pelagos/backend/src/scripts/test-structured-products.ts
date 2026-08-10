import {
  authoritativeSettlementUsd,
  composeTerminalBands,
  plpStress,
  resolveAutocall,
  terminalBandStats,
  type AutocallTerms,
} from '../services/structured-payoffs';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function near(actual: number, expected: number, epsilon = 1e-9): boolean {
  return Math.abs(actual - expected) <= epsilon;
}

function autocallTerms(): AutocallTerms {
  return {
    principal_usd: 100,
    initial_reference_usd: 100,
    knock_in_barrier_usd: 70,
    observations: [
      { oracle_id: '0x1', observation_ms: 1000, call_barrier_usd: 100, coupon_usd: 1 },
      { oracle_id: '0x2', observation_ms: 2000, call_barrier_usd: 97.5, coupon_usd: 2 },
      { oracle_id: '0x3', observation_ms: 3000, call_barrier_usd: 95, coupon_usd: 3 },
    ],
  };
}

function run(): void {
  console.log('\nStructured product math');

  const bands = composeTerminalBands({
    base_usd: 10,
    payoffs: [
      { sign: -1, bands: [{ lower_usd: 90, higher_usd: 110, payout_usd: 4 }] },
      { sign: 1, bands: [{ lower_usd: 0, higher_usd: 80, payout_usd: 3 }] },
    ],
  });
  check('terminal schedule starts at zero', bands[0]?.lower_usd === 0);
  check('terminal schedule is exhaustive to $1bn', bands[bands.length - 1]?.higher_usd === 1_000_000_000);
  check('terminal schedule has no gaps', bands.every((band, index) => index === 0 || band.lower_usd === bands[index - 1].higher_usd));
  check('short liability lowers payout in-band', bands.some((band) => band.lower_usd === 90 && band.payout_usd === 6));
  check('long hedge raises payout in-band', bands.some((band) => band.lower_usd === 0 && band.payout_usd === 13));
  const bandStats = terminalBandStats(bands);
  check('terminal min is exact', bandStats.minimum_usd === 6);
  check('terminal max is exact', bandStats.maximum_usd === 13);

  const stress = plpStress(
    {
      balance_usd: 120,
      nav_usd: 100,
      marked_liability_usd: 20,
      max_payout_usd: 60,
      total_shares: 100,
      share_price: 1,
    },
    25,
  );
  check('PLP mark equals deposit', near(stress.mark_value_usd, 25));
  check('PLP post-deposit ownership is D/(NAV+D)', near(stress.post_deposit_pool_share, 0.2));
  check('PLP no-liability value uses balance, not NAV', near(stress.all_current_liabilities_expire_usd, 29));
  check('PLP current max-payout bound is pro-rata', near(stress.current_book_max_payout_bound_usd, 17));
  check('PLP utilization uses post-deposit balance', near(stress.post_deposit_utilization, 60 / 145));
  let inconsistentRejected = false;
  try {
    plpStress({ balance_usd: 100, nav_usd: 95, marked_liability_usd: 10, max_payout_usd: 20, total_shares: 90, share_price: 1 }, 10);
  } catch {
    inconsistentRejected = true;
  }
  check('PLP stress rejects inconsistent NAV snapshots', inconsistentRejected);
  let inconsistentSharePriceRejected = false;
  try {
    plpStress({ balance_usd: 100, nav_usd: 90, marked_liability_usd: 10, max_payout_usd: 20, total_shares: 90, share_price: 1.1 }, 10);
  } catch {
    inconsistentSharePriceRejected = true;
  }
  check('PLP stress rejects inconsistent share prices', inconsistentSharePriceRejected);
  let negativeSnapshotRejected = false;
  try {
    plpStress({ balance_usd: -1, nav_usd: 0, marked_liability_usd: 0, max_payout_usd: 0, total_shares: 0, share_price: 1 }, 10);
  } catch {
    negativeSnapshotRejected = true;
  }
  check('PLP stress rejects negative accounting inputs', negativeSnapshotRejected);

  check(
    'unsettled oracle has no terminal-price fallback',
    authoritativeSettlementUsd([{ oracle_id: '0x1' }], '0x1') === null,
  );
  check(
    'authoritative oracle settlement converts from 1e9 precision',
    authoritativeSettlementUsd([{ oracle_id: '0x1', settlement_price: '65000000000000' }], '0x1') === 65_000,
  );

  const pending = resolveAutocall(autocallTerms(), 500);
  check('autocall waits for the first observation', pending.status === 'pending' && pending.next_observation_ms === 1000);

  const awaitingTerms = autocallTerms();
  const awaiting = resolveAutocall(awaitingTerms, 1000);
  check('autocall waits for authoritative settlement', awaiting.status === 'awaiting_settlement');

  const calledTerms = autocallTerms();
  calledTerms.observations[0].settlement_usd = 99;
  calledTerms.observations[1].settlement_usd = 98;
  const called = resolveAutocall(calledTerms, 2500);
  check('autocall chooses the first hit', called.status === 'called' && called.observation_index === 1);
  check('autocall pays principal plus cumulative coupon', called.status === 'called' && called.payout_usd === 102);

  const protectedTerms = autocallTerms();
  protectedTerms.observations[0].settlement_usd = 90;
  protectedTerms.observations[1].settlement_usd = 90;
  protectedTerms.observations[2].settlement_usd = 80;
  const protectedFinal = resolveAutocall(protectedTerms, 3500);
  check('final above knock-in returns principal', protectedFinal.status === 'matured' && !protectedFinal.knocked_in && protectedFinal.payout_usd === 100);

  const knockedTerms = autocallTerms();
  knockedTerms.observations[0].settlement_usd = 90;
  knockedTerms.observations[1].settlement_usd = 90;
  knockedTerms.observations[2].settlement_usd = 55;
  const knocked = resolveAutocall(knockedTerms, 3500);
  check('final knock-in transmits BTC downside one-for-one', knocked.status === 'matured' && knocked.knocked_in && near(knocked.payout_usd, 55));

  let seed = 0x5f3759df;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  let compositionPropertiesHold = true;
  for (let sample = 0; sample < 500 && compositionPropertiesHold; sample++) {
    const base = random() * 250;
    const payoffs = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
      const lower = Math.floor(random() * 900_000);
      const higher = lower + 1 + Math.floor(random() * (1_000_000 - lower));
      return {
        sign: (random() > 0.5 ? 1 : -1) as 1 | -1,
        bands: [{ lower_usd: lower, higher_usd: higher, payout_usd: random() * 100 }],
      };
    });
    const composed = composeTerminalBands({ base_usd: base, payoffs });
    compositionPropertiesHold =
      composed[0]?.lower_usd === 0 &&
      composed.at(-1)?.higher_usd === 1_000_000_000 &&
      composed.every((band, index) =>
        Number.isFinite(band.payout_usd) &&
        band.payout_usd >= 0 &&
        band.lower_usd < band.higher_usd &&
        (index === 0 || band.lower_usd === composed[index - 1].higher_usd),
      );
    for (const band of composed) {
      const probe = band.lower_usd + (band.higher_usd - band.lower_usd) / 2;
      const direct = Math.max(0, base + payoffs.reduce((sum, source) =>
        sum + source.bands.reduce((inner, payoff) =>
          inner + (probe > payoff.lower_usd && probe <= payoff.higher_usd ? source.sign * payoff.payout_usd : 0), 0), 0));
      if (!near(band.payout_usd, Math.round(direct * 1e6) / 1e6, 1e-6)) compositionPropertiesHold = false;
    }
  }
  check('500 randomized terminal schedules stay exhaustive and exact', compositionPropertiesHold);

  let plpPropertiesHold = true;
  for (let sample = 0; sample < 500 && plpPropertiesHold; sample++) {
    const balance = 10 + random() * 10_000;
    const marked = random() * balance * 0.8;
    const nav = balance - marked;
    const maxPayout = random() * balance;
    const deposit = 0.01 + random() * 250;
    const sharePrice = 0.1 + random() * 3;
    const randomizedStress = plpStress({
      balance_usd: balance,
      nav_usd: nav,
      marked_liability_usd: marked,
      max_payout_usd: maxPayout,
      total_shares: nav / sharePrice,
      share_price: sharePrice,
    }, deposit);
    const ownership = deposit / (nav + deposit);
    plpPropertiesHold =
      near(randomizedStress.mark_value_usd, deposit) &&
      near(randomizedStress.expected_shares, deposit / sharePrice) &&
      near(randomizedStress.post_deposit_pool_share, ownership) &&
      near(randomizedStress.all_current_liabilities_expire_usd, ownership * (balance + deposit)) &&
      near(randomizedStress.current_book_max_payout_bound_usd, ownership * Math.max(0, balance + deposit - maxPayout));
  }
  check('500 randomized PLP balance sheets preserve pro-rata identities', plpPropertiesHold);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
