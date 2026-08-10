#[test_only]
module noderails_escrow::escrow_tests;

use noderails_escrow::payment;
use sui::test_scenario as ts;

#[test]
fun timelock_decode_and_validate() {
    let timelocks = vector[
        0, 0, 0, 100,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 60,
        0, 0, 0, 10,
        0, 0, 0, 0,
    ];
    payment::validate_timelocks(&timelocks);
    let (c, d, s) = payment::decode_timelocks_abs(&timelocks);
    assert!(c == 100, 0);
    assert!(d == 110, 1);
    assert!(s == 160, 2);
}

#[test]
fun split_fee_math() {
    let (merchant, fee) = payment::split_fee(10_000, 200);
    assert!(merchant == 9800, 0);
    assert!(fee == 200, 1);
}

#[test]
fun scenario_placeholder() {
    let scenario = ts::begin(@0xA);
    ts::end(scenario);
}
