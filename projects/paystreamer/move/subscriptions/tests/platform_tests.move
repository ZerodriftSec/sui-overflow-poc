#[test_only]
module subscriptions::platform_tests {
    use subscriptions::platform;
    use subscriptions::registry;
    use std::string;
    use std::type_name;
    use sui::test_scenario as ts;
    use sui::clock;
    use openzeppelin_utils::rate_limiter;

    public struct TEST_USDC has drop {}
    public struct TEST_USDSUI has drop {}

    #[test]
    fun test_register_platform_basic() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        clock::set_for_testing(&mut clock, 1_000_000);

        let platform_id = platform::register_platform(
            string::utf8(b"MyPlatform"),
            string::utf8(b"a test platform"),
            string::utf8(b"AI"),
            std::option::some(string::utf8(b"https://example.com/hook")),
            &clock,
            ts::ctx(&mut sc),
        );

        ts::next_tx(&mut sc, owner);
        let p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        assert!(platform::owner(&p) == owner, 0);
        assert!(platform::treasury(&p) == owner, 1);
        assert!(platform::pending_treasury(&p).is_none(), 2);
        assert!(platform::tier_count(&p) == 0, 3);
        assert!(platform::subscriber_count(&p) == 0, 4);
        assert!(platform::is_verified(&p) == false, 5);
        assert!(string::as_bytes(platform::name(&p)) == &b"MyPlatform", 6);
        assert!(string::as_bytes(platform::category(&p)) == &b"AI", 7);
        assert!(platform::webhook_url(&p).is_some(), 8);
        assert!(platform::version(&p) == 2, 9);
        assert!(platform::created_at(&p) == 1_000_000, 10);

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_create_tier_increments_index() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::create_tier(
            &mut p,
            string::utf8(b"Basic"),
            1_000_000,
            30 * 24 * 60 * 60 * 1_000,
            type_name::with_original_ids<TEST_USDC>(),
            ts::ctx(&mut sc),
        );
        platform::create_tier(
            &mut p,
            string::utf8(b"Pro"),
            5_000_000,
            30 * 24 * 60 * 60 * 1_000,
            type_name::with_original_ids<TEST_USDC>(),
            ts::ctx(&mut sc),
        );
        platform::create_tier(
            &mut p,
            string::utf8(b"Enterprise"),
            25_000_000,
            30 * 24 * 60 * 60 * 1_000,
            type_name::with_original_ids<TEST_USDSUI>(),
            ts::ctx(&mut sc),
        );

        assert!(platform::tier_count(&p) == 3, 0);

        let t0 = platform::get_tier(&p, &0);
        assert!(string::as_bytes(platform::tier_name(t0)) == &b"Basic", 1);
        assert!(platform::tier_amount(t0) == 1_000_000, 2);
        assert!(platform::tier_is_active(t0) == true, 3);

        let t1 = platform::get_tier(&p, &1);
        assert!(string::as_bytes(platform::tier_name(t1)) == &b"Pro", 5);
        assert!(platform::tier_amount(t1) == 5_000_000, 6);

