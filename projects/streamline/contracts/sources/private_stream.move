/// StreamLine — private engagement (default private stream path).
///
/// Combines the shielded pool (graph hiding) with lazy vesting (no drip cadence).
/// There is no on-chain `sender` / `freelancer`: parties only learn openings via
/// encrypted notes. Deposit/withdraw still reveal amount at the anonymity-set
/// boundary; everything between is unlinkable.
module streamline::private_stream;

use sui::clock::Clock;
use sui::coin::Coin;
use sui::dynamic_field as df;
use sui::event;
use streamline::confidential_balance;
use streamline::shielded_pool::{Self, ShieldedPool};

const EFutureTime: u64 = 0;
const EParamsMismatch: u64 = 1;
/// Only the address that opened the engagement may pause / resume it.
const EUnauthorized: u64 = 2;
const EAlreadyPaused: u64 = 3;
const ENotPaused: u64 = 4;

/// Dynamic-field key + value holding pause state. Attached at `open_engagement_v2`
/// so the shared engagement can be frozen without changing the `PrivateEngagement`
/// struct (upgrade-safe) and without a party field (settle stays permissionless —
/// it only *reads* this, never needs the opener).
public struct CtrlKey has copy, drop, store {}

public struct EngagementControl has store {
    /// The opener (tx sender of open). Open is already user-signed, so recording
    /// it here leaks nothing new; it authorizes pause/resume.
    opener: address,
    paused: bool,
    /// Wall-clock second the current pause began (valid only while `paused`).
    paused_at_sec: u64,
    /// Total paused seconds banked from previous pause/resume cycles.
    accum_paused_sec: u64,
}

/// Pins a vesting schedule (`params_commitment`) to a funding note without
/// naming the parties. Shared so settle is permissionless for anyone holding
/// the note openings (relayer-friendly).
public struct PrivateEngagement has key {
    id: UID,
    /// Poseidon(rate, start_sec, cap, blinding) — schedule pin.
    params_commitment: u256,
    /// Initial deposit note commitment (informational; spent on first settle).
    funding_cm: u256,
}

/// No parties. Links funding note ↔ schedule commitment at the boundary.
public struct EngagementOpened has copy, drop {
    engagement_id: ID,
    funding_cm: u256,
    params_commitment: u256,
}

/// Graph-hiding settle — mirrors `Spent` (no amounts, no parties, no clock).
public struct EngagementSettled has copy, drop {
    engagement_id: ID,
    nullifier: u256,
    cm1: u256,
    cm2: u256,
}

/// Open a private engagement: deposit into the shielded pool and pin the
/// vesting schedule. Optional `ciphertext` publishes an encrypted opening to
/// the counterparty (ECIES sealed box via `publish_note`).
public fun open_engagement<T>(
    pool: &mut ShieldedPool<T>,
    payment: Coin<T>,
    cm: u256,
    deposit_proof: vector<u8>,
    params_commitment: u256,
    ciphertext: vector<u8>,
    ctx: &mut TxContext,
) {
    shielded_pool::deposit(pool, payment, cm, deposit_proof);
    if (ciphertext.length() > 0) {
        shielded_pool::publish_note(pool, cm, ciphertext);
    };
    let engagement = PrivateEngagement {
        id: object::new(ctx),
        params_commitment,
        funding_cm: cm,
    };
    let engagement_id = object::id(&engagement);
    event::emit(EngagementOpened {
        engagement_id,
        funding_cm: cm,
        params_commitment,
    });
    transfer::share_object(engagement);
}

/// Like `open_engagement`, but attaches pausable control authorized by the
/// opener (tx sender). Vesting can then be frozen via `pause_engagement` — the
/// paused span is excluded from what `settle_vested` will pay.
public fun open_engagement_v2<T>(
    pool: &mut ShieldedPool<T>,
    payment: Coin<T>,
    cm: u256,
    deposit_proof: vector<u8>,
    params_commitment: u256,
    ciphertext: vector<u8>,
    ctx: &mut TxContext,
) {
    shielded_pool::deposit(pool, payment, cm, deposit_proof);
    if (ciphertext.length() > 0) {
        shielded_pool::publish_note(pool, cm, ciphertext);
    };
    let mut engagement = PrivateEngagement {
        id: object::new(ctx),
        params_commitment,
        funding_cm: cm,
    };
    df::add(
        &mut engagement.id,
        CtrlKey {},
        EngagementControl {
            opener: ctx.sender(),
            paused: false,
            paused_at_sec: 0,
            accum_paused_sec: 0,
        },
    );
    let engagement_id = object::id(&engagement);
    event::emit(EngagementOpened {
        engagement_id,
        funding_cm: cm,
        params_commitment,
    });
    transfer::share_object(engagement);
}

/// Freeze vesting. Only the opener may call. Paused time is excluded from the
/// vested amount `settle_vested` will pay, until `resume_engagement`.
public fun pause_engagement(
    engagement: &mut PrivateEngagement,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms() / 1000;
    let ctrl: &mut EngagementControl = df::borrow_mut(&mut engagement.id, CtrlKey {});
    assert!(ctx.sender() == ctrl.opener, EUnauthorized);
    assert!(!ctrl.paused, EAlreadyPaused);
    ctrl.paused = true;
    ctrl.paused_at_sec = now;
}

