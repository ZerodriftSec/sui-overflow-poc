#[test_only]
module subscriptions::policies_tests {
    use subscriptions::account::{Self, PolicySet};
    use subscriptions::ac;
    use subscriptions::policies::{Self, PolicyLimiters, PolicyFailure};
    use subscriptions::registry;
    use std::string;
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
    fun test_evaluate_passes_when_no_policies_set() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        let mut limiters = policies::empty_limiters(&clock);
        policies::ensure_initialized<TEST_USDC>(&account, &mut limiters, &clock);

        let (allowed, failures) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(allowed, 0);
        assert!(vector::length(&failures) == 0, 1);

        let (allowed2, failures2) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1_000_000_000, &clock,
        );
        assert!(allowed2, 2);
        assert!(vector::length(&failures2) == 0, 3);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        policies::destroy_limiters_for_testing(limiters);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_evaluate_blocks_per_tx() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let ps: PolicySet = account::new_policy_set(
            100,
            0,
            0,
            0,
        );
        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        account::update_policies<TEST_USDC>(&cap, &mut account, ps, &clock);

        let mut limiters = policies::empty_limiters(&clock);
        policies::ensure_initialized<TEST_USDC>(&account, &mut limiters, &clock);

        let (allowed, failures) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 200, &clock,
        );
        assert!(!allowed, 0);
        assert!(vector::length(&failures) == 1, 1);
        let f: &PolicyFailure = vector::borrow(&failures, 0);
        assert!(policies::failure_code(f) == 0x07001, 2);
        assert!(policies::failure_amount_required(f) == 200, 3);
        assert!(policies::failure_amount_available(f) == 100, 4);

        let (allowed2, failures2) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 100, &clock,
        );
        assert!(allowed2, 5);
        assert!(vector::length(&failures2) == 0, 6);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        policies::destroy_limiters_for_testing(limiters);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_evaluate_blocks_monthly_after_capacity() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let ps: PolicySet = account::new_policy_set(
            0,
            1_000,
            0,
            0,
        );
        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        account::update_policies<TEST_USDC>(&cap, &mut account, ps, &clock);

        let mut limiters = policies::empty_limiters(&clock);
        policies::ensure_initialized<TEST_USDC>(&account, &mut limiters, &clock);

        let (allowed1, failures1) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1_000, &clock,
        );
        assert!(allowed1, 0);
        assert!(vector::length(&failures1) == 0, 1);

        let (allowed2, failures2) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(!allowed2, 2);
        assert!(vector::length(&failures2) == 1, 3);
        let f: &PolicyFailure = vector::borrow(&failures2, 0);
        assert!(policies::failure_code(f) == 0x07002, 4);
        assert!(policies::failure_amount_required(f) == 1, 5);
        assert!(policies::failure_amount_available(f) == 0, 6);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        policies::destroy_limiters_for_testing(limiters);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_evaluate_blocks_frequency_during_cooldown() {
        let mut sc = ts::begin(@0xA);
        let mut clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let ps: PolicySet = account::new_policy_set(
            0,
            0,
            0,
            1_000,
        );
        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        account::update_policies<TEST_USDC>(&cap, &mut account, ps, &clock);

        let mut limiters = policies::empty_limiters(&clock);
        policies::ensure_initialized<TEST_USDC>(&account, &mut limiters, &clock);

        let (allowed1, failures1) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(allowed1, 0);
        assert!(vector::length(&failures1) == 0, 1);

        clock::set_for_testing(&mut clock, 1_500);

        let (allowed2, failures2) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(!allowed2, 2);
        assert!(vector::length(&failures2) == 1, 3);
        let f: &PolicyFailure = vector::borrow(&failures2, 0);
        assert!(policies::failure_code(f) == 0x07004, 4);
        assert!(policies::failure_amount_required(f) == 1, 5);
        assert!(policies::failure_amount_available(f) == 0, 6);

        clock::set_for_testing(&mut clock, 2_001);

        let (allowed3, failures3) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(allowed3, 7);
        assert!(vector::length(&failures3) == 0, 8);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        policies::destroy_limiters_for_testing(limiters);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    #[test]
    fun test_evaluate_failed_does_not_burn_tokens() {
        let mut sc = ts::begin(@0xA);
        let clock = fresh_clock(&mut sc);
        let r = registry_with_test_usdc(&mut sc);

        let ps: PolicySet = account::new_policy_set(
            0,
            1_000,
            0,
            0,
        );
        let (mut account, cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );
        account::update_policies<TEST_USDC>(&cap, &mut account, ps, &clock);

        let mut limiters = policies::empty_limiters(&clock);
        policies::ensure_initialized<TEST_USDC>(&account, &mut limiters, &clock);

        let (allowed1, failures1) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1_500, &clock,
        );
        assert!(!allowed1, 0);
        assert!(vector::length(&failures1) == 1, 1);

        let (allowed2, failures2) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 500, &clock,
        );
        assert!(allowed2, 2);
        assert!(vector::length(&failures2) == 0, 3);

        let (allowed3, failures3) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 500, &clock,
        );
        assert!(allowed3, 4);
        assert!(vector::length(&failures3) == 0, 5);

        let (allowed4, failures4) = policies::evaluate<TEST_USDC>(
            &account, &mut limiters, 1, &clock,
        );
        assert!(!allowed4, 6);
        assert!(vector::length(&failures4) == 1, 7);
        let f: &PolicyFailure = vector::borrow(&failures4, 0);
        assert!(policies::failure_code(f) == 0x07002, 8);

        ac::destroy_account_cap_for_testing(cap);
        account::destroy_account_for_testing(account);
        policies::destroy_limiters_for_testing(limiters);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

}
