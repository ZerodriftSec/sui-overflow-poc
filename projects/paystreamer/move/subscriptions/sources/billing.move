///
/// This module owns the per-platform subscription state machine:
/// creation, pause, resume, cancellation, and the bookkeeping that
/// value type is declared in `account.move` (per the project Option-C
/// pattern); this module adds the behavior — constructors (via
/// emissions, and the `can_bill` query.
///
/// - `create_subscription` / `pause_subscription` / `resume_subscription` /
///   `cancel_subscription` require an `AccountCap` whose `account_id`
///   matches the target account. The cap's OWNER permission is the
///   authority. We assert the `account_id` match here so a cap bound to
///   account A cannot mutate a subscription in account B; the cap is
///   then trusted to carry the OWNER bit per `account.move`'s mint
///   semantics.
/// - `record_payment` and `record_failed_payment` are `public(package)`
///   so only `payment.move` (same package) can advance the schedule.
///   The caller in `payment.move` is expected to gate the call behind
///   `can_bill == true` so we get idempotency for free — this module
///   does not re-check the schedule here.
/// - `can_bill` is a public read-only query: it returns `true` iff the
///   subscription exists, is `status == 0` (active), and
///   `clock.timestamp_ms() >= next_billing_time`.
///
/// All events carry `v: u16 = 2` for indexer discrimination (architecture
/// §8). The `change_kind` field on `SubscriptionUpdated` uses the
///
module subscriptions::billing {
    use sui::object;
    use sui::clock::Clock;
    use sui::vec_map;
    use sui::event;
    use sui::tx_context::TxContext;
    use subscriptions::account::{Self, SubscriptionAccount};
    use subscriptions::ac::{Self, AccountCap};

    // === Errors ===

    /// The cap's `account_id` does not match the account it is being
    /// presented against. Wrong account, not just unauthorized.
    const EInvalidCap: u64 = 0x06001;

    /// Reserved for callers that look up a subscription that does not
    /// exist. `vec_map::get` aborts natively on miss (with an out-of-
    /// bounds abort, not a typed code), so this constant is declared
    /// for forward-compat with stricter APIs that wrap the lookup.
    #[allow(unused_const)]
    const ESubscriptionNotFound: u64 = 0x06002;

    /// A subscription for this `platform_id` is already embedded.
    /// `create_subscription` rejects duplicates so off-chain state stays
    /// aligned with the canonical map.
    const ESubscriptionAlreadyExists: u64 = 0x06003;

    /// The operation requires `status == 0` (active) but the
    /// subscription is paused or cancelled. Surfaced by `record_payment`
    /// and `pause_subscription`.
    const ESubscriptionNotActive: u64 = 0x06004;

    /// `resume_subscription` requires `status == 1` (paused); cancelled
    /// subscriptions must be re-created, not resumed.
    const ESubscriptionNotPaused: u64 = 0x06005;

    /// The account is paused; subscriptions cannot be created while the
    /// account is paused. (Existing subscriptions keep their own
    /// per-platform status; the cascade is set by `account::pause_account`.)
    const EAccountPaused: u64 = 0x06006;

    /// The account is closed; no subscription operations are permitted.
    const EAccountClosed: u64 = 0x06007;

    /// The cap is bound to this account but lacks the OWNER permission.
    /// A DEPOSITOR or AGENT cap cannot mutate subscription state.
    const EUnauthorized: u64 = 0x06009;

    // === Events ===

    /// Emitted on every successful `create_subscription`. `tier_index`,
    /// `tier_amount`, and `tier_frequency_ms` are the schedule snapshot
    /// at creation time, so indexers can reconstruct the schedule
    /// without re-reading the subscription.
    public struct SubscriptionCreated has copy, drop {
        account_id: ID,
        platform_id: ID,
        tier_index: u64,
        tier_amount: u64,
        tier_frequency_ms: u64,
        v: u16,
    }

