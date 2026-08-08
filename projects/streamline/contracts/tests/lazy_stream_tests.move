#[test_only]
module streamline::lazy_stream_tests;

use streamline::lazy_stream::{Self as lz, LazyStream};
use sui::balance;
use sui::clock;
use sui::sui::SUI;
use sui::test_scenario as ts;

const SENDER: address = @0x11;
const FREELANCER: address = @0x22;

// Real lazydrip.circom proof: cap 1000, rate 10/s, start 0, claim 300 of 500
// vested at nowSec=50. Public signals (LE 32B) from circuits/converter.
const C_REM_OLD: vector<u8> = x"7aeb2f1b5c533c7b1c4fcbf0b8078faf5a5f973c212da655ba3f4f9d13a0bd1d";
const C_REM_NEW: vector<u8> = x"bbe0c89b73cf5a796a177fd6eae83ffe34c0dcf86196d8850682913f1f4c8715";
const C_EARNED_OLD: vector<u8> = x"3af7c794a6504856a961f0683c2e4b82ce0f3284edcbd4cc3f8b33eec3584401";
const C_EARNED_NEW: vector<u8> = x"d4993872c321524b470687ec15eaa5dd73dcabd6e08b397411d1824ca117a910";
const C_PARAMS: vector<u8> = x"5a0191fad8446e9c3503c34ff87f770feccee409e78d1f9400e2b31d22021b0e";
const PROOF: vector<u8> = x"a7edee9e1823a42322ad88caf5717553ce11fe8fbf87b5ab862c040c8fee2e272f6599f42782a8b0382fc9700e97197353a0a56d66c0caf83b7a834834ae162b4208696c5970690ccd5a7ad2217bb21f310c98e04c2d196cf4ddc89d0697c08fdcacf1496692ac6bd61dcf9ae716a5c966137004ef370d6d22ccf9546c9c051a";

#[test]
fun settle_verifies_and_updates_commitments() {
    let mut sc = ts::begin(SENDER);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    // Chain clock at 60s; prover claims now_sec = 50 (in the past) — matches proof.
    clk.increment_for_testing(60_000);

    let reserve = balance::create_for_testing<SUI>(1_000);
    let mut stream = lz::new_for_testing<SUI>(
        reserve, FREELANCER, C_REM_OLD, C_EARNED_OLD, C_PARAMS, ts::ctx(&mut sc)
    );

    lz::settle_at<SUI>(&mut stream, C_REM_NEW, C_EARNED_NEW, PROOF, 50, &clk);

    assert!(lz::remaining_commitment(&stream) == C_REM_NEW, 0);
    assert!(lz::earned_commitment(&stream) == C_EARNED_NEW, 1);

    lz::destroy_for_testing(stream);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::confidential_balance::EProofInvalid)]
fun settle_rejects_wrong_now() {
    let mut sc = ts::begin(SENDER);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clk.increment_for_testing(60_000);
    let reserve = balance::create_for_testing<SUI>(1_000);
    let mut stream = lz::new_for_testing<SUI>(
        reserve, FREELANCER, C_REM_OLD, C_EARNED_OLD, C_PARAMS, ts::ctx(&mut sc)
    );
    // Claim now_sec = 51 (≤ clock) but the proof was built for 50 ⇒ inputs mismatch.
    lz::settle_at<SUI>(&mut stream, C_REM_NEW, C_EARNED_NEW, PROOF, 51, &clk);
    lz::destroy_for_testing(stream);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = streamline::lazy_stream::EFutureTime)]
fun settle_rejects_future_time() {
    let mut sc = ts::begin(SENDER);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clk.increment_for_testing(50_000); // clock = 50s
    let reserve = balance::create_for_testing<SUI>(1_000);
    let mut stream = lz::new_for_testing<SUI>(
        reserve, FREELANCER, C_REM_OLD, C_EARNED_OLD, C_PARAMS, ts::ctx(&mut sc)
    );
    // now_sec = 60 is in the future relative to the 50s clock ⇒ reject.
    lz::settle_at<SUI>(&mut stream, C_REM_NEW, C_EARNED_NEW, PROOF, 60, &clk);
    lz::destroy_for_testing(stream);
    clock::destroy_for_testing(clk);
    ts::end(sc);
}
