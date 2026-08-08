/// StreamLine — programmable milestone-gated payment streams.
///
/// A `Stream<T>` is a shared object holding a locked `Balance<T>`. Funds drip to
/// the recipient (split across destinations) only while the stream is DRIPPING,
/// which the client unlocks per milestone. The Move type system enforces the
/// state machine: every transition asserts the current state, so an illegal
/// transition aborts the whole transaction.
module streamline::stream;

use std::string::String;
use sui::address;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use std::option::{Self, Option};
use streamline::confidential_balance;
use streamline::treasury::{Self as treasury, Treasury};
use streamline::yield_vault::{Self, YieldVault};

// === State machine ===
const STATE_LOCKED: u8 = 0;
const STATE_PENDING_REVIEW: u8 = 1;
const STATE_DRIPPING: u8 = 2;
/// Mutual dispute — resume only via propose/accept_resolution.
const STATE_PAUSED: u8 = 3;
const STATE_DONE: u8 = 4;
/// Org payroll hold — sender can resume alone (distinct from dispute PAUSED).
const STATE_SUSPENDED: u8 = 5;

/// Gasless floor: 0.01 USDC = 10_000 base units (6 decimals).
const MIN_DRIP: u64 = 10_000;
/// Basis-point denominator for splits and the keeper tip.
const BPS_DENOM: u64 = 10_000;
/// Keeper tip: 1 bps of each settled amount.
const TIP_BPS: u64 = 1;

/// Dynamic-field keys (layout-compatible upgrades).
const PROPOSAL_KEY: vector<u8> = b"dispute_proposal";
/// Payroll streams funded from a treasury refund here on stop.
const TREASURY_KEY: vector<u8> = b"payroll_treasury";

// === Errors ===
const EWrongState: u64 = 0;
const ENotAuthorized: u64 = 1;
const EBadSplits: u64 = 2;
const EMilestoneTooSmall: u64 = 3;
const EBadDuration: u64 = 4;
const ENoMilestones: u64 = 5;
const ENotDue: u64 = 6;
const ENoAccess: u64 = 7;
const EWrongTreasury: u64 = 8;

// === Objects ===

/// One milestone: an amount (base units) that must be approved before it flows.
public struct Milestone has store, copy, drop {
    name: String,
    amount: u64,
}

/// One leg of the split: where a fraction of each drip is routed.
public struct SplitLeg has store, copy, drop {
    destination: address,
    weight_bps: u64,
    /// If true this leg is destined for a yield protocol (routing handled by a
    /// PTB downstream of `drip`); on-chain we still transfer the coin here.
    yield_flag: bool,
}

/// The streamed value object. Shared so a permissionless keeper can call `drip`.
public struct Stream<phantom T> has key {
    id: UID,
    sender: address,
    freelancer: address,
    balance: Balance<T>,
    total: u64,
    state: u8,
    milestones: vector<Milestone>,
    current_milestone: u64,
    /// Amount already settled within the current milestone.
    milestone_paid: u64,
    /// Total stream duration (ms). Accrual is proportional: total*elapsed/duration.
    duration_ms: u64,
    /// Computed gasless drip interval (informational; enforced by MIN_DRIP).
    drip_interval_ms: u64,
    /// Watermark for the last settlement (ms since epoch).
    last_drip_ms: u64,
    /// Review deadline for the raised milestone (ms); 0 when not pending.
    review_deadline_ms: u64,
    dispute_window_ms: u64,
    splits: vector<SplitLeg>,
}

/// Client control capability — ties the holder to exactly one stream.
public struct StreamCap has key, store {
    id: UID,
    stream_id: ID,
    revocable: bool,
}

// === Events (field names mirror the Rust indexer's parser) ===

public struct StreamCreated has copy, drop {
    stream_id: ID,
    sender: address,
    freelancer: address,
    total: u64,
    n_milestones: u64,
}

public struct MilestoneRaised has copy, drop {
    stream_id: ID,
    milestone_index: u64,
    review_deadline_ms: u64,
}

public struct MilestoneApproved has copy, drop {
    stream_id: ID,
    milestone_index: u64,
}

public struct StreamDripped has copy, drop {
    stream_id: ID,
    amount: u64,
    timestamp_ms: u64,
}

public struct StreamPaused has copy, drop {
    stream_id: ID,
}

public struct StreamSuspended has copy, drop {
    stream_id: ID,
}

public struct StreamResumed has copy, drop {
    stream_id: ID,
}

public struct StreamStopped has copy, drop {
    stream_id: ID,
    freelancer_paid: u64,
    refunded: u64,
}

/// A proposed way out of a PAUSED dispute. Mutual resolve: one party proposes,
/// the *other* party accepts identical terms — neither side can settle alone.
/// Stored in a dynamic field so it never changes the `Stream` struct layout.
public struct ResolutionProposal has store, copy, drop {
    proposer: address,
    /// true → resume the stream (back to DRIPPING); false → split the remaining
    /// locked balance and close.
    resume: bool,
    /// On a split, the bps of the remaining balance paid to the freelancer; the
    /// rest is refunded to the client. Ignored when `resume`.
    freelancer_bps: u64,
}

public struct ResolutionProposed has copy, drop {
    stream_id: ID,
    proposer: address,
    resume: bool,
    freelancer_bps: u64,
}

public struct DisputeResolved has copy, drop {
    stream_id: ID,
    resumed: bool,
    freelancer_amount: u64,
    sender_amount: u64,
}

// === Lifecycle ===

/// Lock the full amount and create a shared milestone stream. The client
/// receives a `StreamCap`. Milestone amounts must each be ≥ MIN_DRIP and sum to
/// the locked amount.
#[allow(lint(self_transfer))]
public fun create_stream<T>(
    payment: Coin<T>,
    freelancer: address,
    milestone_names: vector<String>,
    milestone_amounts: vector<u64>,
    duration_ms: u64,
    dispute_window_ms: u64,
    revocable: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0, EBadDuration);
    let n = milestone_amounts.length();
    assert!(n > 0, ENoMilestones);
    assert!(milestone_names.length() == n, ENoMilestones);

    let total = payment.value();
    let mut milestones: vector<Milestone> = vector[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let amount = milestone_amounts[i];
        assert!(amount >= MIN_DRIP, EMilestoneTooSmall);
        sum = sum + amount;
        milestones.push_back(Milestone { name: milestone_names[i], amount });
        i = i + 1;
    };
    assert!(sum == total, EBadSplits);

    let drip_interval_ms =
        ceil_div((MIN_DRIP as u128) * (duration_ms as u128), total as u128);

    let sender = ctx.sender();
    let now = clock.timestamp_ms();

    // Default split: 100% to the freelancer's wallet (they can reconfigure).
    let mut splits: vector<SplitLeg> = vector[];
    splits.push_back(SplitLeg {
        destination: freelancer,
        weight_bps: BPS_DENOM,
        yield_flag: false,
    });

    let stream = Stream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        balance: payment.into_balance(),
        total,
        // Consumer / wallet streams start dripping on fund so borrow + accrual
        // work immediately. Later milestones still re-lock after each settles.
        state: STATE_DRIPPING,
        milestones,
        current_milestone: 0,
        milestone_paid: 0,
        duration_ms,
        drip_interval_ms,
        last_drip_ms: now,
        review_deadline_ms: 0,
        dispute_window_ms,
        splits,
    };
    let stream_id = object::id(&stream);

    event::emit(StreamCreated {
        stream_id,
        sender,
        freelancer,
        total,
        n_milestones: n,
    });

    let cap = StreamCap { id: object::new(ctx), stream_id, revocable };
    transfer::public_transfer(cap, sender);
    transfer::share_object(stream);
}

