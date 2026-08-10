/// StreamLine — lazy confidential stream (Phase 1 privacy).
///
/// A confidential stream that vests linearly — earned(t) = min(cap, rate·(t−start))
/// — and settles LAZILY: instead of a keeper (or a party) posting a transaction
/// per drip, the freelancer proves the whole vested-so-far in one `settle` call,
/// whenever they choose. No stream of drip transactions ⇒ no cadence/timing leak,
/// and no keeper is needed (a keeper can't drip a hidden stream anyway).
///
/// The reserve total is public (it's just a locked `Balance`); the remaining/earned
/// split and the schedule (rate, start, cap) stay hidden behind Poseidon
/// commitments, enforced by `lazydrip.circom` (verified on-chain via sui::groth16).
module streamline::lazy_stream;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use streamline::confidential_balance;

const EWrongState: u64 = 0;
const ENotFreelancer: u64 = 1;
const EFutureTime: u64 = 2;

const STATE_DRIPPING: u8 = 1;

/// Canonical Poseidon(0, 0) as a 32-byte LE scalar. Used to reset `earned` after
/// a full claim — post-claim the earned balance is provably zero and no longer
/// secret, so a fixed (unblinded) zero commitment is sound and needs no proof.
const ZERO_COMMITMENT: vector<u8> =
    x"6448b64684ee39a823d5fe5fd52431dc81e4817bf2c3ea3cab9e239efbf59820";

public struct LazyStream<phantom T> has key {
    id: UID,
    sender: address,
    freelancer: address,
    /// Public locked total (== cap).
    reserve: Balance<T>,
    state: u8,
    /// Poseidon commitment of the undripped balance (hidden).
    remaining_commitment: vector<u8>,
    /// Poseidon commitment of the freelancer's accrued, unclaimed balance (hidden).
    earned_commitment: vector<u8>,
    /// Poseidon(rate, start_sec, cap, blinding) — pins the vesting schedule.
    params_commitment: vector<u8>,
    /// Seal ciphertext of the openings, for the freelancer to decrypt and prove.
    encrypted_secrets: vector<u8>,
}

public struct LazyStreamCreated has copy, drop {
    stream_id: ID,
    sender: address,
    freelancer: address,
}
public struct LazySettled has copy, drop { stream_id: ID, now_sec: u64 }
public struct LazyClaimed has copy, drop { stream_id: ID, amount: u64 }

/// Open a lazy stream: lock `payment` (public total = cap), bind the hidden
/// `remaining_commitment` to the locked amount via `wrap_proof`, pin the vesting
/// schedule with `params_commitment`, and start earned at a commitment to zero.
public fun create<T>(
    payment: Coin<T>,
    freelancer: address,
    remaining_commitment: vector<u8>,
    wrap_proof: vector<u8>,
    earned_commitment: vector<u8>,
    params_commitment: vector<u8>,
    encrypted_secrets: vector<u8>,
    ctx: &mut TxContext,
) {
    confidential_balance::verify_wrap(remaining_commitment, payment.value(), wrap_proof);
    let sender = ctx.sender();
    let stream = LazyStream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        reserve: payment.into_balance(),
        state: STATE_DRIPPING,
        remaining_commitment,
        earned_commitment,
        params_commitment,
        encrypted_secrets,
    };
    let stream_id = object::id(&stream);
    event::emit(LazyStreamCreated { stream_id, sender, freelancer });
    transfer::share_object(stream);
}

/// Lazy settle: prove `earned_new ≤ min(cap, rate·(now−start))` and move a hidden
/// delta remaining→earned. `now_sec` is bound to the chain clock, so the vesting
/// bound is anchored to real time. Permissionless to submit (only a holder of the
/// openings can build the proof), so a relayer can post it to hide tx origin.
fun do_settle<T>(
    stream: &mut LazyStream<T>,
    new_remaining_commitment: vector<u8>,
    new_earned_commitment: vector<u8>,
    proof: vector<u8>,
    now_sec: u64,
) {
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    confidential_balance::verify_lazydrip(
        stream.remaining_commitment,
        new_remaining_commitment,
        stream.earned_commitment,
        new_earned_commitment,
        stream.params_commitment,
        now_sec,
        proof,
    );
    stream.remaining_commitment = new_remaining_commitment;
    stream.earned_commitment = new_earned_commitment;
    event::emit(LazySettled { stream_id: object::id(stream), now_sec });
}

