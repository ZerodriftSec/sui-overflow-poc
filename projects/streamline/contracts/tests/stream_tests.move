#[test_only]
module streamline::stream_tests;

use streamline::stream::{Self, Stream, StreamCap};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const CLIENT: address = @0xC1;
const FREELANCER: address = @0xF1;
const KEEPER: address = @0xCA11;
const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

// 0.01 USDC floor in base units.
const MIN_DRIP: u64 = 10_000;

fun names(): vector<string::String> {
    vector[string::utf8(b"Wireframes"), string::utf8(b"Final")]
}

#[test]
fun full_milestone_flow() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    // total 200 over 2 milestones of 100 each, 1000ms duration.
    let total = 200 * MIN_DRIP;
    let amounts = vector[100 * MIN_DRIP, 100 * MIN_DRIP];

    // create_stream (client locks funds, gets cap)
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(&mut sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, FREELANCER, names(), amounts, 1_000, 1_000, true, &clk, ts::ctx(&mut sc),
        );
    };

    // freelancer raises milestone 0
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::raise_completion<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        assert!(stream::state(&s) == 1, 0); // PENDING_REVIEW
        ts::return_shared(s);
    };

    // client approves → DRIPPING
    ts::next_tx(&mut sc, CLIENT);
    {
        let cap = ts::take_from_sender<StreamCap>(&sc);
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::approve_milestone<SUI>(&cap, &mut s, &clk);
        assert!(stream::state(&s) == 2, 1); // DRIPPING
        ts::return_shared(s);
        ts::return_to_sender(&sc, cap);
    };

    // advance the clock past the full first milestone and drip
    clk.increment_for_testing(1_000);
    ts::next_tx(&mut sc, KEEPER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::drip<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        // milestone 0 exhausted → relocks for milestone 1
        assert!(stream::state(&s) == 0, 2); // LOCKED
        assert!(stream::current_milestone(&s) == 1, 3);
        // ~half the total paid out (milestone 0 = 100 units)
        assert!(stream::remaining(&s) <= 100 * MIN_DRIP, 4);
        ts::return_shared(s);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

/// start_payroll: the cap holder starts a LOCKED stream directly (no freelancer
/// raise_completion), moving it to DRIPPING so a keeper can settle it.
#[test]
fun start_payroll_from_locked() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let total = 200 * MIN_DRIP;
    let amounts = vector[100 * MIN_DRIP, 100 * MIN_DRIP];
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(&mut sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, FREELANCER, names(), amounts, 1_000, 1_000, true, &clk, ts::ctx(&mut sc),
        );
    };
    // Cap holder starts it straight from LOCKED — no raise_completion.
    ts::next_tx(&mut sc, CLIENT);
    {
        let cap = ts::take_from_sender<StreamCap>(&sc);
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        assert!(stream::state(&s) == 0, 0); // LOCKED
        stream::start_payroll<SUI>(&cap, &mut s, &clk);
        assert!(stream::state(&s) == 2, 1); // DRIPPING
        ts::return_shared(s);
        ts::return_to_sender(&sc, cap);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

/// create_stream_v3: an explicit multi-destination split routes each drip to the
/// right address by weight. Two cash legs (60/40) to distinct wallets.
#[test]
fun v3_splits_route_to_addresses() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    let total = 100 * MIN_DRIP; // one milestone

    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(&mut sc));
        stream::create_stream_v3<SUI>(
            pay,
            FREELANCER,
            vector[string::utf8(b"M1")],
            vector[total],
            1_000,
            1_000,
            true,
            vector[ALICE, BOB],
            vector[6_000, 4_000],
            vector[false, false],
            &clk,
            ts::ctx(&mut sc),
        );
    };

    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::raise_completion<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        ts::return_shared(s);
    };
    ts::next_tx(&mut sc, CLIENT);
    {
        let cap = ts::take_from_sender<StreamCap>(&sc);
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::approve_milestone<SUI>(&cap, &mut s, &clk);
        ts::return_shared(s);
        ts::return_to_sender(&sc, cap);
    };

    clk.increment_for_testing(1_000);
    ts::next_tx(&mut sc, KEEPER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::drip<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        ts::return_shared(s);
    };

    // pay = 1_000_000; tip = 100; distributable = 999_900.
    // ALICE 60% = 599_940; BOB = remainder 399_960.
    ts::next_tx(&mut sc, CLIENT);
    {
        let a = ts::take_from_address<coin::Coin<SUI>>(&sc, ALICE);
        let b = ts::take_from_address<coin::Coin<SUI>>(&sc, BOB);
        assert!(coin::value(&a) == 599_940, 10);
        assert!(coin::value(&b) == 399_960, 11);
        ts::return_to_address(ALICE, a);
        ts::return_to_address(BOB, b);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

/// Drive a stream to DRIPPING, then raise a dispute → PAUSED. Returns the scenario.
fun paused_stream(sc: &mut ts::Scenario, clk: &sui::clock::Clock) {
    let total = 200 * MIN_DRIP;
    let amounts = vector[100 * MIN_DRIP, 100 * MIN_DRIP];
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, FREELANCER, names(), amounts, 1_000, 1_000, true, clk, ts::ctx(sc),
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
    ts::next_tx(sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(sc);
        stream::raise_dispute<SUI>(&mut s, ts::ctx(sc));
        assert!(stream::state(&s) == 3, 0); // PAUSED
        ts::return_shared(s);
    };
}

#[test]
fun dispute_resolve_resume() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    paused_stream(&mut sc, &clk);

    // client proposes resume
    ts::next_tx(&mut sc, CLIENT);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::propose_resolution<SUI>(&mut s, true, 0, ts::ctx(&mut sc));
        assert!(stream::has_proposal(&s), 0);
        ts::return_shared(s);
    };
    // freelancer accepts → DRIPPING
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::accept_resolution<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        assert!(stream::state(&s) == 2, 1); // DRIPPING
        assert!(!stream::has_proposal(&s), 2);
        ts::return_shared(s);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