/// Like `create_stream`, but bakes in an auto-yield split: `yield_bps` of each
/// drip is deposited into the yield vault (by `drip_with_yield`) and the rest is
/// paid to the freelancer as cash. Both legs target the freelancer; the yield
/// leg just routes through the vault. `yield_bps` must be < 10000.
#[allow(lint(self_transfer))]
public fun create_stream_v2<T>(
    payment: Coin<T>,
    freelancer: address,
    milestone_names: vector<String>,
    milestone_amounts: vector<u64>,
    duration_ms: u64,
    dispute_window_ms: u64,
    revocable: bool,
    yield_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0, EBadDuration);
    assert!(yield_bps < BPS_DENOM, EBadSplits);
    let n = milestone_amounts.length();
    assert!(n > 0 && milestone_names.length() == n, ENoMilestones);

    let total = payment.value();
    let mut milestones: vector<Milestone> = vector[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let amount = milestone_amounts[i];
        assert!(amount >= MIN_DRIP, EMilestoneTooSmall);
        sum = sum + amount;
        milestones.push_back(Milestone { name: milestone_names[i], amount });
        i = i + 1;
    };
    assert!(sum == total, EBadSplits);

    let drip_interval_ms =
        ceil_div((MIN_DRIP as u128) * (duration_ms as u128), total as u128);
    let sender = ctx.sender();
    let now = clock.timestamp_ms();

    let mut splits: vector<SplitLeg> = vector[];
    if (yield_bps == 0) {
        splits.push_back(SplitLeg { destination: freelancer, weight_bps: BPS_DENOM, yield_flag: false });
    } else {
        splits.push_back(SplitLeg {
            destination: freelancer, weight_bps: BPS_DENOM - yield_bps, yield_flag: false,
        });
        splits.push_back(SplitLeg { destination: freelancer, weight_bps: yield_bps, yield_flag: true });
    };

    let stream = Stream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        balance: payment.into_balance(),
        total,
        state: STATE_DRIPPING,
        milestones,
        current_milestone: 0,
        milestone_paid: 0,
        duration_ms,
        drip_interval_ms,
        last_drip_ms: now,
        review_deadline_ms: 0,
        dispute_window_ms,
        splits,
    };
    let stream_id = object::id(&stream);
    event::emit(StreamCreated { stream_id, sender, freelancer, total, n_milestones: n });
    let cap = StreamCap { id: object::new(ctx), stream_id, revocable };
    transfer::public_transfer(cap, sender);
    transfer::share_object(stream);
}

/// Like `create_stream_v2`, but the caller supplies the full payout split up
/// front: `destinations[i]` receives `weights_bps[i]` of each drip, routed to
/// the yield vault when `yield_flags[i]` is set. Weights must sum to 10000. This
/// lets a payer honor a recipient's requested multi-destination split at funding
/// time — the recipient can't call `set_splits` before the stream exists.
#[allow(lint(self_transfer))]
public fun create_stream_v3<T>(
    payment: Coin<T>,
    freelancer: address,
    milestone_names: vector<String>,
    milestone_amounts: vector<u64>,
    duration_ms: u64,
    dispute_window_ms: u64,
    revocable: bool,
    destinations: vector<address>,
    weights_bps: vector<u64>,
    yield_flags: vector<bool>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0, EBadDuration);
    let n = milestone_amounts.length();
    assert!(n > 0 && milestone_names.length() == n, ENoMilestones);
    let d = destinations.length();
    assert!(d > 0 && weights_bps.length() == d && yield_flags.length() == d, EBadSplits);

    let total = payment.value();
    let mut milestones: vector<Milestone> = vector[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let amount = milestone_amounts[i];
        assert!(amount >= MIN_DRIP, EMilestoneTooSmall);
        sum = sum + amount;
        milestones.push_back(Milestone { name: milestone_names[i], amount });
        i = i + 1;
    };
    assert!(sum == total, EBadSplits);

    let mut splits: vector<SplitLeg> = vector[];
    let mut wsum = 0;
    let mut j = 0;
    while (j < d) {
        let w = weights_bps[j];
        wsum = wsum + w;
        splits.push_back(SplitLeg {
            destination: destinations[j],
            weight_bps: w,
            yield_flag: yield_flags[j],
        });
        j = j + 1;
    };
    assert!(wsum == BPS_DENOM, EBadSplits);

    let drip_interval_ms =
        ceil_div((MIN_DRIP as u128) * (duration_ms as u128), total as u128);
    let sender = ctx.sender();
    let now = clock.timestamp_ms();

    let stream = Stream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        balance: payment.into_balance(),
        total,
        state: STATE_LOCKED,
        milestones,
        current_milestone: 0,
        milestone_paid: 0,
        duration_ms,
        drip_interval_ms,
        last_drip_ms: now,
        review_deadline_ms: 0,
        dispute_window_ms,
        splits,
    };
    let stream_id = object::id(&stream);
    event::emit(StreamCreated { stream_id, sender, freelancer, total, n_milestones: n });
    let cap = StreamCap { id: object::new(ctx), stream_id, revocable };
    transfer::public_transfer(cap, sender);
    transfer::share_object(stream);
}

