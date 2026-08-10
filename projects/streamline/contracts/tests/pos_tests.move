#[test_only]
module streamline::pos_tests;

use streamline::pos;
use streamline::treasury::{Self as tr, Treasury};
use std::string;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const MERCHANT: address = @0x11;
const CUSTOMER: address = @0x22;
const UNIT: u64 = 1_000_000; // 1 "USDC"

/// A scan-to-pay deposits the full amount into the merchant's treasury pool.
#[test]
fun pay_deposits_into_treasury() {
    let mut sc = ts::begin(MERCHANT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    tr::open<SUI>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, CUSTOMER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        let pay = coin::mint_for_testing<SUI>(25 * UNIT, ts::ctx(&mut sc));
        pos::pay<SUI>(string::utf8(b"qr-counter"), pay, &mut t, &clk, ts::ctx(&mut sc));
        assert!(tr::idle_value<SUI>(&t) == 25 * UNIT, 0);
        ts::return_shared(t);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

/// A zero-value payment aborts.
#[test]
#[expected_failure(abort_code = streamline::pos::EZeroAmount)]
fun pay_zero_aborts() {
    let mut sc = ts::begin(MERCHANT);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    tr::open<SUI>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, CUSTOMER);
    {
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        let pay = coin::zero<SUI>(ts::ctx(&mut sc));
        pos::pay<SUI>(string::utf8(b"qr-counter"), pay, &mut t, &clk, ts::ctx(&mut sc));
        ts::return_shared(t);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