/// Original signature (now_sec == exact chain clock). Kept for upgrade
/// compatibility, but the exact-clock binding races proof generation against
/// execution — prefer `settle_at`.
public fun settle<T>(
    stream: &mut LazyStream<T>,
    new_remaining_commitment: vector<u8>,
    new_earned_commitment: vector<u8>,
    proof: vector<u8>,
    clock: &Clock,
) {
    do_settle(stream, new_remaining_commitment, new_earned_commitment, proof,
        clock.timestamp_ms() / 1000);
}

/// The prover supplies `now_sec` (bound into the proof); the contract only checks
/// it is not in the future. Using the claimed time (≤ real time) only ever
/// *under*-vests, which is safe, and decouples proof generation from execution.
public fun settle_at<T>(
    stream: &mut LazyStream<T>,
    new_remaining_commitment: vector<u8>,
    new_earned_commitment: vector<u8>,
    proof: vector<u8>,
    now_sec: u64,
    clock: &Clock,
) {
    assert!(now_sec <= clock.timestamp_ms() / 1000, EFutureTime);
    do_settle(stream, new_remaining_commitment, new_earned_commitment, proof, now_sec);
}

/// Claim: the freelancer withdraws their full earned balance to cash. `unwrap_proof`
/// proves the current `earned_commitment` opens to `amount`; earned then resets to
/// the canonical zero commitment. Reveals only the total claimed at cash-out —
/// never the per-settle drips.
public fun claim<T>(
    stream: &mut LazyStream<T>,
    amount: u64,
    unwrap_proof: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == stream.freelancer, ENotFreelancer);
    confidential_balance::verify_unwrap(stream.earned_commitment, amount, unwrap_proof);
    stream.earned_commitment = ZERO_COMMITMENT;
    event::emit(LazyClaimed { stream_id: object::id(stream), amount });
    coin::from_balance(stream.reserve.split(amount), ctx)
}

// === Views ===

/// Public locked reserve (the only public amount).
public fun reserve_value<T>(stream: &LazyStream<T>): u64 { stream.reserve.value() }
public fun sender<T>(stream: &LazyStream<T>): address { stream.sender }
public fun freelancer<T>(stream: &LazyStream<T>): address { stream.freelancer }
public fun encrypted_secrets<T>(stream: &LazyStream<T>): vector<u8> { stream.encrypted_secrets }

// === Test-only ===

#[test_only]
/// Build a stream directly (bypassing the wrap proof) so `settle` can be tested
/// with a real lazydrip proof.
public fun new_for_testing<T>(
    reserve: Balance<T>,
    freelancer: address,
    remaining_commitment: vector<u8>,
    earned_commitment: vector<u8>,
    params_commitment: vector<u8>,
    ctx: &mut TxContext,
): LazyStream<T> {
    LazyStream<T> {
        id: object::new(ctx),
        sender: ctx.sender(),
        freelancer,
        reserve,
        state: STATE_DRIPPING,
        remaining_commitment,
        earned_commitment,
        params_commitment,
        encrypted_secrets: vector[],
    }
}

#[test_only]
public fun remaining_commitment<T>(s: &LazyStream<T>): vector<u8> { s.remaining_commitment }
#[test_only]
public fun earned_commitment<T>(s: &LazyStream<T>): vector<u8> { s.earned_commitment }
#[test_only]
public fun destroy_for_testing<T>(s: LazyStream<T>) {
    let LazyStream { id, reserve, .. } = s;
    id.delete();
    balance::destroy_for_testing(reserve);
}
