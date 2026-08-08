#[test_only]
module subscriptions::payment_tests {
    use subscriptions::account;
    use subscriptions::ac;
    use subscriptions::billing;
    use subscriptions::payment;
    use subscriptions::platform;
    use subscriptions::policies;
    use subscriptions::registry;
    use sui::coin;
    use std::string;
    use sui::object;
    use sui::test_scenario as ts;
    use sui::test_scenario;
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

    fun fresh_initialized_limiters(
        account: &account::SubscriptionAccount<TEST_USDC>,
        clock: &clock::Clock,
    ): policies::PolicyLimiters {
        let mut limiters = policies::empty_limiters(clock);
        policies::ensure_initialized<TEST_USDC>(account, &mut limiters, clock);
        limiters
    }

    fun setup_account_with_subscription(
        r: &registry::CoinTypeRegistry,
        clock: &clock::Clock,
        scenario: &mut ts::Scenario,
        tier_amount: u64,
        frequency_ms: u64,
    ): (object::ID, object::ID) {
        let platform_id = platform::register_platform(
            string::utf8(b"TestPlatform"),
            string::utf8(b"d"),
            string::utf8(b"Test"),
            std::option::none(),
            clock,
            ts::ctx(scenario),
        );

        let (mut account, cap) = account::create_account<TEST_USDC>(
            r,
            account::empty_policy_set(),
            clock,
            ts::ctx(scenario),
        );

        billing::create_subscription<TEST_USDC>(
            &cap,
            &mut account,
            platform_id,
            0,
            tier_amount,
            frequency_ms,
            3,
            clock,
            ts::ctx(scenario),
        );

        let account_id = object::id(&account);
        account::share_account<TEST_USDC>(account, cap, ts::ctx(scenario));
        (account_id, platform_id)
    }

    #[test]
    fun test_process_due_payment_succeeds() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (account_id, platform_id) = setup_account_with_subscription(
            &r,
            &clock,
            &mut sc,
            100,
            0,
        );

        ts::next_tx(&mut sc, owner);

        let mut account = ts::take_shared_by_id<account::SubscriptionAccount<TEST_USDC>>(
            &sc, account_id,
        );
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);
        let mut limiters = fresh_initialized_limiters(&account, &clock);

        let cap = ts::take_from_address<ac::AccountCap>(&sc, owner);
        let coin = coin::mint_for_testing<TEST_USDC>(100, ts::ctx(&mut sc));
        account::deposit(&cap, &mut account, coin, &clock, ts::ctx(&mut sc));
        ts::return_to_address(owner, cap);

        payment::process_due_payment<TEST_USDC>(
            &mut p,
            &mut account,
            &mut limiters,
            &clock,
            ts::ctx(&mut sc),
        );

        assert!(account::nonce(&account) == 1, 0);
        assert!(billing::subscription_total_paid(&account, platform_id) == 100, 2);
        assert!(billing::subscription_payment_count(&account, platform_id) == 1, 3);

        policies::destroy_limiters_for_testing(limiters);
        ts::return_shared(p);
        account::destroy_account_for_testing(account);

        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 0x09001)]
    fun test_process_due_payment_not_due_fails() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (account_id, platform_id) = setup_account_with_subscription(
            &r,
            &clock,
            &mut sc,
            100,
            86_400_000,
        );

        ts::next_tx(&mut sc, owner);

        let mut account = ts::take_shared_by_id<account::SubscriptionAccount<TEST_USDC>>(
            &sc, account_id,
        );
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);
        let mut limiters = fresh_initialized_limiters(&account, &clock);

        payment::process_due_payment<TEST_USDC>(
            &mut p,
            &mut account,
            &mut limiters,
            &clock,
            ts::ctx(&mut sc),
        );

        policies::destroy_limiters_for_testing(limiters);
        ts::return_shared(p);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_process_due_payment_emits_payment_processed() {
        let owner = @0xA;
        let mut sc = ts::begin(owner);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (account_id, platform_id) = setup_account_with_subscription(
            &r,
            &clock,
            &mut sc,
            100,
            0,
        );

        let _setup_effects = ts::next_tx(&mut sc, owner);

        let mut account = ts::take_shared_by_id<account::SubscriptionAccount<TEST_USDC>>(
            &sc, account_id,
        );
        let mut p = ts::take_shared_by_id<platform::Platform>(&mut sc, platform_id);
        let mut limiters = fresh_initialized_limiters(&account, &clock);

        let cap = ts::take_from_address<ac::AccountCap>(&sc, owner);
        let coin = coin::mint_for_testing<TEST_USDC>(100, ts::ctx(&mut sc));
        account::deposit(&cap, &mut account, coin, &clock, ts::ctx(&mut sc));
        ts::return_to_address(owner, cap);

        payment::process_due_payment<TEST_USDC>(
            &mut p,
            &mut account,
            &mut limiters,
            &clock,
            ts::ctx(&mut sc),
        );

        assert!(account::nonce(&account) == 1, 1);

        let payment_effects = ts::next_tx(&mut sc, owner);
        let event_count = test_scenario::num_user_events(&payment_effects);
        assert!(event_count >= 1, 2);

        policies::destroy_limiters_for_testing(limiters);
        ts::return_shared(p);
        account::destroy_account_for_testing(account);

        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }
}