    /// Emitted on pause / resume / cancel / tier change.
    /// `change_kind` mapping: 0 = tier change, 1 = resumed, 2 = cancelled,
    /// 3 = paused.
    public struct SubscriptionUpdated has copy, drop {
        account_id: ID,
        platform_id: ID,
        change_kind: u8,
        v: u16,
    }

    /// Emitted on every successful billing pass (via `record_payment`).
    /// `new_total_paid` and `new_payment_count` are post-update values;
    /// `nonce` is the new per-subscription replay nonce after the bump.
    public struct PaymentRecorded has copy, drop {
        account_id: ID,
        platform_id: ID,
        amount: u64,
        new_total_paid: u64,
        new_payment_count: u64,
        nonce: u64,
        v: u16,
    }

    /// Emitted on a failed billing attempt (via `record_failed_payment`).
    /// `reason` is a `payment.move`-supplied code; this module does not
    /// interpret it, only records it.
    public struct FailedPaymentRecorded has copy, drop {
        account_id: ID,
        platform_id: ID,
        amount: u64,
        reason: u64,
        v: u16,
    }

    // === create_subscription ===

    /// Embed a new subscription in the account's `VecMap`. The cap's
    /// `account_id` must match the target account; the cap must hold
    /// the OWNER permission. Sets up the billing schedule with
    /// `next_billing_time = now + tier_frequency_ms`.
    ///
    /// #### Aborts
    /// - `EInvalidCap` if `cap.account_id != object::id(account)`.
    /// - `EUnauthorized` if the cap lacks the OWNER bit.
    /// - `EAccountPaused` if the account is paused.
    /// - `EAccountClosed` if the account is closed.
    /// - `ESubscriptionAlreadyExists` if the platform already has a sub.
    public fun create_subscription<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        tier_index: u64,
        tier_amount: u64,
        tier_frequency_ms: u64,
        max_attempts: u8,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let status_ref = account::status(account);
        assert!(account::is_active(status_ref), EAccountPaused);
        assert!(!account::is_closed(status_ref), EAccountClosed);
        if (vec_map::contains(account::subscriptions(account), &platform_id)) {
            let existing = account::get_subscription(account, &platform_id);
            assert!(
                account::sub_status(existing) == 2,
                ESubscriptionAlreadyExists,
            );
        };

        let now = clock.timestamp_ms();
        let sub = account::new_subscription(
            platform_id,
            tier_index,
            tier_amount,
            tier_frequency_ms,
            0,                       // status: active
            tier_frequency_ms,       // schedule_frequency_ms
            now + tier_frequency_ms, // next_billing_time
            0,                       // last_billing_time
            0,                       // total_paid
            0,                       // payment_count
            0,                       // last_attempt_time
            0,                       // attempt_count
            max_attempts,            // max_attempts
            0,                       // nonce
            now,                     // created_at
            now,                     // updated_at
        );
        vec_map::insert(account::subscriptions_mut(account), platform_id, sub);

