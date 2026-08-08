#[test_only]
module subscriptions::account_tests {
    use subscriptions::account::{Self, AccountStatus, PolicySet, Subscription};
    use subscriptions::ac;
    use subscriptions::registry;
    use std::type_name;
    use sui::object;
    use sui::test_scenario as ts;
    use sui::clock;
    use sui::vec_map;

    public struct TEST_USDC has drop {}

    fun registry_with_test_usdc(scenario: &mut ts::Scenario): registry::CoinTypeRegistry {
        let mut r = registry::new_registry_for_testing(ts::ctx(scenario));
        registry::register_coin_type<TEST_USDC>(&mut r, ts::ctx(scenario));
        r
    }

    fun depositor_cap(account_id: object::ID, scenario: &mut ts::Scenario): ac::AccountCap {
        ac::new_account_cap_for_testing(
            account_id,
            ac::permission_depositor(),
            ts::ctx(scenario),
        )
    }

    #[allow(unused_function)]
    fun make_sub(
        platform_id: object::ID,
        status: u8,
        _scenario: &mut ts::Scenario,
    ): Subscription {
        let now = 0;
        account::new_subscription(
            platform_id,
            0,
            100,
            86_400_000,
            status,
            86_400_000,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            now,
            now,
        )
    }

    #[test]
    fun test_create_account_with_registered_coin_succeeds() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        assert!(ac::account_id(&cap) == object::id(&account), 0);
        assert!(ac::permissions(&cap) == 1, 1);
        assert!(account::version(&account) == 2, 2);
        assert!(account::nonce(&account) == 0, 3);
        assert!(account::subscription_count(&account) == 0, 4);
        assert!(account::is_active(account::status(&account)), 5);

        let tn = account::account_type<TEST_USDC>();
        let expected = type_name::with_original_ids<TEST_USDC>();
        assert!(tn == expected, 6);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_update_policies_replaces_wholesale() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let initial = account::policies(&account);
        assert!(account::policy_per_tx_max(initial) == 0, 0);
        assert!(account::policy_monthly_max(initial) == 0, 1);
        assert!(account::policy_min_balance(initial) == 0, 2);
        assert!(account::policy_frequency_min_ms(initial) == 0, 3);

        let new_set = account::new_policy_set(
            1_000,
            30_000,
            500,
            60_000,
        );
        account::update_policies<TEST_USDC>(&cap, &mut account, new_set, &clock);

        let p = account::policies(&account);
        assert!(account::policy_per_tx_max(p) == 1_000, 4);
        assert!(account::policy_monthly_max(p) == 30_000, 5);
        assert!(account::policy_min_balance(p) == 500, 6);
        assert!(account::policy_frequency_min_ms(p) == 60_000, 7);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_mint_delegated_cap_requires_owner() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        let account_id = object::id(&account);

        let delegated = account::mint_delegated_cap<TEST_USDC>(
            &cap,
            &account,
            ac::permission_depositor(),
            &clock,
            ts::ctx(&mut sc),
        );
        assert!(ac::account_id(&delegated) == account_id, 0);
        assert!(
            ac::permissions(&delegated) == ac::permission_depositor(),
            1,
        );
        assert!(
            !ac::has_permission(&delegated, ac::permission_owner()),
            2,
        );