/// Fund a worker stream straight from the org treasury (payroll pool → leg).
/// Pulls `sum(milestone_amounts)` from idle float, locks it into a normal
/// `create_stream_v2` stream, and tags the stream with the treasury id so
/// `stop_payroll` / `cancel_to_treasury` refund unearned capital to the pool.
/// Call `treasury::ensure_idle` in the same PTB first if capital is invested.
#[allow(lint(self_transfer))]
public fun create_stream_from_treasury_v2<T>(
    treasury_obj: &mut Treasury<T>,
    freelancer: address,
    milestone_names: vector<String>,
    milestone_amounts: vector<u64>,
    duration_ms: u64,
    dispute_window_ms: u64,
    revocable: bool,
    yield_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0, EBadDuration);
    assert!(yield_bps < BPS_DENOM, EBadSplits);
    let n = milestone_amounts.length();
    assert!(n > 0 && milestone_names.length() == n, ENoMilestones);

    let mut milestones: vector<Milestone> = vector[];
    let mut total = 0;
    let mut i = 0;
    while (i < n) {
        let amount = milestone_amounts[i];
        assert!(amount >= MIN_DRIP, EMilestoneTooSmall);
        total = total + amount;
        milestones.push_back(Milestone { name: milestone_names[i], amount });
        i = i + 1;
    };

    let payment = treasury::withdraw(treasury_obj, total, ctx);
    let drip_interval_ms =
        ceil_div((MIN_DRIP as u128) * (duration_ms as u128), total as u128);
    let sender = ctx.sender();
    let now = clock.timestamp_ms();

    let mut splits: vector<SplitLeg> = vector[];
    if (yield_bps == 0) {
        splits.push_back(SplitLeg { destination: freelancer, weight_bps: BPS_DENOM, yield_flag: false });
    } else {
        splits.push_back(SplitLeg {
            destination: freelancer, weight_bps: BPS_DENOM - yield_bps, yield_flag: false,
        });
        splits.push_back(SplitLeg { destination: freelancer, weight_bps: yield_bps, yield_flag: true });
    };

    let mut stream = Stream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        balance: payment.into_balance(),
        total,
        // Payroll legs accrue immediately (no milestone raise gate).
        state: STATE_DRIPPING,
        milestones,
        current_milestone: 0,
        milestone_paid: 0,
        duration_ms,
        drip_interval_ms,
        last_drip_ms: now,
        review_deadline_ms: 0,
        dispute_window_ms,
        splits,
    };
    let stream_id = object::id(&stream);
    df::add(&mut stream.id, TREASURY_KEY, object::id(treasury_obj));
    event::emit(StreamCreated { stream_id, sender, freelancer, total, n_milestones: n });
    let cap = StreamCap { id: object::new(ctx), stream_id, revocable };
    transfer::public_transfer(cap, sender);
    transfer::share_object(stream);
}

#[test_only]
/// A LOCKED milestone stream with the default 100%→freelancer split. v1/v2
/// `create_stream` now start DRIPPING (consumer/wallet streams), so tests that
/// exercise the locked → raise_completion → review flow use this instead.
public fun create_locked_stream_for_testing<T>(
    payment: Coin<T>,
    freelancer: address,
    milestone_names: vector<String>,
    milestone_amounts: vector<u64>,
    duration_ms: u64,
    dispute_window_ms: u64,
    revocable: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    create_stream_v3<T>(
        payment,
        freelancer,
        milestone_names,
        milestone_amounts,
        duration_ms,
        dispute_window_ms,
        revocable,
        vector[freelancer],
        vector[BPS_DENOM],
        vector[false],
        clock,
        ctx,
    );
}

/// Freelancer reconfigures where each drip is routed. Weights must sum to 10000.
public fun set_splits<T>(
    stream: &mut Stream<T>,
    destinations: vector<address>,
    weights_bps: vector<u64>,
    yield_flags: vector<bool>,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == stream.freelancer, ENotAuthorized);
    let n = destinations.length();
    assert!(
        n > 0 && weights_bps.length() == n && yield_flags.length() == n,
        EBadSplits,
    );
    let mut splits: vector<SplitLeg> = vector[];
    let mut sum = 0;
    let mut i = 0;
    while (i < n) {
        let weight_bps = weights_bps[i];
        sum = sum + weight_bps;
        splits.push_back(SplitLeg {
            destination: destinations[i],
            weight_bps,
            yield_flag: yield_flags[i],
        });
        i = i + 1;
    };
    assert!(sum == BPS_DENOM, EBadSplits);
    stream.splits = splits;
}

/// Freelancer signals the current milestone is complete; starts the review clock.
public fun raise_completion<T>(stream: &mut Stream<T>, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_LOCKED, EWrongState);
    let deadline = clock.timestamp_ms() + stream.dispute_window_ms;
    stream.state = STATE_PENDING_REVIEW;
    stream.review_deadline_ms = deadline;
    event::emit(MilestoneRaised {
        stream_id: object::id(stream),
        milestone_index: stream.current_milestone,
        review_deadline_ms: deadline,
    });
}

/// Client approves the raised milestone (via the cap); dripping begins.
public fun approve_milestone<T>(cap: &StreamCap, stream: &mut Stream<T>, clock: &Clock) {
    assert!(cap.stream_id == object::id(stream), ENotAuthorized);
    assert!(stream.state == STATE_PENDING_REVIEW, EWrongState);
    stream.state = STATE_DRIPPING;
    stream.last_drip_ms = clock.timestamp_ms();
    stream.review_deadline_ms = 0;
    event::emit(MilestoneApproved {
        stream_id: object::id(stream),
        milestone_index: stream.current_milestone,
    });
}

/// Payer-side start for a funded stream: move a LOCKED (or PENDING_REVIEW)
/// stream straight to DRIPPING via the `StreamCap`. Payroll streams are funded
/// by the org up front, so the org that holds the cap starts them — no
/// freelancer `raise_completion` / review handshake required. Emits the same
/// `MilestoneApproved` the indexer already maps to DRIPPING.
public fun start_payroll<T>(cap: &StreamCap, stream: &mut Stream<T>, clock: &Clock) {
    assert!(cap.stream_id == object::id(stream), ENotAuthorized);
    assert!(
        stream.state == STATE_LOCKED || stream.state == STATE_PENDING_REVIEW,
        EWrongState,
    );
    stream.state = STATE_DRIPPING;
    stream.last_drip_ms = clock.timestamp_ms();
    stream.review_deadline_ms = 0;
    event::emit(MilestoneApproved {
        stream_id: object::id(stream),
        milestone_index: stream.current_milestone,
    });
}

/// Keeper auto-approves once the review deadline passes — silence ≠ blocking pay.
public fun auto_approve<T>(stream: &mut Stream<T>, clock: &Clock) {
    assert!(stream.state == STATE_PENDING_REVIEW, EWrongState);
    let now = clock.timestamp_ms();
    assert!(now >= stream.review_deadline_ms, ENotDue);
    stream.state = STATE_DRIPPING;
    stream.last_drip_ms = now;
    stream.review_deadline_ms = 0;
    event::emit(MilestoneApproved {
        stream_id: object::id(stream),
        milestone_index: stream.current_milestone,
    });
}

