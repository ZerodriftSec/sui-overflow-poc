#[test_only]
module streamline::treasury_tests;

use streamline::treasury::{Self as tr, Treasury};
use streamline::yield_vault::{Self as yv, YieldVault};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const OWNER: address = @0x11;
const OUTSIDER: address = @0x22;
const YEAR_MS: u64 = 31_536_000_000;
const UNIT: u64 = 1_000_000; // 1 "USDC"

#[test]
fun fund_invest_accrue_divest_withdraw() {
    let mut sc = ts::begin(OWNER);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    // 10% APR vault seeded with an interest buffer, plus an empty treasury.
    yv::create_vault<SUI>(1_000, &clk, ts::ctx(&mut sc));
    tr::open<SUI>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let buffer = coin::mint_for_testing<SUI>(1_000 * UNIT, ts::ctx(&mut sc));
        yv::fund<SUI>(&mut v, buffer);

        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        // Fund 100, invest 60 → idle 40, invested ~60.
        tr::deposit<SUI>(&mut t, coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc)));
        assert!(tr::idle_value<SUI>(&t) == 100 * UNIT, 0);
        tr::invest<SUI>(&mut t, &mut v, 60 * UNIT, &clk, ts::ctx(&mut sc));
        assert!(tr::idle_value<SUI>(&t) == 40 * UNIT, 1);
        assert!(tr::is_invested<SUI>(&t), 2);
        assert!(tr::invested_value<SUI>(&t, &v, clk.timestamp_ms()) == 60 * UNIT, 3);
        ts::return_shared(v);
        ts::return_shared(t);
    };

    // One year later the invested 60 should be ~66.
    clk.increment_for_testing(YEAR_MS);
    ts::next_tx(&mut sc, OWNER);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        let iv = tr::invested_value<SUI>(&t, &v, clk.timestamp_ms());
        assert!(iv >= 65 * UNIT && iv <= 67 * UNIT, 4);

        tr::divest<SUI>(&mut t, &mut v, &clk, ts::ctx(&mut sc));
        assert!(!tr::is_invested<SUI>(&t), 5);
        // idle now ~40 + ~66 = ~106.
        let idle = tr::idle_value<SUI>(&t);
        assert!(idle >= 105 * UNIT && idle <= 107 * UNIT, 6);

        let out = tr::withdraw<SUI>(&mut t, 100 * UNIT, ts::ctx(&mut sc));
        assert!(coin::value(&out) == 100 * UNIT, 7);
        transfer::public_transfer(out, OWNER);
        ts::return_shared(v);
        ts::return_shared(t);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::treasury::ENotOwner)]
fun outsider_cannot_withdraw() {
    let mut sc = ts::begin(OWNER);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    tr::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, OWNER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        tr::deposit<SUI>(&mut t, coin::mint_for_testing<SUI>(50 * UNIT, ts::ctx(&mut sc)));
        ts::return_shared(t);
    };
    ts::next_tx(&mut sc, OUTSIDER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        let out = tr::withdraw<SUI>(&mut t, 10 * UNIT, ts::ctx(&mut sc));
        transfer::public_transfer(out, OUTSIDER);
        ts::return_shared(t);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
fun reserve_round_trip() {
    let mut sc = ts::begin(OWNER);
    tr::open<SUI>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, OWNER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        tr::deposit<SUI>(&mut t, coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc)));
        assert!(tr::reserve_value<SUI>(&t) == 0, 0);

        // Park 30 → idle 70, reserve 30. Park 10 more → reserve 40, idle 60.
        tr::to_reserve<SUI>(&mut t, 30 * UNIT, ts::ctx(&mut sc));
        assert!(tr::idle_value<SUI>(&t) == 70 * UNIT, 1);
        assert!(tr::reserve_value<SUI>(&t) == 30 * UNIT, 2);
        tr::to_reserve<SUI>(&mut t, 10 * UNIT, ts::ctx(&mut sc));
        assert!(tr::reserve_value<SUI>(&t) == 40 * UNIT, 3);
        assert!(tr::idle_value<SUI>(&t) == 60 * UNIT, 4);

        // Release 25 → reserve 15, idle 85. Nothing left the treasury.
        tr::from_reserve<SUI>(&mut t, 25 * UNIT, ts::ctx(&mut sc));
        assert!(tr::reserve_value<SUI>(&t) == 15 * UNIT, 5);
        assert!(tr::idle_value<SUI>(&t) == 85 * UNIT, 6);
        assert!(tr::idle_value<SUI>(&t) + tr::reserve_value<SUI>(&t) == 100 * UNIT, 7);
        ts::return_shared(t);
    };

    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::treasury::EInsufficientReserve)]
fun cannot_over_release_reserve() {
    let mut sc = ts::begin(OWNER);
    tr::open<SUI>(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, OWNER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        tr::deposit<SUI>(&mut t, coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc)));
        tr::to_reserve<SUI>(&mut t, 20 * UNIT, ts::ctx(&mut sc));
        tr::from_reserve<SUI>(&mut t, 25 * UNIT, ts::ctx(&mut sc)); // over-release → abort
        ts::return_shared(t);
    };
    ts::end(sc);
}
