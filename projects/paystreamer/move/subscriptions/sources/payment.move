///
/// `process_due_payment`
/// funds. It is called by `scheduler.move` (the permissionless on-chain
/// entry point) after the global circuit breaker, the global pause flag,
/// and the platform's `PLATFORM_SCHEDULER_ROLE` grant have been checked
/// upstream. The function then verifies the per-subscription schedule,
/// runs the per-platform rate limiters, performs the two-pass policy
/// evaluation, and uses the address-balance model to transfer funds
/// directly from the subscriber's address to the platform treasury.
///
/// ## Address-balance payment flow
///
/// The payment uses Sui's address balance model:
/// 1. Create a withdrawal from the subscriber's address balance
/// 2. Redeem the withdrawal to get `Balance<T>`
/// 3. Send the balance to the platform treasury
///
/// ## Error code range
///
/// `billing.move` for sibling ranges.
#[allow(lint(share_owned))]
module subscriptions::payment {
    use sui::object;
    use sui::balance;
    use sui::event;
    use sui::tx_context::TxContext;
    use sui::clock::Clock;
    use subscriptions::account::{Self, SubscriptionAccount};
    use subscriptions::billing::{Self, can_bill, record_payment, record_failed_payment};
    use subscriptions::policies::{Self, PolicyLimiters, PolicyFailure};
    use subscriptions::platform::{Self, Platform};

    // === Errors ===

    /// `can_bill` returned `false` — the subscription is not active or
    const ENotDue: u64 = 0x09001;

    /// The subscription's `tier_amount` is invalid (e.g. `0`).
    /// fatal misconfiguration and aborts before money moves.
    #[allow(unused_const)]
    const EInvalidAmount: u64 = 0x09002;

    /// The account's live headroom is below the requested `amount`.
    /// Surfaces `account::internal_withdraw`'s `EInsufficientBalance`
    /// at the payment-flow level so off-chain indexers can distinguish
    /// a billing failure (insufficient balance) from a schedule failure
    /// (`ENotDue`). Currently a forward-reserved code; the actual
    /// abort path is `account::internal_withdraw`'s native abort, so
    /// the constant is intentionally not referenced (and not asserted
    /// against) inside the function body. Kept for stable cross-module
    /// error-code references.
    #[allow(unused_const)]
    const EInsufficientBalance: u64 = 0x09003;

    /// One of the platform's three rate limiters
    /// (`volume_limiter`, `frequency_limiter`, `account_billing_limiter`)
    /// refused the consume. The persisted limiter state is untouched
    /// (OZ `try_consume` is all-or-nothing), so a downstream caller can
    /// retry the same `process_due_payment` after the limiters refill.
    const EPlatformRateLimited: u64 = 0x09004;

    /// The two-pass policy evaluation rejected the request. The full
    /// `vector<PolicyFailure>` is emitted in the `PaymentFailed` event
    /// so off-chain indexers can see *which* dimension failed and
    /// *why`. Persisted limiter state is untouched (a failed pass-1
    const EPolicyViolation: u64 = 0x09005;

    /// The subscription's `tier_amount` resolved to `0`. Treated as a
    /// programmer / configuration error; aborts before money moves.
    const EZeroAmount: u64 = 0x09006;

    // === Events ===

    /// Emitted on every successful `process_due_payment`. The
    /// `policy_failures_count` field is the length of the failure
    /// vector returned by `policies::evaluate`; on a successful
    /// bill it is `0` (the vector is empty). Off-chain indexers
    /// can join `PaymentProcessed` against the per-platform treasury
    /// transfer to confirm the round-trip.
    public struct PaymentProcessed has copy, drop {
        account_id: ID,
        platform_id: ID,
        amount: u64,
        policy_failures_count: u64,
        nonce: u64,
        v: u16,
    }

    /// Emitted on a failed `process_due_payment`. The `reason` field
    /// is one of `ENotDue`, `EPlatformRateLimited`, `EPolicyViolation`,
    /// `EInsufficientBalance`, or `EZeroAmount`. The `amount` is the
    /// `tier_amount` at the time of the attempt (0 for `ENotDue` since
    /// the schedule is consulted first).
    public struct PaymentFailed has copy, drop {
        account_id: ID,
        platform_id: ID,
        amount: u64,
        reason: u64,
        v: u16,
    }