/// Permissionless settlement. Pays out the amount accrued since the last drip
/// (≥ MIN_DRIP), split across destinations, minus a 1 bps keeper tip to the
/// caller. Locks when the current milestone is fully paid.
#[allow(lint(self_transfer))]
public fun drip<T>(stream: &mut Stream<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    let now = clock.timestamp_ms();
    let elapsed = now - stream.last_drip_ms;
    let accrued =
        (((stream.total as u128) * (elapsed as u128)) / (stream.duration_ms as u128)) as u64;

    let milestone_amount = stream.milestones[stream.current_milestone].amount;
    let milestone_remaining = milestone_amount - stream.milestone_paid;

    let mut pay = accrued;
    if (pay > milestone_remaining) pay = milestone_remaining;
    let bal = stream.balance.value();
    if (pay > bal) pay = bal;
    assert!(pay >= MIN_DRIP, ENotDue);

    let tip = pay * TIP_BPS / BPS_DENOM;
    let distributable = pay - tip;

    let n = stream.splits.length();
    let mut distributed = 0;
    let mut i = 0;
    while (i < n) {
        let leg = stream.splits[i]; // SplitLeg has copy — no lingering borrow
        let amount = if (i + 1 == n) {
            distributable - distributed
        } else {
            ((distributable as u128) * (leg.weight_bps as u128) / (BPS_DENOM as u128)) as u64
        };
        distributed = distributed + amount;
        if (amount > 0) {
            let part = stream.balance.split(amount);
            // Production: the gasless Address Balances `send_funds` path runs here.
            transfer::public_transfer(coin::from_balance(part, ctx), leg.destination);
        };
        i = i + 1;
    };
    if (tip > 0) {
        let part = stream.balance.split(tip);
        transfer::public_transfer(coin::from_balance(part, ctx), ctx.sender());
    };

    stream.milestone_paid = stream.milestone_paid + pay;
    stream.last_drip_ms = now;
    event::emit(StreamDripped {
        stream_id: object::id(stream),
        amount: pay,
        timestamp_ms: now,
    });

    if (stream.milestone_paid >= milestone_amount) {
        stream.milestone_paid = 0;
        stream.current_milestone = stream.current_milestone + 1;
        if (stream.current_milestone >= stream.milestones.length()) {
            stream.state = STATE_DONE;
        } else {
            stream.state = STATE_LOCKED;
        };
    };
}

/// Settlement that auto-invests yield-flagged split legs: identical to `drip`,
/// but a leg with `yield_flag` is deposited into `vault` and the resulting
/// `VaultReceipt` is sent to the leg destination (the freelancer) instead of
/// cash. The keeper calls this (passing the coin's vault) so the configured
/// yield % compounds automatically on every drip.
#[allow(lint(self_transfer))]
public fun drip_with_yield<T>(
    stream: &mut Stream<T>,
    vault: &mut YieldVault<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    let now = clock.timestamp_ms();
    let elapsed = now - stream.last_drip_ms;
    let accrued =
        (((stream.total as u128) * (elapsed as u128)) / (stream.duration_ms as u128)) as u64;
    let milestone_amount = stream.milestones[stream.current_milestone].amount;
    let milestone_remaining = milestone_amount - stream.milestone_paid;
    let mut pay = accrued;
    if (pay > milestone_remaining) pay = milestone_remaining;
    let bal = stream.balance.value();
    if (pay > bal) pay = bal;
    assert!(pay >= MIN_DRIP, ENotDue);

    let tip = pay * TIP_BPS / BPS_DENOM;
    let distributable = pay - tip;

    let n = stream.splits.length();
    let mut distributed = 0;
    let mut i = 0;
    while (i < n) {
        let leg = stream.splits[i];
        let amount = if (i + 1 == n) {
            distributable - distributed
        } else {
            ((distributable as u128) * (leg.weight_bps as u128) / (BPS_DENOM as u128)) as u64
        };
        distributed = distributed + amount;
        if (amount > 0) {
            let part = coin::from_balance(stream.balance.split(amount), ctx);
            if (leg.yield_flag) {
                let receipt = yield_vault::deposit(vault, part, clock, ctx);
                transfer::public_transfer(receipt, leg.destination);
            } else {
                transfer::public_transfer(part, leg.destination);
            };
        };
        i = i + 1;
    };
    if (tip > 0) {
        let part = stream.balance.split(tip);
        transfer::public_transfer(coin::from_balance(part, ctx), ctx.sender());
    };

    stream.milestone_paid = stream.milestone_paid + pay;
    stream.last_drip_ms = now;
    event::emit(StreamDripped { stream_id: object::id(stream), amount: pay, timestamp_ms: now });

    if (stream.milestone_paid >= milestone_amount) {
        stream.milestone_paid = 0;
        stream.current_milestone = stream.current_milestone + 1;
        if (stream.current_milestone >= stream.milestones.length()) {
            stream.state = STATE_DONE;
        } else {
            stream.state = STATE_LOCKED;
        };
    };
}

/// Either party pauses a pending/dripping stream pending arbitration.
public fun raise_dispute<T>(stream: &mut Stream<T>, ctx: &TxContext) {
    let s = ctx.sender();
    assert!(s == stream.sender || s == stream.freelancer, ENotAuthorized);
    assert!(
        stream.state == STATE_PENDING_REVIEW || stream.state == STATE_DRIPPING,
        EWrongState,
    );
    stream.state = STATE_PAUSED;
    event::emit(StreamPaused { stream_id: object::id(stream) });
}

/// Org payroll hold (sender only). Settles accrued earnings first, then freezes
/// so suspended time does not accrue. Resume does not need counterparty consent
/// (unlike dispute `STATE_PAUSED`).
public fun suspend_payroll<T>(
    stream: &mut Stream<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(
        stream.state == STATE_PENDING_REVIEW || stream.state == STATE_DRIPPING,
        EWrongState,
    );
    if (stream.state == STATE_DRIPPING) {
        settle_accrued_to_freelancer(stream, clock, ctx);
    };
    // Fully settled during the accrual flush — nothing left to hold.
    if (stream.state == STATE_DONE) {
        event::emit(StreamSuspended { stream_id: object::id(stream) });
        return
    };
    stream.state = STATE_SUSPENDED;
    event::emit(StreamSuspended { stream_id: object::id(stream) });
}

/// Org resumes a suspended payroll stream (sender only).
public fun resume_payroll<T>(stream: &mut Stream<T>, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(stream.state == STATE_SUSPENDED, EWrongState);
    stream.state = STATE_DRIPPING;
    stream.last_drip_ms = clock.timestamp_ms();
    stream.review_deadline_ms = 0;
    event::emit(StreamResumed { stream_id: object::id(stream) });
}

/// Permanent stop for a treasury-funded stream: settle accrued to the worker,
/// refund the rest to the payroll pool. Worker keeps everything already paid.
public fun stop_payroll<T>(
    stream: &mut Stream<T>,
    treasury_obj: &mut Treasury<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(
        stream.state == STATE_LOCKED
            || stream.state == STATE_PENDING_REVIEW
            || stream.state == STATE_DRIPPING
            || stream.state == STATE_SUSPENDED,
        EWrongState,
    );
    assert!(df::exists(&stream.id, TREASURY_KEY), EWrongTreasury);
    let tid: ID = *df::borrow(&stream.id, TREASURY_KEY);
    assert!(tid == object::id(treasury_obj), EWrongTreasury);

    let mut paid = 0;
    if (stream.state == STATE_DRIPPING) {
        paid = settle_accrued_to_freelancer(stream, clock, ctx);
    };

    let refunded = stream.balance.value();
    if (refunded > 0) {
        let part = stream.balance.split(refunded);
        treasury::deposit(treasury_obj, coin::from_balance(part, ctx));
    };
    stream.state = STATE_DONE;
    event::emit(StreamStopped {
        stream_id: object::id(stream),
        freelancer_paid: paid,
        refunded,
    });
}