/// Resume vesting after a pause. Banks the paused span so it stays excluded.
public fun resume_engagement(
    engagement: &mut PrivateEngagement,
    clock: &Clock,
    ctx: &TxContext,
) {
    let now = clock.timestamp_ms() / 1000;
    let ctrl: &mut EngagementControl = df::borrow_mut(&mut engagement.id, CtrlKey {});
    assert!(ctx.sender() == ctrl.opener, EUnauthorized);
    assert!(ctrl.paused, ENotPaused);
    if (now > ctrl.paused_at_sec) {
        ctrl.accum_paused_sec = ctrl.accum_paused_sec + (now - ctrl.paused_at_sec);
    };
    ctrl.paused = false;
}

/// Seconds to exclude from vesting for this engagement at wall-clock `now_sec`.
/// 0 when the engagement has no control field (opened via v1, or never pausable).
fun frozen_secs(engagement: &PrivateEngagement, now_sec: u64): u64 {
    if (!df::exists_with_type<CtrlKey, EngagementControl>(&engagement.id, CtrlKey {}))
        return 0;
    let ctrl: &EngagementControl = df::borrow(&engagement.id, CtrlKey {});
    let extra = if (ctrl.paused && now_sec > ctrl.paused_at_sec) {
        now_sec - ctrl.paused_at_sec
    } else {
        0
    };
    ctrl.accum_paused_sec + extra
}

/// Vesting-bounded shielded spend. Prover supplies `now_sec` (≤ chain clock);
/// proof must use this engagement's `params_commitment`.
public fun settle_vested<T>(
    pool: &mut ShieldedPool<T>,
    engagement: &PrivateEngagement,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    params_commitment: u256,
    now_sec: u64,
    proof: vector<u8>,
    worker_ciphertext: vector<u8>,
    clock: &Clock,
) {
    // Ceiling on the prover's `now_sec` = wall clock minus any paused time, so a
    // frozen engagement can't accrue vested value while paused. `frozen_secs` is
    // 0 for engagements opened via v1 (no control field) — behaviour unchanged.
    let clock_now = clock.timestamp_ms() / 1000;
    assert!(now_sec + frozen_secs(engagement, clock_now) <= clock_now, EFutureTime);
    assert!(params_commitment == engagement.params_commitment, EParamsMismatch);
    settle_into(
        pool,
        engagement,
        root,
        nf,
        cm1,
        cm2,
        params_commitment,
        now_sec,
        proof,
        worker_ciphertext,
    );
}

fun settle_into<T>(
    pool: &mut ShieldedPool<T>,
    engagement: &PrivateEngagement,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    params_commitment: u256,
    now_sec: u64,
    proof: vector<u8>,
    worker_ciphertext: vector<u8>,
) {
    confidential_balance::verify_private_settle(
        root,
        nf,
        cm1,
        cm2,
        params_commitment,
        now_sec,
        proof,
    );
    shielded_pool::apply_private_settle(pool, root, nf, cm1, cm2);
    if (worker_ciphertext.length() > 0) {
        shielded_pool::publish_note(pool, cm1, worker_ciphertext);
    };
    event::emit(EngagementSettled {
        engagement_id: object::id(engagement),
        nullifier: nf,
        cm1,
        cm2,
    });
}

/// Exit to public coins (boundary leak: amount revealed). Thin wrapper.
public fun claim_exit<T>(
    pool: &mut ShieldedPool<T>,
    root: u256,
    nf: u256,
    amount: u64,
    cm_change: u256,
    proof: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    shielded_pool::withdraw(pool, root, nf, amount, cm_change, proof, ctx)
}

public fun params_commitment(e: &PrivateEngagement): u256 { e.params_commitment }
public fun funding_cm(e: &PrivateEngagement): u256 { e.funding_cm }

#[test_only]
public fun create_engagement_for_testing(
    params_commitment: u256,
    funding_cm: u256,
    ctx: &mut TxContext,
): PrivateEngagement {
    PrivateEngagement {
        id: object::new(ctx),
        params_commitment,
        funding_cm,
    }
}

#[test_only]
public fun share_engagement_for_testing(e: PrivateEngagement) {
    transfer::share_object(e);
}

#[test_only]
public fun add_control_for_testing(e: &mut PrivateEngagement, opener: address) {
    df::add(
        &mut e.id,
        CtrlKey {},
        EngagementControl { opener, paused: false, paused_at_sec: 0, accum_paused_sec: 0 },
    );
}

#[test_only]
public fun set_control_for_testing(
    e: &mut PrivateEngagement,
    paused: bool,
    paused_at_sec: u64,
    accum_paused_sec: u64,
) {
    let ctrl: &mut EngagementControl = df::borrow_mut(&mut e.id, CtrlKey {});
    ctrl.paused = paused;
    ctrl.paused_at_sec = paused_at_sec;
    ctrl.accum_paused_sec = accum_paused_sec;
}

#[test_only]
public fun frozen_for_testing(e: &PrivateEngagement, now_sec: u64): u64 {
    frozen_secs(e, now_sec)
}

#[test_only]
public fun settle_vested_for_testing<T>(
    pool: &mut ShieldedPool<T>,
    engagement: &PrivateEngagement,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    params_commitment: u256,
    now_sec: u64,
    proof: vector<u8>,
) {
    assert!(params_commitment == engagement.params_commitment, EParamsMismatch);
    settle_into(pool, engagement, root, nf, cm1, cm2, params_commitment, now_sec, proof, vector[]);
}
