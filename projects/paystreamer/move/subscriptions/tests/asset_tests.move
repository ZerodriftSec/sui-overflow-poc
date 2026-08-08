#[test_only]
module subscriptions::asset_tests {
    use subscriptions::asset;
    use sui::coin;
    use sui::test_scenario as ts;
    use sui::clock;
    use std::type_name;

    /// One-off witness used as a phantom denomination in tests. Has
    /// `drop` so we can construct it freely in test contexts; no treasury
    /// cap is needed because we mint coins via `coin::mint_for_testing`.
    public struct TEST_USDC has drop {}

    /// `view_value` on a freshly-constructed `BalanceContainer<T>` is
    /// zero, and the variant discriminant is 0.
    #[test]
    fun test_new_public_empty() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let c = asset::new_public<TEST_USDC>();
        assert!(asset::variant(&c) == 0, 0);
        assert!(asset::view_value<TEST_USDC>(&c, &clock) == 0, 1);
        asset::destroy_for_testing(c);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    /// `deposit` of a 100-unit coin brings the container's headroom to
    /// 100; subsequent `view_value` returns 100.
    #[test]
    fun test_deposit_and_view() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let mut c = asset::new_public<TEST_USDC>();
        let coin = coin::mint_for_testing<TEST_USDC>(100, ts::ctx(&mut sc));
        asset::deposit<TEST_USDC>(&mut c, coin, ts::ctx(&mut sc));
        assert!(asset::view_value<TEST_USDC>(&c, &clock) == 100, 0);
        asset::destroy_for_testing(c);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    /// `try_withdraw` returns a `Balance<T>` whose value is exactly the
    /// requested amount and leaves the remaining headroom in the
    /// container. Verifies both halves of the split.
    #[test]
    fun test_try_withdraw_splits_balance() {
        let mut sc = ts::begin(@0xA);
        let clock = clock::create_for_testing(ts::ctx(&mut sc));
        let mut c = asset::new_public<TEST_USDC>();
        let coin = coin::mint_for_testing<TEST_USDC>(100, ts::ctx(&mut sc));
        asset::deposit<TEST_USDC>(&mut c, coin, ts::ctx(&mut sc));

        let withdrawn = asset::try_withdraw<TEST_USDC>(&mut c, 30, ts::ctx(&mut sc));
        assert!(sui::balance::value(&withdrawn) == 30, 0);
        assert!(asset::view_value<TEST_USDC>(&c, &clock) == 70, 1);

        sui::balance::destroy_for_testing(withdrawn);
        asset::destroy_for_testing(c);
        clock::destroy_for_testing(clock);
        sc.end();
    }

    /// `try_withdraw` aborts with `EInsufficientBalance` when the
    /// requested amount exceeds the live headroom. The container's
    /// balance is left untouched.
    #[test]
    #[expected_failure(abort_code = 0x03003)]
    fun test_try_withdraw_insufficient_fails() {
        let mut sc = ts::begin(@0xA);
        let mut c = asset::new_public<TEST_USDC>();
        let coin = coin::mint_for_testing<TEST_USDC>(50, ts::ctx(&mut sc));
        asset::deposit<TEST_USDC>(&mut c, coin, ts::ctx(&mut sc));

        let withdrawn = asset::try_withdraw<TEST_USDC>(&mut c, 100, ts::ctx(&mut sc));
        sui::balance::destroy_for_testing(withdrawn);
        asset::destroy_for_testing(c);
        sc.end();
    }

    /// `is_denied_for` always returns `false` on the public variant,
    /// regardless of the queried address. The v2 interface is
    /// deny-list-noop; the confidential extension is where deny lists
    /// become meaningful.
    #[test]
    fun test_is_denied_for_public_always_false() {
        let sc = ts::begin(@0xA);
        let c = asset::new_public<TEST_USDC>();
        assert!(!asset::is_denied_for<TEST_USDC>(&c, @0x0), 0);
        assert!(!asset::is_denied_for<TEST_USDC>(&c, @0xCAFE), 1);
        assert!(!asset::is_denied_for<TEST_USDC>(&c, @0xDEADBEEF), 2);
        asset::destroy_for_testing(c);
        sc.end();
    }

    /// `Asset<T>` constructor captures `TypeName::with_original_ids<T>`.
    /// Two `asset<TEST_USDC>()` calls return tags whose `TypeName` is
    /// equal to the type name extracted directly from `T`. This is the
    /// registry-compatibility check.
    #[test]
    fun test_asset_tag_type_name_matches() {
        let a = asset::asset<TEST_USDC>();
        let expected = type_name::with_original_ids<TEST_USDC>();
        assert!(asset::type_name_of(&a) == expected, 0);
        // `Asset<T>` has `copy + drop + store`; the binding can be dropped
        // at the end of the test scope without explicit destruction.
    }
}