/// Permanent stop for a wallet-funded stream: settle accrued, refund remainder
/// to the sender wallet.
public fun stop_stream<T>(
    stream: &mut Stream<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(
        stream.state == STATE_LOCKED
            || stream.state == STATE_PENDING_REVIEW
            || stream.state == STATE_DRIPPING
            || stream.state == STATE_SUSPENDED,
        EWrongState,
    );
    assert!(!df::exists(&stream.id, TREASURY_KEY), EWrongTreasury);

    let mut paid = 0;
    if (stream.state == STATE_DRIPPING) {
        paid = settle_accrued_to_freelancer(stream, clock, ctx);
    };

    let refunded = stream.balance.value();
    if (refunded > 0) {
        let part = stream.balance.split(refunded);
        transfer::public_transfer(coin::from_balance(part, ctx), stream.sender);
    };
    stream.state = STATE_DONE;
    event::emit(StreamStopped {
        stream_id: object::id(stream),
        freelancer_paid: paid,
        refunded,
    });
}

/// Client cancels a revocable stream and reclaims the unstreamed balance.
public fun cancel<T>(cap: StreamCap, stream: &mut Stream<T>, ctx: &mut TxContext) {
    assert!(cap.stream_id == object::id(stream), ENotAuthorized);
    assert!(cap.revocable, ENotAuthorized);
    let amount = stream.balance.value();
    if (amount > 0) {
        let refund = stream.balance.split(amount);
        transfer::public_transfer(coin::from_balance(refund, ctx), stream.sender);
    };
    stream.state = STATE_DONE;
    let StreamCap { id, stream_id: _, revocable: _ } = cap;
    id.delete();
}

/// Like `cancel`, but refunds unstreamed balance into the payroll treasury that
/// originally funded the stream.
public fun cancel_to_treasury<T>(
    cap: StreamCap,
    stream: &mut Stream<T>,
    treasury_obj: &mut Treasury<T>,
    ctx: &mut TxContext,
) {
    assert!(cap.stream_id == object::id(stream), ENotAuthorized);
    assert!(cap.revocable, ENotAuthorized);
    assert!(df::exists(&stream.id, TREASURY_KEY), EWrongTreasury);
    let tid: ID = *df::borrow(&stream.id, TREASURY_KEY);
    assert!(tid == object::id(treasury_obj), EWrongTreasury);
    let amount = stream.balance.value();
    if (amount > 0) {
        let refund = stream.balance.split(amount);
        treasury::deposit(treasury_obj, coin::from_balance(refund, ctx));
    };
    stream.state = STATE_DONE;
    let StreamCap { id, stream_id: _, revocable: _ } = cap;
    id.delete();
}

// === Dispute resolution (mutual) ===

/// Propose how to end a dispute on a PAUSED stream — either resume it, or split
/// the remaining locked balance (`freelancer_bps` to the freelancer, the rest
/// refunded to the client). Overwrites any prior proposal. The counterparty must
/// `accept_resolution` for it to take effect.
public fun propose_resolution<T>(
    stream: &mut Stream<T>,
    resume: bool,
    freelancer_bps: u64,
    ctx: &TxContext,
) {
    let who = ctx.sender();
    assert!(who == stream.sender || who == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_PAUSED, EWrongState);
    assert!(resume || freelancer_bps <= BPS_DENOM, EBadSplits);
    let proposal = ResolutionProposal { proposer: who, resume, freelancer_bps };
    if (df::exists(&stream.id, PROPOSAL_KEY)) {
        *df::borrow_mut(&mut stream.id, PROPOSAL_KEY) = proposal;
    } else {
        df::add(&mut stream.id, PROPOSAL_KEY, proposal);
    };
    event::emit(ResolutionProposed {
        stream_id: object::id(stream),
        proposer: who,
        resume,
        freelancer_bps,
    });
}

/// Accept the counterparty's pending proposal, executing the agreed resolution.
/// The accepter must be the *other* party — agreement needs both sides.
public fun accept_resolution<T>(
    stream: &mut Stream<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let who = ctx.sender();
    assert!(who == stream.sender || who == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_PAUSED, EWrongState);
    assert!(df::exists(&stream.id, PROPOSAL_KEY), EWrongState);
    let proposal: ResolutionProposal = df::remove(&mut stream.id, PROPOSAL_KEY);
    assert!(who != proposal.proposer, ENotAuthorized);

    if (proposal.resume) {
        stream.state = STATE_DRIPPING;
        // Don't retroactively pay for the paused gap: reset the watermark to now.
        stream.last_drip_ms = clock.timestamp_ms();
        event::emit(DisputeResolved {
            stream_id: object::id(stream),
            resumed: true,
            freelancer_amount: 0,
            sender_amount: 0,
        });
    } else {
        let total = stream.balance.value();
        let to_freelancer = mul_bps(total, proposal.freelancer_bps);
        if (to_freelancer > 0) {
            let part = stream.balance.split(to_freelancer);
            transfer::public_transfer(coin::from_balance(part, ctx), stream.freelancer);
        };
        let to_sender = stream.balance.value();
        if (to_sender > 0) {
            let part = stream.balance.split(to_sender);
            transfer::public_transfer(coin::from_balance(part, ctx), stream.sender);
        };
        stream.state = STATE_DONE;
        event::emit(DisputeResolved {
            stream_id: object::id(stream),
            resumed: false,
            freelancer_amount: to_freelancer,
            sender_amount: to_sender,
        });
    }
}

/// Whether a stream currently has a pending resolution proposal.
public fun has_proposal<T>(stream: &Stream<T>): bool {
    df::exists(&stream.id, PROPOSAL_KEY)
}

// === Views ===

public fun state<T>(s: &Stream<T>): u8 { s.state }

public fun is_dripping<T>(s: &Stream<T>): bool { s.state == STATE_DRIPPING }

public fun is_suspended<T>(s: &Stream<T>): bool { s.state == STATE_SUSPENDED }

public fun payroll_treasury_id<T>(s: &Stream<T>): Option<ID> {
    if (df::exists(&s.id, TREASURY_KEY)) {
        option::some(*df::borrow(&s.id, TREASURY_KEY))
    } else {
        option::none()
    }
}

public fun remaining<T>(s: &Stream<T>): u64 { s.balance.value() }

public fun current_milestone<T>(s: &Stream<T>): u64 { s.current_milestone }

public fun drip_interval_ms<T>(s: &Stream<T>): u64 { s.drip_interval_ms }

public fun total<T>(s: &Stream<T>): u64 { s.total }

// === Helpers ===

fun ceil_div(a: u128, b: u128): u64 {
    (((a + b - 1) / b) as u64)
}

/// `amount * bps / 10_000`, computed in u128 to avoid overflow.
fun mul_bps(amount: u64, bps: u64): u64 {
    (((amount as u128) * (bps as u128) / (BPS_DENOM as u128)) as u64)
}

