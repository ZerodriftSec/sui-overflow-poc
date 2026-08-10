#[test_only]
module streamline::private_stream_tests;

use streamline::private_stream as ps;
use streamline::shielded_pool as sp;
use sui::clock;
use sui::sui::SUI;
use sui::test_scenario as ts;

// Fixture from circuits/build/private_settle/fixture.json (real Groth16 proof).
const CM_IN: u256 = 300485013737761046466316292062879329904080282632717542541741070415544771018;
const ROOT: u256 = 3144840591533934816183885947280026464693973925441709432098244718417853078886;
const NF: u256 = 3058340958650756850333278030845923471182880899951380702275913973811505220565;
const CM1: u256 = 1999353989138074496250083403547207537810122442835753070015728840084218372416;
const CM2: u256 = 12083518301681685128151705225632716956589006422204259273090632210349397513283;
const C_PARAMS: u256 = 13626640157394111270416926727427445430625297526487646320985293217151659366855;
const NOW_SEC: u64 = 1050;
const PROOF: vector<u8> = x"4c4055d2e97ec4123874f56f67e3de257d13afac364cbcc3def9f85ee522a4027e395c5f06472634ba7b2dcfd31237070a721750f46b3c88cefed5fe116f4e1d0b58d2e22d42dcabe535f86cf283f9f7ccee14a097d0439122b94cf5a6a5881f8a2737072622b69fae5a5ec0ec212c742aa3f57e787d34d62828586f2392a094";

#[test]
fun settle_vested_verifies_real_proof() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::deposit_note_for_testing(&mut pool, CM_IN);
        assert!(sp::current_root(&pool) == ROOT, 0);

        let engagement = ps::create_engagement_for_testing(C_PARAMS, CM_IN, ts::ctx(&mut scen));
        ps::settle_vested_for_testing(
            &mut pool,
            &engagement,
            ROOT,
            NF,
            CM1,
            CM2,
            C_PARAMS,
            NOW_SEC,
            PROOF,
        );
        assert!(sp::is_spent(&pool, NF), 1);
        // Burn engagement (shared in prod; drop in test via share then ignore).
        ps::share_engagement_for_testing(engagement);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = streamline::private_stream::EParamsMismatch)]
fun settle_rejects_wrong_params() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::deposit_note_for_testing(&mut pool, CM_IN);
        let engagement = ps::create_engagement_for_testing(
            C_PARAMS + 1,
            CM_IN,
            ts::ctx(&mut scen),
        );
        ps::settle_vested_for_testing(
            &mut pool,
            &engagement,
            ROOT,
            NF,
            CM1,
            CM2,
            C_PARAMS,
            NOW_SEC,
            PROOF,
        );
        ps::share_engagement_for_testing(engagement);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = streamline::private_stream::EFutureTime)]
fun settle_rejects_future_now() {
    let mut scen = ts::begin(@0x1);
    let mut clk = clock::create_for_testing(ts::ctx(&mut scen));
    clock::set_for_testing(&mut clk, 1_000_000); // 1000 sec
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::deposit_note_for_testing(&mut pool, CM_IN);
        let engagement = ps::create_engagement_for_testing(C_PARAMS, CM_IN, ts::ctx(&mut scen));
        // now_sec 1050 > clock 1000 → EFutureTime before proof check.
        ps::settle_vested(
            &mut pool,
            &engagement,
            ROOT,
            NF,
            CM1,
            CM2,
            C_PARAMS,
            NOW_SEC,
            PROOF,
            vector[],
            &clk,
        );
        ps::share_engagement_for_testing(engagement);
        ts::return_shared(pool);
    };
    clock::destroy_for_testing(clk);
    ts::end(scen);
}

#[test]
/// Pause freezes vesting: `frozen_secs` excludes paused time so `settle_vested`'s
/// now_sec ceiling drops to the pause point. v1 engagements (no control) freeze 0.
fun pause_freezes_vesting_math() {
    let mut scen = ts::begin(@0xA);
    // No control field → nothing frozen (v1 behaviour preserved).
    let plain = ps::create_engagement_for_testing(C_PARAMS, CM_IN, ts::ctx(&mut scen));
    assert!(ps::frozen_for_testing(&plain, 100) == 0, 0);
    ps::share_engagement_for_testing(plain);

    let mut e = ps::create_engagement_for_testing(C_PARAMS, CM_IN, ts::ctx(&mut scen));
    ps::add_control_for_testing(&mut e, @0xA);
    // Fresh control: not paused, nothing banked.
    assert!(ps::frozen_for_testing(&e, 100) == 0, 1);
    // Banked 30s from a prior pause, now running → exclude 30.
    ps::set_control_for_testing(&mut e, false, 0, 30);
    assert!(ps::frozen_for_testing(&e, 100) == 30, 2);
    // Currently paused since t=60 with 30 banked → exclude 30 + (100-60) = 70,
    // so the now_sec ceiling is 100-70 = 30 = pause point (60) minus banked (30).
    ps::set_control_for_testing(&mut e, true, 60, 30);
    assert!(ps::frozen_for_testing(&e, 100) == 70, 3);
    // Settling with now_sec below the pause point banks only the prior 30.
    assert!(ps::frozen_for_testing(&e, 50) == 30, 4);
    ps::share_engagement_for_testing(e);
    ts::end(scen);
}