        ac::destroy_account_cap_for_testing(delegated);
        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = 0x01009)]
    fun test_mint_delegated_cap_depositor_cap_fails() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (account, _cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        let account_id = object::id(&account);

        let dep_cap = depositor_cap(account_id, &mut sc);
        let _bad = account::mint_delegated_cap<TEST_USDC>(
            &dep_cap,
            &account,
            ac::permission_depositor(),
            &clock,
            ts::ctx(&mut sc),
        );

        ac::destroy_account_cap_for_testing(_bad);
        ac::destroy_account_cap_for_testing(dep_cap);
        ac::destroy_account_cap_for_testing(_cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_close_account_flips_status() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        account::close_account<TEST_USDC>(&cap, &mut account, &clock);
        assert!(account::is_closed(account::status(&account)), 0);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_share_account_shares_and_transfers_cap() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = registry_with_test_usdc(&mut sc);

        let (account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        let account_id = object::id(&account);

        account::share_account<TEST_USDC>(account, cap, ts::ctx(&mut sc));

        ts::next_tx(&mut sc, @0xA);
        let shared_account = ts::take_shared_by_id<account::SubscriptionAccount<TEST_USDC>>(
            &sc, account_id,
        );
        let cap_in_inventory = ts::take_from_address<ac::AccountCap>(&sc, @0xA);
        let cap_account_id = ac::account_id(&cap_in_inventory);
        assert!(cap_account_id == account_id, 0);

        ac::destroy_account_cap_for_testing(cap_in_inventory);
        account::destroy_account_for_testing(shared_account);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_subscription_v1_constructor_and_accessors() {
        let mut sc = ts::begin(@0xA);
        let platform_id = object::id_from_address(@0xCAFEBABE);
        let now: u64 = 1_700_000_000_000;
        let sub = account::new_subscription(
            platform_id,
            3,
            5_000_000,
            2_592_000_000,
            0,
            7_776_000_000,
            1_700_000_000_000,
            1_699_900_000_000,
            50_000_000,
            10,
            1_699_950_000_000,
            2,
            5,
            7,
            now - 30 * 86_400_000,
            now,
        );
        assert!(account::sub_platform_id(&sub) == platform_id, 0);
        assert!(account::sub_tier_index(&sub) == 3, 1);
        assert!(account::sub_tier_amount(&sub) == 5_000_000, 2);
        assert!(account::sub_tier_frequency_ms(&sub) == 2_592_000_000, 3);
        assert!(account::sub_schedule_frequency_ms(&sub) == 7_776_000_000, 4);
        assert!(account::sub_next_billing_time(&sub) == 1_700_000_000_000, 5);
        assert!(account::sub_last_billing_time(&sub) == 1_699_900_000_000, 6);
        assert!(account::sub_total_paid(&sub) == 50_000_000, 7);
        assert!(account::sub_payment_count(&sub) == 10, 8);
        assert!(account::sub_last_attempt_time(&sub) == 1_699_950_000_000, 9);
        assert!(account::sub_attempt_count(&sub) == 2, 10);
        assert!(account::sub_max_attempts(&sub) == 5, 11);
        assert!(account::sub_nonce(&sub) == 7, 12);
        assert!(account::sub_is_active(&sub), 13);
        assert!(!account::sub_is_paused(&sub), 14);
        assert!(!account::sub_is_cancelled(&sub), 15);
        let _ = now;
        let _ = sub;
        sc.end();
    }

    #[test]
    fun test_account_status_helpers() {
        let active: AccountStatus = account::account_status_active();
        let paused: AccountStatus = account::account_status_paused();
        let closed: AccountStatus = account::account_status_closed();
        assert!(account::status_variant(&active) == 0, 0);
        assert!(account::status_variant(&paused) == 1, 1);
        assert!(account::status_variant(&closed) == 2, 2);
        assert!(account::is_active(&active), 3);
        assert!(account::is_paused(&paused), 4);
        assert!(account::is_closed(&closed), 5);
    }

    #[test]
    fun test_policy_set_helpers() {
        let empty: PolicySet = account::empty_policy_set();
        assert!(account::policy_per_tx_max(&empty) == 0, 0);
        assert!(account::policy_monthly_max(&empty) == 0, 1);
        assert!(account::policy_min_balance(&empty) == 0, 2);
        assert!(account::policy_frequency_min_ms(&empty) == 0, 3);

        let p: PolicySet = account::new_policy_set(10, 20, 30, 40);
        assert!(account::policy_per_tx_max(&p) == 10, 4);
        assert!(account::policy_monthly_max(&p) == 20, 5);
        assert!(account::policy_min_balance(&p) == 30, 6);
        assert!(account::policy_frequency_min_ms(&p) == 40, 7);
    }
}