/// Pay accrued-since-last-drip to the freelancer (no keeper tip). Used by
/// suspend/stop so earned time is never clawed back. Caps at milestone remainder
/// and locked balance. Returns 0 when nothing ≥ MIN_DRIP is due.
fun settle_accrued_to_freelancer<T>(
    stream: &mut Stream<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): u64 {
    if (stream.state != STATE_DRIPPING) return 0;
    if (stream.current_milestone >= stream.milestones.length()) return 0;

    let now = clock.timestamp_ms();
    let elapsed = now - stream.last_drip_ms;
    let accrued =
        (((stream.total as u128) * (elapsed as u128)) / (stream.duration_ms as u128)) as u64;
    let milestone_amount = stream.milestones[stream.current_milestone].amount;
    let milestone_remaining = milestone_amount - stream.milestone_paid;
    let mut pay = accrued;
    if (pay > milestone_remaining) pay = milestone_remaining;
    let bal = stream.balance.value();
    if (pay > bal) pay = bal;
    if (pay < MIN_DRIP) {
        // Still advance watermark so suspend doesn't leave a dangling accrual.
        stream.last_drip_ms = now;
        return 0
    };

    let part = stream.balance.split(pay);
    transfer::public_transfer(coin::from_balance(part, ctx), stream.freelancer);
    stream.milestone_paid = stream.milestone_paid + pay;
    stream.last_drip_ms = now;
    event::emit(StreamDripped {
        stream_id: object::id(stream),
        amount: pay,
        timestamp_ms: now,
    });

    if (stream.milestone_paid >= milestone_amount) {
        stream.milestone_paid = 0;
        stream.current_milestone = stream.current_milestone + 1;
        if (stream.current_milestone >= stream.milestones.length()) {
            stream.state = STATE_DONE;
        } else {
            stream.state = STATE_LOCKED;
        };
    };
    pay
}

// === Confidential streaming (amounts hidden via Groth16) ===
//
// The same milestone-gated model, but the per-drip amounts, the remaining
// balance, and the freelancer's earned balance are hidden. The locked `reserve`
// holds real funds (public in aggregate); the hidden balances are Poseidon
// commitments updated only via proofs verified by `confidential_balance`
// (transfer.circom / wrap.circom / unwrap.circom). A keeper advances drips with
// the pre-proven schedule; the freelancer claims by revealing only what they
// withdraw. See contracts/sources/confidential_balance.move and circuits/.

public struct ConfidentialStream<phantom T> has key {
    id: UID,
    sender: address,
    freelancer: address,
    reserve: Balance<T>,
    state: u8,
    n_milestones: u64,
    current_milestone: u64,
    dispute_window_ms: u64,
    /// Poseidon commitment of the undripped stream balance (hidden).
    remaining_commitment: vector<u8>,
    /// Poseidon commitment of the freelancer's accrued, unclaimed balance (hidden).
    earned_commitment: vector<u8>,
}

public struct ConfStreamCreated has copy, drop {
    stream_id: ID,
    sender: address,
    freelancer: address,
    n_milestones: u64,
}

public struct ConfMilestoneRaised has copy, drop {
    stream_id: ID,
    milestone_index: u64,
    review_deadline_ms: u64,
}

public struct ConfMilestoneApproved has copy, drop {
    stream_id: ID,
    milestone_index: u64,
}

public struct ConfSecretsUpdated has copy, drop {
    stream_id: ID,
}

public struct ConfStreamDripped has copy, drop {
    stream_id: ID,
    timestamp_ms: u64,
}

public struct ConfStreamClaimed has copy, drop {
    stream_id: ID,
    amount: u64, // revealed only at cash-out
}

/// Open a confidential stream: lock `payment`, bind the locked amount to the
/// hidden `remaining_commitment` (proven by `wrap_proof`), and set the
/// freelancer's initial `earned_commitment` (a commitment to zero). The client
/// receives a `StreamCap`.
#[allow(lint(self_transfer))]
public fun create_confidential_stream<T>(
    payment: Coin<T>,
    freelancer: address,
    n_milestones: u64,
    remaining_commitment: vector<u8>,
    wrap_proof: vector<u8>,
    earned_commitment: vector<u8>,
    dispute_window_ms: u64,
    ctx: &mut TxContext,
) {
    new_confidential_stream(
        payment,
        freelancer,
        n_milestones,
        remaining_commitment,
        wrap_proof,
        earned_commitment,
        dispute_window_ms,
        vector[],
        option::none(),
        ctx,
    );
}

/// Like `create_confidential_stream`, but also attaches `encrypted_secrets`: a
/// Seal ciphertext of the stream's values + blindings, encrypted to both
/// parties' wallet identities so the freelancer (a different wallet) can
/// decrypt and act. Decryption is gated by `seal_approve` below.
#[allow(lint(self_transfer))]
public fun create_confidential_stream_v2<T>(
    payment: Coin<T>,
    freelancer: address,
    n_milestones: u64,
    remaining_commitment: vector<u8>,
    wrap_proof: vector<u8>,
    earned_commitment: vector<u8>,
    dispute_window_ms: u64,
    encrypted_secrets: vector<u8>,
    ctx: &mut TxContext,
) {
    new_confidential_stream(
        payment,
        freelancer,
        n_milestones,
        remaining_commitment,
        wrap_proof,
        earned_commitment,
        dispute_window_ms,
        encrypted_secrets,
        option::none(),
        ctx,
    );
}

/// Privacy-preserving payroll hire: fund a confidential stream from the org
/// treasury. Amount stays hidden (wrap proof); capital still leaves the pool.
#[allow(lint(self_transfer))]
public fun create_confidential_stream_from_treasury_v2<T>(
    treasury_obj: &mut Treasury<T>,
    amount: u64,
    freelancer: address,
    n_milestones: u64,
    remaining_commitment: vector<u8>,
    wrap_proof: vector<u8>,
    earned_commitment: vector<u8>,
    dispute_window_ms: u64,
    encrypted_secrets: vector<u8>,
    ctx: &mut TxContext,
) {
    let payment = treasury::withdraw(treasury_obj, amount, ctx);
    new_confidential_stream(
        payment,
        freelancer,
        n_milestones,
        remaining_commitment,
        wrap_proof,
        earned_commitment,
        dispute_window_ms,
        encrypted_secrets,
        option::some(object::id(treasury_obj)),
        ctx,
    );
}

#[allow(lint(self_transfer))]
fun new_confidential_stream<T>(
    payment: Coin<T>,
    freelancer: address,
    n_milestones: u64,
    remaining_commitment: vector<u8>,
    wrap_proof: vector<u8>,
    earned_commitment: vector<u8>,
    dispute_window_ms: u64,
    encrypted_secrets: vector<u8>,
    treasury_id: Option<ID>,
    ctx: &mut TxContext,
) {
    assert!(n_milestones > 0, ENoMilestones);
    // The locked amount must equal the hidden remaining balance.
    confidential_balance::verify_wrap(remaining_commitment, payment.value(), wrap_proof);

    let sender = ctx.sender();
    let mut stream = ConfidentialStream<T> {
        id: object::new(ctx),
        sender,
        freelancer,
        reserve: payment.into_balance(),
        state: STATE_DRIPPING,
        n_milestones,
        current_milestone: 0,
        dispute_window_ms,
        remaining_commitment,
        earned_commitment,
    };
    if (encrypted_secrets.length() > 0) {
        set_secrets(&mut stream, encrypted_secrets);
    };
    if (option::is_some(&treasury_id)) {
        df::add(&mut stream.id, TREASURY_KEY, option::destroy_some(treasury_id));
    } else {
        option::destroy_none(treasury_id);
    };
    let stream_id = object::id(&stream);
    event::emit(ConfStreamCreated { stream_id, sender, freelancer, n_milestones });

    let cap = StreamCap { id: object::new(ctx), stream_id, revocable: true };
    transfer::public_transfer(cap, sender);
    transfer::share_object(stream);
}

