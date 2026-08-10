#[test_only]
module subscriptions::registry_tests {
    use subscriptions::registry;
    use std::type_name;
    use sui::test_scenario as ts;

    public struct TEST_TOKEN_X has drop {}
    public struct TEST_TOKEN_Y has drop {}
    public struct TEST_TOKEN_Z has drop {}
    public struct TEST_TOKEN_W has drop {}

    #[test]
    fun test_register_coin_type_assigns_discriminant() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        let d = registry::discriminant_of<TEST_TOKEN_X>(&r);
        assert!(d == std::option::some(0), 0);

        registry::register_coin_type<TEST_TOKEN_Y>(&mut r, ts::ctx(&mut sc));
        assert!(registry::discriminant_of<TEST_TOKEN_Y>(&r) == std::option::some(1), 5);

        registry::register_coin_type<TEST_TOKEN_Z>(&mut r, ts::ctx(&mut sc));
        assert!(registry::discriminant_of<TEST_TOKEN_Z>(&r) == std::option::some(2), 6);

        registry::register_coin_type<TEST_TOKEN_W>(&mut r, ts::ctx(&mut sc));
        assert!(registry::discriminant_of<TEST_TOKEN_W>(&r) == std::option::some(3), 7);

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    fun test_register_then_remove_round_trip() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));
        assert!(registry::discriminant_of<TEST_TOKEN_X>(&r) == std::option::some(0), 0);

        registry::remove_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        assert!(registry::discriminant_of<TEST_TOKEN_X>(&r) == std::option::none(), 2);

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = registry::ECoinTypeAlreadyRegistered)]
    fun test_register_duplicate_fails() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));
        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = registry::EUnauthorizedRegistryAdmin)]
    fun test_unauthorized_register_fails() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        ts::next_tx(&mut sc, @0xB);
        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    fun test_rotate_admin_works() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        assert!(registry::admin_address(&r) == @0xA, 0);

        registry::rotate_admin(&mut r, @0xB, ts::ctx(&mut sc));
        assert!(registry::admin_address(&r) == @0xB, 1);

        ts::next_tx(&mut sc, @0xB);
        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));
        assert!(registry::discriminant_of<TEST_TOKEN_X>(&r) == std::option::some(0), 2);

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = registry::EUnauthorizedRegistryAdmin)]
    fun test_rotate_admin_old_admin_loses_authority() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::rotate_admin(&mut r, @0xB, ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    #[expected_failure(abort_code = registry::EZeroAddress)]
    fun test_rotate_admin_zero_address_fails() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));
        registry::rotate_admin(&mut r, @0x0, ts::ctx(&mut sc));
        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    fun test_discriminant_of_returns_type_name() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));

        let d = registry::discriminant_of<TEST_TOKEN_X>(&r);
        assert!(d.is_some(), 0);
        let disc = *d.borrow();
        assert!(disc == 0, 1);

        let type_by_disc = registry::get_type(&r, disc);
        let expected = type_name::with_original_ids<TEST_TOKEN_X>();
        assert!(type_by_disc == expected, 2);

        registry::destroy_for_testing(r);
        sc.end();
    }

    #[test]
    fun test_get_discriminant_and_get_type_round_trip() {
        let mut sc = ts::begin(@0xA);
        let mut r = registry::new_registry_for_testing(ts::ctx(&mut sc));

        registry::register_coin_type<TEST_TOKEN_X>(&mut r, ts::ctx(&mut sc));
        registry::register_coin_type<TEST_TOKEN_Y>(&mut r, ts::ctx(&mut sc));

        let d0 = registry::discriminant_of<TEST_TOKEN_X>(&r);
        let d1 = registry::discriminant_of<TEST_TOKEN_Y>(&r);
        assert!(d0 != d1, 0);

        let t0 = registry::get_type(&r, *d0.borrow());
        let t1 = registry::get_type(&r, *d1.borrow());
        assert!(t0 != t1, 1);

        registry::destroy_for_testing(r);
        sc.end();
    }
}
