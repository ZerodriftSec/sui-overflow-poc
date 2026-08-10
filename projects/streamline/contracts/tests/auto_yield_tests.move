#[test_only]
module streamline::auto_yield_tests;

use streamline::stream::{Self, Stream, StreamCap};
use streamline::yield_vault::{Self as yv, YieldVault, VaultReceipt};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const CLIENT: address = @0xC1;
const FREELANCER: address = @0xF1;
const KEEPER: address = @0xCA11;
const UNIT: u64 = 1_000_000;

#[test]
fun drip_with_yield_auto_deposits() {
    let mut sc = ts::begin(CLIENT);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    // a 8%-APR vault seeded with a buffer
    yv::create_vault<SUI>(800, &clk, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, CLIENT);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        yv::fund<SUI>(&mut v, coin::mint_for_testing<SUI>(1_000 * UNIT, ts::ctx(&mut sc)));
        ts::return_shared(v);
    };

    // client creates a 100-unit, single-milestone stream with a 30% yield split
    ts::next_tx(&mut sc, CLIENT);
    {
        let pay = coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc));
        // v3 locked stream with the same 70/30 direct/yield split v2's
        // yield_bps=3000 produced, so the review flow (raise/approve) still runs.
        stream::create_stream_v3<SUI>(
            pay, FREELANCER, vector[string::utf8(b"only")], vector[100 * UNIT],
            1_000, 1_000, true,
            vector[FREELANCER, FREELANCER], vector[7_000, 3_000], vector[false, true],
            &clk, ts::ctx(&mut sc),
        );
    };
    // raise + approve → DRIPPING
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

    // drip the full milestone with auto-yield
    clk.increment_for_testing(1_000);
    ts::next_tx(&mut sc, KEEPER);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        stream::drip_with_yield<SUI>(&mut s, &mut v, &clk, ts::ctx(&mut sc));
        ts::return_shared(s);
        ts::return_shared(v);
    };

    // the freelancer got a VaultReceipt (the 30% yield leg) worth ~30 units
    ts::next_tx(&mut sc, FREELANCER);
    {
        let v = ts::take_shared<YieldVault<SUI>>(&sc);
        let receipt = ts::take_from_sender<VaultReceipt<SUI>>(&sc);
        let val = yv::receipt_value<SUI>(&v, &receipt, clk.timestamp_ms());
        // ~30% of ~100 (minus the 1bps keeper tip)
        assert!(val >= 29 * UNIT && val <= 30 * UNIT, 0);
        ts::return_to_sender(&sc, receipt);
        ts::return_shared(v);

        // and ~70% arrived as cash
        let cash = ts::take_from_address<coin::Coin<SUI>>(&sc, FREELANCER);
        assert!(coin::value(&cash) >= 69 * UNIT && coin::value(&cash) <= 70 * UNIT, 1);
        ts::return_to_address(FREELANCER, cash);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