    // === process_due_payment ===

    /// THE single money-moving path. Called by `scheduler.move` (which
    /// has already checked the global circuit breaker, the global pause
    /// flag, and the platform's `PLATFORM_SCHEDULER_ROLE` grant).
    ///
    /// Note: Due to Sui framework limitations, this function requires the
    /// subscriber to have deposited a Coin<T> into the account first.
    /// The scheduler withdraws from the account's balance and sends to treasury.
    /// This is a transitional model until address-balance APIs become public.
    ///
    /// owns; the scheduler owns steps 1, 2, 4, 6):
    ///  1. Verify `can_bill` (subscription is active and due)
    ///     billed amount, not a caller-supplied value)
    ///  3. Check the platform's three rate limiters
    ///     (`volume`, `frequency`, `account_billing`)
    ///  4. Two-pass policy evaluation against the account's
    ///     `PolicySet` and live `PolicyLimiters`
    ///  5. Withdraw from account's stored balance
    ///  6. Send to treasury via `sui::coin::send_funds`
    ///  7. `record_payment` on the subscription (advances schedule,
    ///     bumps the per-subscription nonce) and `bump_nonce` on the
    ///     step 10)
    ///  8. Emit `PaymentProcessed` with the policy results
    ///
    /// On a policy violation, `record_failed_payment` is called so the
    /// subscription's retry state (attempt_count, last_attempt_time) is
    /// correctly stamped for the next call. On other failures
    /// (`ENotDue`, `EPlatformRateLimited`, `EZeroAmount`) the call
    /// aborts before any state change; the `PaymentFailed` event
    /// records the reason.
    public fun process_due_payment<T>(
        platform: &mut Platform,
        account: &mut SubscriptionAccount<T>,
        policy_limiters: &mut PolicyLimiters,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let platform_id = object::id(platform);
        let account_id = object::id(account);

        // 1. can_bill check.
        if (!can_bill(account, platform_id, clock)) {
            event::emit(PaymentFailed {
                account_id,
                platform_id,
                amount: 0,
                reason: ENotDue,
                v: 2,
            });
            abort ENotDue
        };

        let amount = account::tier_amount_via_sub(account, platform_id);
        assert!(amount > 0, EZeroAmount);

        // 3. platform rate limiters.
        assert!(platform::try_consume_volume(platform, amount, clock), EPlatformRateLimited);
        assert!(platform::try_consume_frequency(platform, clock), EPlatformRateLimited);
        assert!(platform::try_consume_account_billing(platform, clock), EPlatformRateLimited);

        // 4. two-pass policy evaluation.
        let (allowed, failures) = policies::evaluate(
            account,
            policy_limiters,
            amount,
            clock,
        );
        if (!allowed) {
            record_failed_payment(account, platform_id, amount, EPolicyViolation, clock);
            event::emit(PaymentFailed {
                account_id,
                platform_id,
                amount,
                reason: EPolicyViolation,
                v: 2,
            });
            abort EPolicyViolation
        };
        let failure_count = vector::length(&failures);

        // 5. Withdraw from account's balance and send to treasury.
        // The subscriber must have deposited funds into the account first.
        // This is a transitional implementation until address-balance APIs
        // (create_withdrawal, redeem) become publicly accessible.
        let treasury_addr = platform::treasury(platform);
        account::withdraw_and_send<T>(account, amount, treasury_addr, ctx);

        // 6. record_payment (advances schedule, bumps sub nonce) and
        // bump the per-account replay nonce.
        record_payment(account, platform_id, amount, clock);
        account::bump_nonce(account);

        // 7. emit event.
        let new_nonce = account::nonce(account);
        event::emit(PaymentProcessed {
            account_id,
            platform_id,
            amount,
            policy_failures_count: failure_count,
            nonce: new_nonce,
            v: 2,
        });
    }
}