        event::emit(SubscriptionCreated {
            account_id: object::id(account),
            platform_id,
            tier_index,
            tier_amount,
            tier_frequency_ms,
            v: 2,
        });
    }

    // === pause / resume / cancel ===

    /// Pause an active subscription. The cap must be bound to this
    /// account and must hold the OWNER permission. The subscription
    /// must currently be `status == 0` (active); pausing an already
    /// paused or cancelled subscription is rejected.
    ///
    /// #### Aborts
    /// - `EInvalidCap` if `cap.account_id != object::id(account)`.
    /// - `EUnauthorized` if the cap lacks the OWNER bit.
    /// - `ESubscriptionNotActive` if the subscription is not active.
    public fun pause_subscription<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        assert!(account::sub_status(sub) == 0, ESubscriptionNotActive);
        account::sub_set_status(sub, 1);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        event::emit(SubscriptionUpdated {
            account_id: object::id(account),
            platform_id,
            change_kind: 3,
            v: 2,
        });
    }

    /// Resume a paused subscription. The cap must be bound to this
    /// account and must hold the OWNER permission. The subscription
    /// must currently be `status == 1` (paused); resuming a cancelled
    /// subscription is rejected (it must be re-created from scratch).
    ///
    /// #### Aborts
    /// - `EInvalidCap` if `cap.account_id != object::id(account)`.
    /// - `EUnauthorized` if the cap lacks the OWNER bit.
    /// - `ESubscriptionNotPaused` if the subscription is not paused.
    public fun resume_subscription<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        assert!(account::sub_status(sub) == 1, ESubscriptionNotPaused);
        account::sub_set_status(sub, 0);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        event::emit(SubscriptionUpdated {
            account_id: object::id(account),
            platform_id,
            change_kind: 1,
            v: 2,
        });
    }

    /// Cancel a subscription. Terminal: status flips to 2 and stays
    /// there. The cap must be bound to this account and must hold
    /// the OWNER permission. Idempotent on already-cancelled
    /// subscriptions (no event emitted on a no-op). Cancellations
    /// from active or paused states both emit a single
    /// `SubscriptionUpdated` event with `change_kind = 2`.
    ///
    /// #### Aborts
    /// - `EInvalidCap` if `cap.account_id != object::id(account)`.
    /// - `EUnauthorized` if the cap lacks the OWNER bit.
    public fun cancel_subscription<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        let was_active_or_paused = account::sub_status(sub) == 0
            || account::sub_status(sub) == 1;
        account::sub_set_status(sub, 2);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        if (was_active_or_paused) {
            event::emit(SubscriptionUpdated {
                account_id: object::id(account),
                platform_id,
                change_kind: 2,
                v: 2,
            });
        account::remove_subscription(account, &platform_id);
        }
    }

    /// Update a subscription's maximum billing attempts per cycle.
    public fun update_subscription_max_attempts<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        max_attempts: u8,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        account::sub_set_max_attempts(sub, max_attempts);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        event::emit(SubscriptionUpdated {
            account_id: object::id(account),
            platform_id,
            change_kind: 4, // 4 = max_attempts change
            v: 2,
        });
    }

    /// Update a subscription's tier information.
    public fun update_subscription_tier<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        tier_index: u64,
        tier_amount: u64,
        tier_frequency_ms: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        account::sub_set_tier(sub, tier_index, tier_amount, tier_frequency_ms);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        event::emit(SubscriptionUpdated {
            account_id: object::id(account),
            platform_id,
            change_kind: 0, // 0 = tier change
            v: 2,
        });
    }

    /// Update a subscription's schedule frequency (which can deviate from tier_frequency_ms).
    public fun update_subscription_schedule_frequency<T>(
        cap: &AccountCap,
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        schedule_frequency_ms: u64,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(
            account_id_from_cap(cap) == object::id(account),
            EInvalidCap,
        );
        assert!(
            ac::has_permission(cap, ac::permission_owner()),
            EUnauthorized,
        );
        let sub = account::get_subscription_mut(account, &platform_id);
        account::sub_set_schedule_frequency(sub, schedule_frequency_ms);
        let now = clock.timestamp_ms();
        account::sub_set_updated_at(sub, now);
        event::emit(SubscriptionUpdated {
            account_id: object::id(account),
            platform_id,
            change_kind: 5, // 5 = schedule_frequency change
            v: 2,
        });
    }

    // === record_payment (called by payment.move on successful billing) ===

    /// Advance the subscription's billing state on a successful charge.
    /// Bumps `total_paid`, `payment_count`, and the per-subscription
    /// `nonce`; resets `attempt_count` to 0; advances
    /// `next_billing_time` by `tier_frequency_ms`. The caller
    /// (`payment.move`) is expected to gate this behind `can_bill ==
    /// true` so idempotency is enforced upstream; we additionally
    /// assert the subscription is active here as a safety net.
    ///
    /// `public(package)` so only `payment.move` (same package) can
    /// call it.
    ///
    /// #### Aborts
    /// - `ESubscriptionNotActive` if `sub.status != 0`.
    public(package) fun record_payment<T>(
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        amount: u64,
        clock: &Clock,
    ) {
        let now = clock.timestamp_ms();
        let account_id = object::id(account);
        let sub = account::get_subscription_mut(account, &platform_id);
        assert!(account::sub_status(sub) == 0, ESubscriptionNotActive);
        account::sub_apply_payment(sub, amount, now);

        event::emit(PaymentRecorded {
            account_id,
            platform_id,
            amount,
            new_total_paid: account::sub_total_paid(sub),
            new_payment_count: account::sub_payment_count(sub),
            nonce: account::sub_nonce(sub),
            v: 2,
        });
    }

    // === record_failed_payment (called by payment.move on a failed bill) ===

    /// Stamp a failed-attempt on the subscription. Bumps
    /// `attempt_count`, `last_attempt_time`, and `updated_at`. Does
    /// not advance the billing schedule (a failed bill does not
    /// consume the cycle). `public(package)` to restrict the caller
    /// to same-package code.
    public(package) fun record_failed_payment<T>(
        account: &mut SubscriptionAccount<T>,
        platform_id: ID,
        amount: u64,
        reason: u64,
        clock: &Clock,
    ) {
        let sub = account::get_subscription_mut(account, &platform_id);
        let now = clock.timestamp_ms();
        account::sub_apply_failed_attempt(sub, now);
        event::emit(FailedPaymentRecorded {
            account_id: object::id(account),
            platform_id,
            amount,
            reason,
            v: 2,
        });
    }

    // === can_bill ===

    /// `true` iff the subscription exists, is active (`status == 0`),
    /// and `now >= next_billing_time`. This is the only schedule
    /// query the protocol needs; it intentionally does not consult
    /// `attempt_count` or `max_attempts` — the policy layer
    /// (`policies.move`) and the payment flow handle the retry cap.
    public fun can_bill<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
        clock: &Clock,
    ): bool {
        if (!vec_map::contains(account::subscriptions(account), &platform_id)) {
            return false
        };
        let sub = vec_map::get(account::subscriptions(account), &platform_id);
        if (account::sub_status(sub) != 0) {
            return false
        };
        clock.timestamp_ms() >= account::sub_next_billing_time(sub)
    }

    // === Accessors (read-only) ===

    /// Subscription `status` (0 active, 1 paused, 2 cancelled). Aborts
    /// via `vec_map::get` if the platform has no subscription.
    public fun subscription_status<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u8 {
        account::sub_status(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// Lifetime `total_paid` (smallest unit of `T`).
    public fun subscription_total_paid<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_total_paid(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// Lifetime `payment_count`.
    public fun subscription_payment_count<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_payment_count(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// Per-subscription `nonce` (replay protection; bumped on success).
    public fun subscription_nonce<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_nonce(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// `tier_amount` snapshot from subscription creation.
    public fun subscription_tier_amount<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_tier_amount(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// `tier_frequency_ms` snapshot from subscription creation.
    public fun subscription_tier_frequency_ms<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_tier_frequency_ms(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// Current `next_billing_time` (ms).
    public fun subscription_next_billing_time<T>(
        account: &SubscriptionAccount<T>,
        platform_id: ID,
    ): u64 {
        account::sub_next_billing_time(vec_map::get(account::subscriptions(account), &platform_id))
    }

    /// Subscription denomination (the `TypeName` of `T`). Returned by value.
    public fun subscription_denomination<T>(
        _account: &SubscriptionAccount<T>,
        _platform_id: ID,
    ): std::type_name::TypeName {
        account::account_type<T>()
    }

    // === Module-local helpers ===
    //
    // We route the `account_id` lookups through local helpers
    // so the import block stays narrow and the call sites read cleanly.

    fun account_id_from_cap(cap: &AccountCap): ID {
        subscriptions::ac::account_id(cap)
    }
}
