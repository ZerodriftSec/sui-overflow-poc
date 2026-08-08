#[test_only]
module streamline::lending_tests;

use streamline::collateral::{Self as col, LendingPool, LoanReceipt};
use streamline::stream::{Self, Stream, StreamCap};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const CLIENT: address = @0xC1;
const FREELANCER: address = @0xF1;
const LENDER: address = @0x1E;
const UNIT: u64 = 1_000_000;
const YEAR_MS: u64 = 31_536_000_000;

/// Drive a single-milestone stream to DRIPPING with the full amount still locked.
fun dripping_stream(sc: &mut ts::Scenario, clk: &sui::clock::Clock) {
    let total = 200 * UNIT;
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, FREELANCER, vector[string::utf8(b"only")], vector[total],
            10_000, 1_000, true, clk, ts::ctx(sc),
        );
    };
    ts::next_tx(sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(sc);
        stream::raise_completion<SUI>(&mut s, clk, ts::ctx(sc));
        ts::return_shared(s);
    };
    ts::next_tx(sc, CLIENT);
    {
        let cap = ts::take_from_sender<StreamCap>(sc);
        let mut s = ts::take_shared<Stream<SUI>>(sc);
        stream::approve_milestone<SUI>(&cap, &mut s, clk);
        ts::return_shared(s);
        ts::return_to_sender(sc, cap);
    };
}

#[test]
fun borrow_then_repay_with_interest() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    dripping_stream(&mut sc, &clk);

    // lender opens + seeds a 10%-APR pool with 500 liquidity
    ts::next_tx(&mut sc, LENDER);
    {
        col::create_pool<SUI>(1_000, ts::ctx(&mut sc));
    };
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let seed = coin::mint_for_testing<SUI>(500 * UNIT, ts::ctx(&mut sc));
        col::fund_pool<SUI>(&mut pool, seed);
        ts::return_shared(pool);
    };

    // freelancer borrows 150 (PV = 200*90% = 180, so 150 is allowed)
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let s = ts::take_shared<Stream<SUI>>(&sc);
        assert!(col::present_value<SUI>(&s) == 180 * UNIT, 0);
        let cash = col::borrow<SUI>(&mut pool, &s, 150 * UNIT, &clk, ts::ctx(&mut sc));
        assert!(coin::value(&cash) == 150 * UNIT, 1);
        assert!(col::pool_reserve<SUI>(&pool) == 350 * UNIT, 2);
        transfer::public_transfer(cash, FREELANCER);
        ts::return_shared(s);
        ts::return_shared(pool);
    };

    // a year later, repay principal + ~10% interest (15)
    clk.increment_for_testing(YEAR_MS);
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let loan = ts::take_from_sender<LoanReceipt<SUI>>(&sc);
        let due = col::owed<SUI>(&loan, clk.timestamp_ms());
        assert!(due >= 164 * UNIT && due <= 166 * UNIT, 3); // 150 + ~15

        let pay = coin::mint_for_testing<SUI>(200 * UNIT, ts::ctx(&mut sc));
        let change = col::repay<SUI>(&mut pool, loan, pay, &clk, ts::ctx(&mut sc));
        // reserve back above its seed by the interest earned
        assert!(col::pool_reserve<SUI>(&pool) >= 514 * UNIT, 4);
        assert!(coin::value(&change) == 200 * UNIT - due, 5);
        transfer::public_transfer(change, FREELANCER);
        ts::return_shared(pool);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::collateral::EOverLtv)]
fun borrow_above_pv_aborts() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    dripping_stream(&mut sc, &clk);
    ts::next_tx(&mut sc, LENDER);
    { col::create_pool<SUI>(1_000, ts::ctx(&mut sc)); };
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let seed = coin::mint_for_testing<SUI>(500 * UNIT, ts::ctx(&mut sc));
        col::fund_pool<SUI>(&mut pool, seed);
        ts::return_shared(pool);
    };
    // PV is 180; borrowing 181 must abort
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut pool = ts::take_shared<LendingPool<SUI>>(&sc);
        let s = ts::take_shared<Stream<SUI>>(&sc);
        let cash = col::borrow<SUI>(&mut pool, &s, 181 * UNIT, &clk, ts::ctx(&mut sc));
        transfer::public_transfer(cash, FREELANCER);
        ts::return_shared(s);
        ts::return_shared(pool);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}
