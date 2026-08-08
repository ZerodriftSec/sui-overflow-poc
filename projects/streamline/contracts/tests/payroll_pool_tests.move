#[test_only]
module streamline::payroll_pool_tests;

use std::string;
use streamline::stream::{Self as st, Stream};
use streamline::treasury::{Self as tr, Treasury};
use streamline::yield_vault::{Self as yv, YieldVault};
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const ORG: address = @0xA1;
const WORKER: address = @0xB2;
const UNIT: u64 = 1_000_000;
const DAY_MS: u64 = 86_400_000;

#[test]
fun hire_from_treasury_suspend_resume_stop() {
    let mut sc = ts::begin(ORG);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));

    yv::create_vault<SUI>(0, &clk, ts::ctx(&mut sc));
    tr::open<SUI>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ORG);
    {
        let mut v = ts::take_shared<YieldVault<SUI>>(&sc);
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        tr::deposit<SUI>(&mut t, coin::mint_for_testing<SUI>(100 * UNIT, ts::ctx(&mut sc)));
        // Park 40 in yield; hire needs 50 → ensure_idle must divest.
        tr::invest<SUI>(&mut t, &mut v, 40 * UNIT, &clk, ts::ctx(&mut sc));
        tr::ensure_idle<SUI>(&mut t, &mut v, 50 * UNIT, &clk, ts::ctx(&mut sc));
        assert!(tr::idle_value<SUI>(&t) >= 50 * UNIT, 0);

        let names = vector[string::utf8(b"payroll")];
        let amounts = vector[50 * UNIT];
        st::create_stream_from_treasury_v2<SUI>(
            &mut t,
            WORKER,
            names,
            amounts,
            30 * DAY_MS,
            DAY_MS,
            true,
            0,
            &clk,
            ts::ctx(&mut sc),
        );
        // ensure_idle saw 60 idle ≥ 50 target, so it divested nothing; the hire
        // drew 50 from idle → 10 idle, 40 still invested, 50 total of the original 100.
        assert!(tr::idle_value<SUI>(&t) == 10 * UNIT, 1);
        assert!(
            tr::idle_value<SUI>(&t) + tr::invested_value<SUI>(&t, &v, clk.timestamp_ms())
                == 50 * UNIT,
            2,
        );
        ts::return_shared(v);
        ts::return_shared(t);
    };

    // Stream starts DRIPPING — approve first milestone so suspend/stop paths work.
    ts::next_tx(&mut sc, ORG);
    {
        let s = ts::take_shared<Stream<SUI>>(&sc);
        assert!(st::is_dripping<SUI>(&s), 3);
        ts::return_shared(s);
    };

    clk.increment_for_testing(DAY_MS);
    ts::next_tx(&mut sc, ORG);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        st::suspend_payroll<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        assert!(st::is_suspended<SUI>(&s), 4);
        st::resume_payroll<SUI>(&mut s, &clk, ts::ctx(&mut sc));
        assert!(st::is_dripping<SUI>(&s), 5);
        ts::return_shared(s);
    };

    ts::next_tx(&mut sc, ORG);
    {
        let mut s = ts::take_shared<Stream<SUI>>(&sc);
        let mut t = ts::take_shared<Treasury<SUI>>(&sc);
        let before = tr::idle_value<SUI>(&t);
        st::stop_payroll<SUI>(&mut s, &mut t, &clk, ts::ctx(&mut sc));
        assert!(st::state<SUI>(&s) == 4, 6); // STATE_DONE
        assert!(tr::idle_value<SUI>(&t) > before, 7);
        ts::return_shared(s);
        ts::return_shared(t);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}