/// Permissionless confidential drip: move a hidden delta from the stream's
/// remaining balance to the freelancer's earned balance. `transfer_proof`
/// (transfer.circom) enforces conservation + no underflow against the current
/// commitments; the delta is never revealed.
public fun confidential_drip<T>(
    stream: &mut ConfidentialStream<T>,
    new_remaining_commitment: vector<u8>,
    new_earned_commitment: vector<u8>,
    transfer_proof: vector<u8>,
    clock: &Clock,
) {
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    confidential_balance::verify_transfer(
        stream.remaining_commitment,
        new_remaining_commitment,
        stream.earned_commitment,
        new_earned_commitment,
        transfer_proof,
    );
    stream.remaining_commitment = new_remaining_commitment;
    stream.earned_commitment = new_earned_commitment;
    event::emit(ConfStreamDripped {
        stream_id: object::id(stream),
        timestamp_ms: clock.timestamp_ms(),
    });
}

/// `confidential_drip` + refresh of the Seal-encrypted secrets blob. Drips
/// rotate the blindings, so the dripper (who must know the openings to build a
/// valid proof) re-encrypts the new secrets for both parties in the same tx —
/// the other party never sees a stale ciphertext.
public fun confidential_drip_v2<T>(
    stream: &mut ConfidentialStream<T>,
    new_remaining_commitment: vector<u8>,
    new_earned_commitment: vector<u8>,
    transfer_proof: vector<u8>,
    encrypted_secrets: vector<u8>,
    clock: &Clock,
) {
    confidential_drip(
        stream,
        new_remaining_commitment,
        new_earned_commitment,
        transfer_proof,
        clock,
    );
    set_secrets(stream, encrypted_secrets);
}

/// Freelancer claims `amount` of earnings: proves it opens the current earned
/// commitment (`unwrap_proof`), withdraws from the reserve, and resets earned to
/// `reset_commitment` (their fresh remainder/zero commitment).
public fun claim<T>(
    stream: &mut ConfidentialStream<T>,
    amount: u64,
    unwrap_proof: vector<u8>,
    reset_commitment: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == stream.freelancer, ENotAuthorized);
    confidential_balance::verify_unwrap(stream.earned_commitment, amount, unwrap_proof);
    assert!(stream.reserve.value() >= amount, ENotDue);
    stream.earned_commitment = reset_commitment;
    if (stream.reserve.value() == amount) {
        // Everything locked has been cashed out — the stream is settled.
        stream.state = STATE_DONE;
    };
    event::emit(ConfStreamClaimed { stream_id: object::id(stream), amount });
    coin::from_balance(stream.reserve.split(amount), ctx)
}

// === Confidential milestone review ===
//
// Milestone boundaries are hidden (amounts are commitments), so the contract
// can't detect "allocation fully dripped" like the public flow does. Instead
// the parties drive it: the freelancer raises when work is done (drips pause),
// the client approves (drips resume, milestone counter advances). The review
// deadline lives in a dynamic field so the keeper can auto-approve silence.

/// Freelancer signals the current milestone is complete; drips pause for review.
public fun conf_raise_completion<T>(
    stream: &mut ConfidentialStream<T>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    let deadline = clock.timestamp_ms() + stream.dispute_window_ms;
    stream.state = STATE_PENDING_REVIEW;
    set_review_deadline(stream, deadline);
    event::emit(ConfMilestoneRaised {
        stream_id: object::id(stream),
        milestone_index: stream.current_milestone,
        review_deadline_ms: deadline,
    });
}

/// Client approves the raised milestone (via the cap); dripping resumes.
public fun conf_approve_milestone<T>(cap: &StreamCap, stream: &mut ConfidentialStream<T>) {
    assert!(cap.stream_id == object::id(stream), ENotAuthorized);
    conf_approve_internal(stream);
}

/// Keeper auto-approves once the review deadline passes — silence ≠ blocking pay.
public fun conf_auto_approve<T>(stream: &mut ConfidentialStream<T>, clock: &Clock) {
    assert!(stream.state == STATE_PENDING_REVIEW, EWrongState);
    let deadline = review_deadline(stream);
    assert!(deadline > 0 && clock.timestamp_ms() >= deadline, ENotDue);
    conf_approve_internal(stream);
}

fun conf_approve_internal<T>(stream: &mut ConfidentialStream<T>) {
    assert!(stream.state == STATE_PENDING_REVIEW, EWrongState);
    let index = stream.current_milestone;
    stream.state = STATE_DRIPPING;
    if (stream.current_milestone < stream.n_milestones) {
        stream.current_milestone = stream.current_milestone + 1;
    };
    set_review_deadline(stream, 0);
    event::emit(ConfMilestoneApproved {
        stream_id: object::id(stream),
        milestone_index: index,
    });
}

// === Seal integration ===
//
// The stream's hidden values + blindings are encrypted client-side with Seal
// (threshold IBE) under each party's *wallet identity* and stored on the
// stream object. Key servers grant decryption only if `seal_approve` passes:
// the requesting wallet must be the identity the blob was encrypted to. This
// is how a freelancer on a different wallet learns the secrets they need to
// drip/claim/raise.

/// Seal access policy: identity = the requester's own address bytes.
entry fun seal_approve(id: vector<u8>, ctx: &TxContext) {
    check_seal_access(id, ctx);
}

fun check_seal_access(id: vector<u8>, ctx: &TxContext) {
    assert!(id == address::to_bytes(ctx.sender()), ENoAccess);
}

#[test_only]
public fun seal_approve_for_testing(id: vector<u8>, ctx: &TxContext) {
    check_seal_access(id, ctx);
}

/// Either party replaces the encrypted secrets blob (e.g. re-encrypting after
/// recovering from a missed rotation).
public fun update_confidential_secrets<T>(
    stream: &mut ConfidentialStream<T>,
    encrypted_secrets: vector<u8>,
    ctx: &TxContext,
) {
    let s = ctx.sender();
    assert!(s == stream.sender || s == stream.freelancer, ENotAuthorized);
    set_secrets(stream, encrypted_secrets);
}

// Dynamic-field keys (the struct layout is frozen by upgrade compatibility,
// so post-v2 state lives in dynamic fields).
const SECRETS_KEY: vector<u8> = b"seal_secrets";
const REVIEW_KEY: vector<u8> = b"review_deadline_ms";

fun set_secrets<T>(stream: &mut ConfidentialStream<T>, blob: vector<u8>) {
    if (df::exists(&stream.id, SECRETS_KEY)) {
        *df::borrow_mut(&mut stream.id, SECRETS_KEY) = blob;
    } else {
        df::add(&mut stream.id, SECRETS_KEY, blob);
    };
    event::emit(ConfSecretsUpdated { stream_id: object::id(stream) });
}

