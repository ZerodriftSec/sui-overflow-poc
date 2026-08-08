#[test_only]
module subscriptions::billing_tests {
    use subscriptions::account;
    use subscriptions::ac;
    use subscriptions::billing;
    use subscriptions::registry;
    use sui::object;
    use sui::test_scenario as ts;
    use sui::clock;

    public struct TEST_USDC has drop {}

    fun registry_with_test_usdc(scenario: &mut ts::Scenario): registry::CoinTypeRegistry {
        let mut r = registry::new_registry_for_testing(ts::ctx(scenario));
        registry::register_coin_type<TEST_USDC>(&mut r, ts::ctx(scenario));
        r
    }

    fun fresh_clock(scenario: &mut ts::Scenario): clock::Clock {
        let mut c = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut c, 1_000);
        c
    }

    #[test]
    fun test_create_subscription_basic() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        let now = clock.timestamp_ms();
        let frequency_ms: u64 = 86_400_000;

        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            2,
            1_000_000,
            frequency_ms,
            3,
            &clock,
            ts::ctx(&mut sc),
        );

        assert!(billing::subscription_tier_amount(&account, platform_id) == 1_000_000, 0);
        assert!(billing::subscription_tier_frequency_ms(&account, platform_id) == frequency_ms, 1);
        assert!(
            billing::subscription_next_billing_time(&account, platform_id) == now + frequency_ms,
            2,
        );
        assert!(billing::subscription_status(&account, platform_id) == 0, 3);
        assert!(billing::subscription_total_paid(&account, platform_id) == 0, 4);
        assert!(billing::subscription_payment_count(&account, platform_id) == 0, 5);
        assert!(billing::subscription_nonce(&account, platform_id) == 0, 6);
        assert!(account::subscription_count(&account) == 1, 7);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 0x06003)]
    fun test_create_subscription_duplicate_fails() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_cancel_subscription() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(billing::subscription_status(&account, platform_id) == 0, 0);

        billing::cancel_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(!account::has_subscription(&account, &platform_id), 1);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_cancel_subscription_idempotent() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        billing::cancel_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(!account::has_subscription(&account, &platform_id), 0);

        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            2_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(billing::subscription_status(&account, platform_id) == 0, 1);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_resubscribe_after_cancel() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(billing::subscription_status(&account, platform_id) == 0, 0);

        billing::cancel_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(!account::has_subscription(&account, &platform_id), 1);

        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            2_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(billing::subscription_status(&account, platform_id) == 0, 2);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_record_payment_advances_schedule() {
        let mut sc = ts::begin(@0xA);
        let mut clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        let frequency_ms: u64 = 86_400_000;
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            frequency_ms,
            3,
            &clock,
            ts::ctx(&mut sc),
        );

        clock::set_for_testing(&mut clock, 1_000_000);
        billing::record_payment<TEST_USDC>(&mut account, platform_id, 1_000_000, &clock);
        assert!(billing::subscription_total_paid(&account, platform_id) == 1_000_000, 0);
        assert!(billing::subscription_payment_count(&account, platform_id) == 1, 1);
        assert!(billing::subscription_nonce(&account, platform_id) == 1, 2);
        assert!(
            billing::subscription_next_billing_time(&account, platform_id)
                == 1_000_000 + frequency_ms,
            3,
        );

        clock::set_for_testing(&mut clock, 1_000_000 + frequency_ms);
        billing::record_payment<TEST_USDC>(&mut account, platform_id, 1_000_000, &clock);
        assert!(billing::subscription_total_paid(&account, platform_id) == 2_000_000, 4);
        assert!(billing::subscription_payment_count(&account, platform_id) == 2, 5);
        assert!(billing::subscription_nonce(&account, platform_id) == 2, 6);
        assert!(
            billing::subscription_next_billing_time(&account, platform_id)
                == 1_000_000 + 2 * frequency_ms,
            7,
        );

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 0x06004)]
    fun test_record_payment_on_paused_fails() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        billing::pause_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        billing::record_payment<TEST_USDC>(&mut account, platform_id, 1_000_000, &clock);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_can_bill_after_time() {
        let mut sc = ts::begin(@0xA);
        let mut clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            0,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        let now = clock.timestamp_ms();
        assert!(billing::subscription_next_billing_time(&account, platform_id) == now, 0);
        assert!(billing::can_bill(&account, platform_id, &clock), 1);

        billing::pause_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(!billing::can_bill(&account, platform_id, &clock), 2);

        billing::resume_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );
        clock::set_for_testing(&mut clock, now + 1);
        assert!(billing::can_bill(&account, platform_id, &clock), 3);

        let other_platform = object::id_from_address(@0xDEADBEEF);
        assert!(!billing::can_bill(&account, other_platform, &clock), 4);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_can_bill_false_before_time() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(!billing::can_bill(&account, platform_id, &clock), 0);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 0x06009)]
    fun test_pause_subscription_depositor_cap_fails() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        let account_id = object::id(&account);
        let platform_id = object::id_from_address(@0xCAFEBABE);
        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            1_000_000,
            86_400_000,
            3,
            &clock,
            ts::ctx(&mut sc),
        );

        let dep_cap = ac::new_account_cap_for_testing(
            account_id,
            ac::permission_depositor(),
            ts::ctx(&mut sc),
        );
        billing::pause_subscription<TEST_USDC>(
            &dep_cap,
            &mut account,
            platform_id,
            &clock,
            ts::ctx(&mut sc),
        );

        ac::destroy_account_cap_for_testing(dep_cap);
        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }
}