        let t2 = platform::get_tier(&p, &2);
        assert!(string::as_bytes(platform::tier_name(t2)) == &b"Enterprise", 7);

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = platform::EInvalidTier)]
    fun test_create_tier_duplicate_name_fails() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::create_tier(
            &mut p,
            string::utf8(b"Basic"),
            1_000_000,
            30 * 24 * 60 * 60 * 1_000,
            type_name::with_original_ids<TEST_USDC>(),
            ts::ctx(&mut sc),
        );
        platform::create_tier(
            &mut p,
            string::utf8(b"Basic"),
            2_000_000,
            30 * 24 * 60 * 60 * 1_000,
            type_name::with_original_ids<TEST_USDC>(),
            ts::ctx(&mut sc),
        );

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = platform::ETooManyTiers)]
    fun test_create_too_many_tiers_fails() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        let mut i: u64 = 0;
        let max = platform::max_tiers();
        while (i < max) {
            let name = string::utf8(b"Tier");
            let mut bytes = *string::as_bytes(&name);
            std::vector::push_back(&mut bytes, (((i % 26) as u8) + 65u8));
            let n = string::utf8(bytes);
            platform::create_tier(
                &mut p,
                n,
                1_000_000 + i,
                30 * 24 * 60 * 60 * 1_000,
                type_name::with_original_ids<TEST_USDC>(),
                ts::ctx(&mut sc),
            );
            i = i + 1;
        };
        assert!(platform::tier_count(&p) == max, 0);
        platform::create_tier(
            &mut p,
            string::utf8(b"Overflow"),
            1,
            1_000,
            type_name::with_original_ids<TEST_USDC>(),
            ts::ctx(&mut sc),
        );

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_propose_accept_treasury_change_48h_timelock() {
        let owner = @0xA;
        let new_treasury = @0xBEEF;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        let t0: u64 = 1_000_000;
        clock::set_for_testing(&mut clock, t0);

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::propose_treasury_change(
            &mut p,
            new_treasury,
            &clock,
            ts::ctx(&mut sc),
        );
        let pending_ref = platform::pending_treasury(&p);
        assert!(pending_ref.is_some(), 0);
        let pending = pending_ref.borrow();
        assert!(platform::pending_treasury_new(pending) == new_treasury, 1);
        assert!(
            platform::pending_treasury_execute_after_ms(pending) == t0 + platform::treasury_change_delay_ms(),
            2,
        );
        assert!(platform::treasury(&p) == owner, 3);

        clock::set_for_testing(
            &mut clock,
            t0 + platform::treasury_change_delay_ms(),
        );
        platform::accept_treasury_change(&mut p, &clock, ts::ctx(&mut sc));
        assert!(platform::treasury(&p) == new_treasury, 4);
        assert!(platform::pending_treasury(&p).is_none(), 5);

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = platform::ETreasuryChangeNotYetDue)]
    fun test_accept_treasury_change_before_delay_fails() {
        let owner = @0xA;
        let new_treasury = @0xBEEF;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        let t0: u64 = 1_000_000;
        clock::set_for_testing(&mut clock, t0);

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::propose_treasury_change(
            &mut p,
            new_treasury,
            &clock,
            ts::ctx(&mut sc),
        );
        clock::set_for_testing(
            &mut clock,
            t0 + platform::treasury_change_delay_ms() - 1,
        );
        platform::accept_treasury_change(&mut p, &clock, ts::ctx(&mut sc));

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = platform::ENoPendingTreasuryChange)]
    fun test_cancel_treasury_change() {
        let owner = @0xA;
        let new_treasury = @0xBEEF;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        clock::set_for_testing(&mut clock, 1_000_000);

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::propose_treasury_change(
            &mut p,
            new_treasury,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(platform::pending_treasury(&p).is_some(), 0);

        platform::cancel_treasury_change(&mut p, ts::ctx(&mut sc));
        assert!(platform::pending_treasury(&p).is_none(), 1);
        assert!(platform::treasury(&p) == owner, 2);

        platform::accept_treasury_change(&mut p, &clock, ts::ctx(&mut sc));

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_subscriber_count_increment_decrement() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        clock::set_for_testing(&mut clock, 0);

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        assert!(platform::subscriber_count(&p) == 0, 0);

        platform::increment_subscriber_count(&mut p);
        assert!(platform::subscriber_count(&p) == 1, 1);

        platform::increment_subscriber_count(&mut p);
        assert!(platform::subscriber_count(&p) == 2, 2);

        platform::decrement_subscriber_count(&mut p);
        assert!(platform::subscriber_count(&p) == 1, 3);

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_subscriber_count_decrement_floors_at_zero() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        clock::set_for_testing(&mut clock, 0);

        let platform_id = platform::register_platform(
            string::utf8(b"P"),
            string::utf8(b"d"),
            string::utf8(b"cat"),
            std::option::none(),
            &clock,
            ts::ctx(&mut sc),
        );
        ts::next_tx(&mut sc, owner);
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);

        platform::decrement_subscriber_count(&mut p);
        platform::decrement_subscriber_count(&mut p);
        platform::decrement_subscriber_count(&mut p);
        assert!(platform::subscriber_count(&p) == 0, 0);

        ts::return_shared(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_rate_limiters_can_consume() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
        clock::set_for_testing(&mut clock, 1_000_000);

        let mut p = platform::new_platform_for_testing(&clock, ts::ctx(&mut sc));
        assert!(
            rate_limiter::available(platform::volume_limiter(&p), &clock)
                == 1_000_000_000_000,
            0,
        );
        assert!(
            rate_limiter::available(platform::frequency_limiter(&p), &clock) == 1000,
            1,
        );
        assert!(
            rate_limiter::available(platform::account_billing_limiter(&p), &clock)
                == 10_000,
            2,
        );

        assert!(platform::try_consume_volume(&mut p, 100, &clock) == true, 3);
        assert!(platform::try_consume_frequency(&mut p, &clock) == true, 4);
        assert!(platform::try_consume_account_billing(&mut p, &clock) == true, 5);

        assert!(
            rate_limiter::available(platform::volume_limiter(&p), &clock)
                == 1_000_000_000_000 - 100,
            6,
        );
        assert!(
            rate_limiter::available(platform::frequency_limiter(&p), &clock) == 999,
            7,
        );
        assert!(
            rate_limiter::available(platform::account_billing_limiter(&p), &clock)
                == 9_999,
            8,
        );

        platform::destroy_for_testing(p);
        clock::destroy_for_testing(clock);
        sc.end();
    }
}