fun set_review_deadline<T>(stream: &mut ConfidentialStream<T>, deadline: u64) {
    if (df::exists(&stream.id, REVIEW_KEY)) {
        *df::borrow_mut(&mut stream.id, REVIEW_KEY) = deadline;
    } else {
        df::add(&mut stream.id, REVIEW_KEY, deadline);
    };
}

/// Either party pauses a confidential stream pending arbitration.
public fun confidential_dispute<T>(stream: &mut ConfidentialStream<T>, ctx: &TxContext) {
    let s = ctx.sender();
    assert!(s == stream.sender || s == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_DRIPPING, EWrongState);
    stream.state = STATE_PAUSED;
    event::emit(StreamPaused { stream_id: object::id(stream) });
}

/// Org payroll hold on a confidential stream (sender only). Drips freeze;
/// freelancer can still `claim` already-earned (hidden) balances.
public fun conf_suspend_payroll<T>(stream: &mut ConfidentialStream<T>, ctx: &TxContext) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(
        stream.state == STATE_DRIPPING || stream.state == STATE_PENDING_REVIEW,
        EWrongState,
    );
    stream.state = STATE_SUSPENDED;
    event::emit(StreamSuspended { stream_id: object::id(stream) });
}

/// Org resumes a suspended confidential payroll stream.
public fun conf_resume_payroll<T>(stream: &mut ConfidentialStream<T>, ctx: &TxContext) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(stream.state == STATE_SUSPENDED, EWrongState);
    stream.state = STATE_DRIPPING;
    set_review_deadline(stream, 0);
    event::emit(StreamResumed { stream_id: object::id(stream) });
}

/// After a confidential suspend/stop intent: refund unearned remainder to the
/// payroll treasury. Requires an unwrap proof of `remaining_commitment` so the
/// amount stays private until this cash-out. Freelancer should `claim` earned
/// first; this only burns the remaining commitment.
public fun conf_refund_remainder_to_treasury<T>(
    stream: &mut ConfidentialStream<T>,
    treasury_obj: &mut Treasury<T>,
    amount: u64,
    unwrap_proof: vector<u8>,
    reset_commitment: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == stream.sender, ENotAuthorized);
    assert!(stream.state == STATE_SUSPENDED, EWrongState);
    assert!(df::exists(&stream.id, TREASURY_KEY), EWrongTreasury);
    let tid: ID = *df::borrow(&stream.id, TREASURY_KEY);
    assert!(tid == object::id(treasury_obj), EWrongTreasury);
    confidential_balance::verify_unwrap(stream.remaining_commitment, amount, unwrap_proof);
    assert!(stream.reserve.value() >= amount, ENotDue);
    stream.remaining_commitment = reset_commitment;
    let part = stream.reserve.split(amount);
    treasury::deposit(treasury_obj, coin::from_balance(part, ctx));
    if (stream.reserve.value() == 0) {
        stream.state = STATE_DONE;
    };
    event::emit(StreamStopped {
        stream_id: object::id(stream),
        freelancer_paid: 0,
        refunded: amount,
    });
}

/// Propose a mutual resolution for a PAUSED confidential stream. A split divides
/// the *public* reserve by `freelancer_bps` (the hidden commitments are moot once
/// the agreed figure settles); resume returns it to DRIPPING.
public fun conf_propose_resolution<T>(
    stream: &mut ConfidentialStream<T>,
    resume: bool,
    freelancer_bps: u64,
    ctx: &TxContext,
) {
    let who = ctx.sender();
    assert!(who == stream.sender || who == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_PAUSED, EWrongState);
    assert!(resume || freelancer_bps <= BPS_DENOM, EBadSplits);
    let proposal = ResolutionProposal { proposer: who, resume, freelancer_bps };
    if (df::exists(&stream.id, PROPOSAL_KEY)) {
        *df::borrow_mut(&mut stream.id, PROPOSAL_KEY) = proposal;
    } else {
        df::add(&mut stream.id, PROPOSAL_KEY, proposal);
    };
    event::emit(ResolutionProposed {
        stream_id: object::id(stream),
        proposer: who,
        resume,
        freelancer_bps,
    });
}

/// Accept the counterparty's pending confidential resolution.
public fun conf_accept_resolution<T>(
    stream: &mut ConfidentialStream<T>,
    ctx: &mut TxContext,
) {
    let who = ctx.sender();
    assert!(who == stream.sender || who == stream.freelancer, ENotAuthorized);
    assert!(stream.state == STATE_PAUSED, EWrongState);
    assert!(df::exists(&stream.id, PROPOSAL_KEY), EWrongState);
    let proposal: ResolutionProposal = df::remove(&mut stream.id, PROPOSAL_KEY);
    assert!(who != proposal.proposer, ENotAuthorized);

    if (proposal.resume) {
        stream.state = STATE_DRIPPING;
        event::emit(DisputeResolved {
            stream_id: object::id(stream),
            resumed: true,
            freelancer_amount: 0,
            sender_amount: 0,
        });
    } else {
        let total = stream.reserve.value();
        let to_freelancer = mul_bps(total, proposal.freelancer_bps);
        if (to_freelancer > 0) {
            let part = stream.reserve.split(to_freelancer);
            transfer::public_transfer(coin::from_balance(part, ctx), stream.freelancer);
        };
        let to_sender = stream.reserve.value();
        if (to_sender > 0) {
            let part = stream.reserve.split(to_sender);
            transfer::public_transfer(coin::from_balance(part, ctx), stream.sender);
        };
        stream.state = STATE_DONE;
        event::emit(DisputeResolved {
            stream_id: object::id(stream),
            resumed: false,
            freelancer_amount: to_freelancer,
            sender_amount: to_sender,
        });
    }
}

// Confidential views
public fun conf_state<T>(s: &ConfidentialStream<T>): u8 { s.state }

public fun conf_reserve<T>(s: &ConfidentialStream<T>): u64 { s.reserve.value() }

public fun conf_remaining_commitment<T>(s: &ConfidentialStream<T>): vector<u8> {
    s.remaining_commitment
}

public fun conf_earned_commitment<T>(s: &ConfidentialStream<T>): vector<u8> {
    s.earned_commitment
}

public fun conf_current_milestone<T>(s: &ConfidentialStream<T>): u64 { s.current_milestone }

/// The Seal ciphertext of the stream secrets (empty if never attached).
public fun conf_encrypted_secrets<T>(s: &ConfidentialStream<T>): vector<u8> {
    if (df::exists(&s.id, SECRETS_KEY)) {
        *df::borrow(&s.id, SECRETS_KEY)
    } else {
        vector[]
    }
}

/// Review deadline for a raised confidential milestone (0 when not pending).
public fun review_deadline<T>(s: &ConfidentialStream<T>): u64 {
    if (df::exists(&s.id, REVIEW_KEY)) {
        *df::borrow(&s.id, REVIEW_KEY)
    } else {
        0
    }
}