fun dispute_resolve_split() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    paused_stream(&mut sc, &clk);

    // freelancer proposes a 50/50 split of the remaining balance
    ts::next_tx(&mut sc, FREELANCER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::propose_resolution<SUI>(&mut s, false, 5_000, ts::ctx(&mut sc));
        ts::return_shared(s);
    };
    // client accepts → DONE, balance split
    ts::next_tx(&mut sc, CLIENT);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::accept_resolution<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        assert!(stream::state(&s) == 4, 0); // DONE
        assert!(stream::remaining(&s) == 0, 1);
        ts::return_shared(s);
    };
    // both parties received half of the 200*MIN_DRIP locked
    ts::next_tx(&mut sc, FREELANCER);
    {
        let c = ts::take_from_address<coin::Coin<SUI>>(&sc, FREELANCER);
        assert!(coin::value(&c) == 100 * MIN_DRIP, 2);
        ts::return_to_address(FREELANCER, c);
        let c2 = ts::take_from_address<coin::Coin<SUI>>(&sc, CLIENT);
        assert!(coin::value(&c2) == 100 * MIN_DRIP, 3);
        ts::return_to_address(CLIENT, c2);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::stream::ENotAuthorized)]
fun cannot_accept_own_proposal() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    paused_stream(&mut sc, &clk);

    ts::next_tx(&mut sc, CLIENT);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::propose_resolution<SUI>(&mut s, true, 0, ts::ctx(&mut sc));
        ts::return_shared(s);
    };
    // same party tries to accept its own proposal → abort
    ts::next_tx(&mut sc, CLIENT);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::accept_resolution<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        ts::return_shared(s);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::stream::EWrongState)]
fun cannot_drip_while_locked() {
    let mut sc = ts::begin(CLIENT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let total = 200 * MIN_DRIP;
    let amounts = vector[100 * MIN_DRIP, 100 * MIN_DRIP];
    {
        let pay = coin::mint_for_testing<SUI>(total, ts::ctx(&mut sc));
        stream::create_locked_stream_for_testing<SUI>(
            pay, FREELANCER, names(), amounts, 1_000, 1_000, true, &clk, ts::ctx(&mut sc),
        );
    };
    // dripping a LOCKED stream must abort
    ts::next_tx(&mut sc, KEEPER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        stream::drip<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        ts::return_shared(s);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}
