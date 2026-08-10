#[test_only]
module streamline::yield_vault_tests;

use streamline::yield_vault::{Self as yv, YieldVault, VaultReceipt};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const LP: address = @0x11;
const YEAR_MS: u64 = 31_536_000_000;
const UNIT: u64 = 1_000_000; // 1 "USDC"

#[test]
fun deposit_accrues_and_redeems() {
    let mut sc = ts::begin(LP);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    // 10% APR vault, seeded with a 1000-unit interest buffer.
    yv::create_vault<SUI>(1_000, &clk, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, LP);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let buffer = coin::mint_for_testing<SUI>(1_000 * UNIT, ts::ctx(&mut sc));
        yv::fund<SUI>(&mut v, buffer);

        // deposit 100 units → ~100 shares (index starts at 1.0)
        let dep = coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc));
        let receipt = yv::deposit<SUI>(&mut v, dep, &clk, ts::ctx(&mut sc));
        assert!(yv::receipt_value<SUI>(&v, &receipt, clk.timestamp_ms()) == 100 * UNIT, 0);
        transfer::public_transfer(receipt, LP);
        ts::return_shared(v);
    };

    // advance one year; value should be ~110 units (10% of 100)
    clk.increment_for_testing(YEAR_MS);
    ts::next_tx(&mut sc, LP);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let receipt = ts::take_from_sender<VaultReceipt<SUI>>(&sc);
        let preview = yv::receipt_value<SUI>(&v, &receipt, clk.timestamp_ms());
        assert!(preview >= 109 * UNIT && preview <= 111 * UNIT, 1);

        let out = yv::redeem<SUI>(&mut v, receipt, &clk, ts::ctx(&mut sc));
        let got = coin::value(&out);
        assert!(got >= 109 * UNIT && got <= 111 * UNIT, 2);
        transfer::public_transfer(out, LP);
        ts::return_shared(v);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::yield_vault::EZeroAmount)]
fun deposit_zero_aborts() {
    let mut sc = ts::begin(LP);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    yv::create_vault<SUI>(500, &clk, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, LP);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let empty = coin::zero<SUI>(ts::ctx(&mut sc));
        let r = yv::deposit<SUI>(&mut v, empty, &clk, ts::ctx(&mut sc));
        transfer::public_transfer(r, LP);
        ts::return_shared(v);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}
