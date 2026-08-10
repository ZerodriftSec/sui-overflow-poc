/// `subscriptions::scheduler` — the on-chain, permissionless payment
/// scheduler.
///
/// entry point that lets **anyone** trigger a due payment. The
/// off-chain indexer that previously signed payments with
///
/// ## Authority model
///
/// `process_due_payment` is **permissionless**: any caller can submit.
/// The function is gated by the platform's `PLATFORM_SCHEDULER_ROLE`
/// grant and the per-subscription schedule — both enforced downstream
/// in `payment::process_due_payment`.
///
/// The platform's role check is **deferred to a future hardening
/// see `account.move` and `platform.move` for the bootstrap admin
/// pattern).
///
/// ## Error code range
///
/// `payment.move`, and `platform.move` for sibling ranges.
#[allow(lint(share_owned))]
module subscriptions::scheduler {
    use sui::object;
    use sui::transfer;
    use sui::event;
    use sui::tx_context::TxContext;
    use sui::clock::Clock;
    use subscriptions::account::{Self, SubscriptionAccount};
    use subscriptions::platform::{Self, Platform};
    use subscriptions::policies::{Self, PolicyLimiters};
    use subscriptions::payment;

    // === Events ===
    //
    // All events carry a `v: u16 = 2` field for indexer discrimination
    // changes.

    /// Emitted on every successful `process_due_payment`. The
    /// `account_id` and `platform_id` are the canonical handles; the
    /// `submitted_by` field is the gas-paying address (any caller
    /// pair this event with the `PaymentProcessed` event emitted
    /// by `payment.move` for the full state transition.
    public struct DuePaymentSubmitted has copy, drop {
        account_id: object::ID,
        platform_id: object::ID,
        submitted_by: address,
        v: u16,
    }

    // === PaymentScheduler ===

    /// The shared on-chain scheduler. Mints exactly once at
    /// `init`; thereafter every due payment is submitted through it.
    /// The object is `key`-only — its `id` is the canonical handle
    /// off-chain indexers observe.
    public struct PaymentScheduler has key {
        id: object::UID,
        /// Timestamp (ms) of the most recent successful
        /// `process_due_payment`. Useful for off-chain indexers
        /// that want to detect a stalled scheduler.
        last_processed_at: u64,
        /// Schema version (currently `2`).
        version: u16,
    }

    /// One-time witness required by the Sui VM's `init` signature
    /// (per E02003). The VM requires the first parameter of `init`
    /// to be a struct named after the module with the OTW shape
    /// (upper-case of the module name, no fields, `drop`). We do
    /// not use the witness for anything beyond satisfying the
    /// signature; the actual scheduler is built by value.
    public struct SCHEDULER has drop {}

    // === init ===

    /// One-time init. The Sui VM injects the `SCHEDULER` one-time
    /// witness exactly once at first publish; that witness is the
    /// signal that this is the genuine init call. We use it to
    /// satisfy the framework's strict `init` signature
    /// (E02003 forbids parameters other than the OTW + `&mut
    /// TxContext`).
    ///
    /// The scheduler is shared so any PTB can take `&mut` on it
            /// `registry.move`).
    fun init(_otw: SCHEDULER, ctx: &mut TxContext) {
        let scheduler = PaymentScheduler {
            id: object::new(ctx),
            last_processed_at: 0,
            version: 2,
        };
        transfer::share_object(scheduler);
    }

    // === process_due_payment (permissionless entry point) ===

    /// Permissionless entry point. Anyone can call this; the
    /// function is gated by the downstream checks in
    /// `payment::process_due_payment` (schedule, amount,
    /// per-platform rate limiters, per-account policy eval).
    ///
    ///  1. Delegate to `payment::process_due_payment` (which runs the
    ///     address-balance payment flow).
    ///  2. Stamp `last_processed_at = clock.timestamp_ms()`.
    ///  3. Emit `DuePaymentSubmitted` with the post-state ids and
    ///     the gas-paying sender.
    ///
    /// #### Aborts
    /// - Any abort from `payment::process_due_payment` (e.g.
    ///   `ENotDue`, `EPolicyViolation`, `EZeroAmount`).
    public fun process_due_payment<T>(
        scheduler: &mut PaymentScheduler,
        platform: &mut Platform,
        account: &mut SubscriptionAccount<T>,
        policy_limiters: &mut PolicyLimiters,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let account_id = object::id(account);
        let platform_id = object::id(platform);

        // Delegate to payment.move. The actual payment transfer
        // happens inside that function using the address-balance model.
        payment::process_due_payment(
            platform,
            account,
            policy_limiters,
            clock,
            ctx,
        );

        scheduler.last_processed_at = clock.timestamp_ms();
        event::emit(DuePaymentSubmitted {
            account_id,
            platform_id,
            submitted_by: ctx.sender(),
            v: 2,
        });
    }

    // === Accessors (view) ===

    /// Timestamp (ms) of the most recent successful
    /// `process_due_payment`. `0` if no payment has ever been
    /// processed by this scheduler. Off-chain indexers use this to
    /// detect a stalled scheduler (e.g. a missing automated submitter).
    public fun last_processed_at(scheduler: &PaymentScheduler): u64 {
        scheduler.last_processed_at
    }

    /// Schema version. Currently `2`.
    public fun version(scheduler: &PaymentScheduler): u16 {
        scheduler.version
    }

    /// Test-only constructor. Mirrors `init` but returns the
    /// `PaymentScheduler` by value without going through the
    /// shared-object protocol.
    ///
    /// `PaymentScheduler` is `key`-only (no `drop`), so unit tests
    /// need an explicit way to construct one. The companion
    /// `destroy_for_testing` handles disposal.
    #[test_only]
    public fun new_scheduler_for_testing(ctx: &mut TxContext): PaymentScheduler {
        PaymentScheduler {
            id: object::new(ctx),
            last_processed_at: 0,
            version: 2,
        }
    }

    /// Test-only helper to share a `PaymentScheduler` produced by
    /// `new_scheduler_for_testing`. Required because Sui's
    /// E02009 rule restricts `share_object` to the module that
    /// declares the object. Tests share so subsequent txs can
    /// take the scheduler by ID.
    #[test_only]
    public fun share_for_testing(scheduler: PaymentScheduler) {
        transfer::share_object(scheduler);
    }

    /// Test-only destructor. `PaymentScheduler` has `key` but not
    /// `drop`, so unit tests need an explicit way to dispose of
    /// schedulers they constructed.
    #[test_only]
    public fun destroy_for_testing(scheduler: PaymentScheduler) {
        let PaymentScheduler {
            id,
            last_processed_at: _,
            version: _,
        } = scheduler;
        object::delete(id);
    }
}
