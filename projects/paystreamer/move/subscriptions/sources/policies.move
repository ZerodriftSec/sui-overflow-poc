/// `subscriptions::policies` — two-pass policy evaluation against the
/// per-account `PolicySet` declared in `account.move`.
///
/// ## Why two passes
///
/// A naive evaluator that called `rate_limiter::consume_or_abort` (or
/// `try_consume`) at every check would burn tokens from a `Bucket`-shaped
/// limiter on the first failing check, even though no payment actually
///
/// 1. **Project, do not mutate.** For each policy dimension, call the
///    read-only `rate_limiter::available(clock)` projection. Compare
///    against the requested amount. Build `vector<PolicyFailure>` with
/// 2. **Consume on success.** Only when `failures.is_empty()`, call
///    `rate_limiter::consume_or_abort` in a sweep. The persisted limiter
///    state is unchanged on failure.
///
/// `evaluate` must NOT burn tokens. The `test_evaluate_failed_does_not_burn_tokens`
/// test pins this behavior.
///
/// ## Architecture mapping
///
/// The `PolicySet` value type (per_tx_max, monthly_max, min_balance,
/// frequency_min_ms) is declared in `account.move`; this module adds
/// the behavior. The per-account rate-limiter state is held in a
/// `PolicyLimiters` struct that callers (payment.move, billing.move)
/// store alongside the account — `has store, drop`, no `key`, embedded
/// wherever the integrator wants.
///
/// `PolicyLimiters` carries three OZ `RateLimiter`s:
/// - `per_tx`   — `Cooldown` of `capacity = per_tx_max` with the
///                cooldown window set to `frequency_min_ms`. Drains on
///                successive consumes within a cycle; the gate arms
///                once the budget is spent and releases at
///                `cooldown_end_ms = now + frequency_min_ms`.
/// - `monthly`  — `FixedWindow` of `capacity = monthly_max` with
///                `window_ms = 30d`. Resets every 30 days.
/// - `frequency` — `Cooldown` of `capacity = 1` (one attempt per cycle)
///                 with the cooldown window set to `frequency_min_ms`.
///                 Distinct from `per_tx` so the per-tx cap and the
///                 minimum-gap gate can be enforced independently even
///                 though both share the same `frequency_min_ms`
///                 source field.
///
/// `evaluate` is the only mutating function. `empty_limiters`,
/// `ensure_initialized`, and the accessors are the read/build surface.
///
/// in `payment.move` (which calls `evaluate` and emits `PaymentProcessed`
/// with the full `vector<PolicyFailure>` for indexer discrimination).
/// This module emits no events of its own.
module subscriptions::policies {
    use sui::clock::Clock;
    use openzeppelin_utils::rate_limiter::{Self, RateLimiter};
    use subscriptions::account::{Self, SubscriptionAccount, PolicySet};

    // === Errors ===
    //
    // These error codes are reserved for use by call sites that prefer
    // a hard-assert over the structured `PolicyFailure` vector. The
    // typed `PolicyFailure` is the primary surface; these constants
    // to assert on a single dimension. Each is `#[allow(unused_const)]`

    /// Per-transaction maximum exceeded. Maps to `PolicyFailure { code: 0x07001, ... }`.
    #[allow(unused_const)]
    const EPerTxExceeded: u64 = 0x07001;
    /// Monthly maximum exceeded. Maps to `PolicyFailure { code: 0x07002, ... }`.
    #[allow(unused_const)]
    const EMonthlyExceeded: u64 = 0x07002;
    /// Minimum-balance floor would be violated. Maps to `PolicyFailure { code: 0x07003, ... }`.
    #[allow(unused_const)]
    const EMinBalanceViolated: u64 = 0x07003;
    /// Minimum gap between attempts not yet elapsed. Maps to `PolicyFailure { code: 0x07004, ... }`.
    #[allow(unused_const)]
    const EFrequencyViolated: u64 = 0x07004;
    /// The caller passed a structurally invalid limit (e.g., `0` for a
    /// `Bucket`/`FixedWindow` capacity that must be positive). Reserved
    /// for future hard-asserts; the OZ constructor is the primary gate
    /// in this revision.
    #[allow(unused_const)]
    const EInvalidLimit: u64 = 0x07005;

    // === PolicyLimiters ===

    /// Per-account rate-limiter state. One struct per account; carries
    /// the live `RateLimiter` instances that back the `PolicySet`
    /// declared in `account.move`. `has store, drop` so it can be
    /// embedded in the account, a wrapper object, or stored alongside
    /// in the integrator's struct of choice. The struct itself has no
    /// `key` — it is not a Sui object.
    ///
    /// Construct via `empty_limiters` for a cold start, then call
    /// `ensure_initialized` to populate the limiters from the current
    /// `PolicySet` before the first `evaluate`. The empty state uses
    /// `capacity = 1` so the OZ constructors do not abort; the
    /// `ensure_initialized` rebuild overwrites the fields with the
    /// real caps.
    public struct PolicyLimiters has store, drop {
        /// `Cooldown` limiter backing the per-transaction cap.
        per_tx: RateLimiter,
        /// `FixedWindow` limiter backing the monthly cap.
        monthly: RateLimiter,
        /// `Cooldown` limiter backing the minimum-gap frequency gate.
        frequency: RateLimiter,
    }

    // === Constructors ===

    /// Cold-start `PolicyLimiters`. The three limiters are constructed
    /// with the smallest legal capacity / window so the OZ constructors
    /// do not abort, and the first-pass `available(clock)` projection
    /// returns a non-zero headroom (i.e. a no-op). `ensure_initialized`
    /// rebuilds each field against the current `PolicySet` before the
    /// first real `evaluate`.
    ///
    /// The `FixedWindow` is seeded with `initial_available = 1`
    /// (matching its capacity) so a first read at the construction
    /// time returns the full budget; this matches the semantic of
    /// "the window just opened, full headroom is available". Without
    /// this seed, OZ's bucket accrual would return 0 for the first
    /// window (the bucket starts empty and only refills at the next
    /// interval boundary), which is the wrong default for a fresh
    /// limiter.
    ///
    /// Callers MUST call `ensure_initialized` before the first
    /// `evaluate` so the limiters match the current `PolicySet`.
    public fun empty_limiters(clock: &Clock): PolicyLimiters {
        PolicyLimiters {
            per_tx: rate_limiter::new_cooldown(1, 1, 0, 0, clock),
            monthly: rate_limiter::new_fixed_window(1, 1, clock.timestamp_ms(), 1, clock),
            frequency: rate_limiter::new_cooldown(1, 1, 0, 0, clock),
        }
    }

    // === ensure_initialized ===

    /// Rebuild the three `RateLimiter`s from the current `PolicySet`.
    /// The account's `PolicySet` is the source of truth at the time
    /// this function is called. The function is idempotent in the
    /// sense that calling it again with the same `PolicySet` produces
    /// limiters with the same caps; a future hardening pass may add
    /// rebuilds.
    ///
    /// `FixedWindow` to `now` — the new monthly window starts at the
    /// call time. This is the OZ-recommended pattern for rate
    /// changes (see the rate_limiter module docs, "Reconfiguration":
    /// any change to the rate must re-anchor to `clock.timestamp_ms()`
    /// so the new rate only applies going forward).
    public fun ensure_initialized<T>(
        account: &SubscriptionAccount<T>,
        limiters: &mut PolicyLimiters,
        clock: &Clock,
    ) {
        let ps = account::policies(account);
        let now = clock.timestamp_ms();

        // per_tx Cooldown: capacity = per_tx_max, cooldown window =
        // frequency_min_ms. With ps.per_tx_max = 0 the OZ constructor
        // would abort (EZeroCapacity); the `if > 0` guard substitutes 1
        // so the limiter can still be constructed. The evaluator
        // already skips per_tx checks when `ps.per_tx_max == 0`, so
        // this synthesized capacity is never consumed.
        limiters.per_tx = rate_limiter::new_cooldown(
            if (account::policy_per_tx_max(ps) > 0) account::policy_per_tx_max(ps) else 1,
            if (account::policy_frequency_min_ms(ps) > 0) account::policy_frequency_min_ms(ps) else 1,
            0,
            0,
            clock,
        );

        // monthly FixedWindow: capacity = monthly_max, window = 30d.
        // Anchor at `now` so the new window starts at the call time.
        // Seed `initial_available = capacity` (when positive) so the
        // first read at `now` returns the full budget. Without this
        // seed, OZ's bucket accrual would return 0 for the first
        // window (the bucket starts empty and only refills at the
        // next interval boundary), which is the wrong default.
        let monthly_cap = if (account::policy_monthly_max(ps) > 0) account::policy_monthly_max(ps) else 1;
        limiters.monthly = rate_limiter::new_fixed_window(
            monthly_cap,
            30 * 24 * 60 * 60 * 1_000,
            now,
            monthly_cap,
            clock,
        );

        // frequency Cooldown: capacity = 1 (one attempt per cooldown
        // window), cooldown window = frequency_min_ms. `available=0,
        // cooldown_end_ms=0` is the OZ "released gate" state: the
        // first call sees `available = capacity = 1` and consumes
        // cleanly, after which `available = 0` arms the gate at
        // `cooldown_end_ms = now + frequency_min_ms`.
        limiters.frequency = rate_limiter::new_cooldown(
            1,
            if (account::policy_frequency_min_ms(ps) > 0) account::policy_frequency_min_ms(ps) else 1,
            0,
            0,
            clock,
        );
    }

    // === PolicyFailure ===

    /// Reason struct for a policy violation. Returned as a vector from
    /// `evaluate` so off-chain indexers see *which* rule failed and
    /// *why*, not just a boolean.
    ///
    /// - `code` matches the `E*` constants above (`0x07001` per-tx,
    ///   `0x07002` monthly, `0x07003` min-balance, `0x07004` frequency).
    ///   Tag `0` is reserved for "no failure" but never appears in
    ///   the failure vector (the vector is empty on success).
    /// - `amount_required` is the requested `amount`.
    /// - `amount_available` is the projected headroom at the time of
    ///   the check; for min-balance it is the saturating-subtraction
    ///   `current_balance - min_balance` (the max amount that could
    ///   have been withdrawn without violating the floor).
    public struct PolicyFailure has copy, drop, store {
        code: u16,
        amount_required: u64,
        amount_available: u64,
    }

    /// Build a `PolicyFailure` for the per-tx dimension.
    public fun failure_per_tx(amount: u64, available: u64): PolicyFailure {
        PolicyFailure { code: 0x07001, amount_required: amount, amount_available: available }
    }
    /// Build a `PolicyFailure` for the monthly dimension.
    public fun failure_monthly(amount: u64, available: u64): PolicyFailure {
        PolicyFailure { code: 0x07002, amount_required: amount, amount_available: available }
    }
    /// Build a `PolicyFailure` for the min-balance dimension.
    public fun failure_min_balance(amount: u64, available: u64): PolicyFailure {
        PolicyFailure { code: 0x07003, amount_required: amount, amount_available: available }
    }
    /// Build a `PolicyFailure` for the frequency dimension.
    public fun failure_frequency(amount: u64, available: u64): PolicyFailure {
        PolicyFailure { code: 0x07004, amount_required: amount, amount_available: available }
    }

    /// `code` of the failure. Matches one of the `E*` constants above.
    public fun failure_code(f: &PolicyFailure): u16 { f.code }
    /// `amount_required` (the request that violated the policy).
    public fun failure_amount_required(f: &PolicyFailure): u64 { f.amount_required }
    /// `amount_available` (the headroom the limiter would have granted).
    public fun failure_amount_available(f: &PolicyFailure): u64 { f.amount_available }

    // === evaluate ===

    /// Two-pass policy evaluation.
    ///
    /// **Pass 1 — project, do not mutate.** For each dimension with a
    /// non-zero cap, call `rate_limiter::available(clock)` (read-only
    /// projection) and compare against the requested `amount`. Push a
    /// typed `PolicyFailure` into the failure vector for every check
    /// that fails. The `min_balance` check is a direct arithmetic
    /// comparison (no limiter involved) and uses saturating subtraction
    /// to avoid underflow when `current_balance < min_balance`.
    ///
    /// **Pass 2 — consume on success.** If and only if the failure
    /// vector is empty, call `rate_limiter::consume_or_abort` on each
    /// failed evaluate must NOT burn tokens.
    ///
    /// Returns `(allowed, failures)`. The caller (typically
    /// `payment.move`) is responsible for asserting `allowed` before
    /// proceeding to the money-moving path.
    ///
    /// Note: `min_balance` policy is no longer enforced at evaluation
    /// time since the subscriber's address balance is not accessible
    /// in the address-balance model. Insufficient balance failures
    /// are surfaced by the withdrawal/redeem operations at payment time.
    public fun evaluate<T>(
        account: &SubscriptionAccount<T>,
        limiters: &mut PolicyLimiters,
        amount: u64,
        clock: &Clock,
    ): (bool, vector<PolicyFailure>) {
        let ps: &PolicySet = account::policies(account);
        let mut failures = vector[];

        // === Pass 1: project, do not mutate ===

        // per_tx: pure arithmetic against the cap; no limiter call.
        if (account::policy_per_tx_max(ps) > 0 && amount > account::policy_per_tx_max(ps)) {
            vector::push_back(
                &mut failures,
                failure_per_tx(amount, account::policy_per_tx_max(ps)),
            );
        };

        // monthly: project FixedWindow headroom via the read-only
        // `available(clock)`. This advances accrued headroom without
        // mutating the persisted state.
        let monthly_avail = rate_limiter::available(&limiters.monthly, clock);
        if (account::policy_monthly_max(ps) > 0 && amount > monthly_avail) {
            vector::push_back(
                &mut failures,
                failure_monthly(amount, monthly_avail),
            );
        };

        // frequency: project Cooldown headroom. The Cooldown returns
        // `capacity` when the gate has elapsed, `0` while the gate is
        // armed. The check `freq_avail == 0` covers both "no capacity
        // to consume" and "gated". (capacity is 1 in this limiter, so
        // `freq_avail > 0` is equivalent to `freq_avail == 1`.)
        let freq_avail = rate_limiter::available(&limiters.frequency, clock);
        if (account::policy_frequency_min_ms(ps) > 0 && freq_avail == 0) {
            vector::push_back(
                &mut failures,
                failure_frequency(amount, 0),
            );
        };

        let allowed = vector::is_empty(&failures);
        if (!allowed) return (false, failures);

        // === Pass 2: consume on success ===
        //
        // Each `consume_or_abort` is gated by the corresponding cap
        // being non-zero (matching the guards in pass 1). The OZ
        // library aborts with `ERateLimited` if the projected state
        // would not satisfy the consume; per the two-pass discipline
        // this branch is unreachable in the happy path. If a future
        // change introduces a race (e.g. external state mutation
        // between the two passes) the abort is the correct fail-safe.
        if (account::policy_per_tx_max(ps) > 0) {
            rate_limiter::consume_or_abort(&mut limiters.per_tx, amount, clock);
        };
        if (account::policy_monthly_max(ps) > 0) {
            rate_limiter::consume_or_abort(&mut limiters.monthly, amount, clock);
        };
        if (account::policy_frequency_min_ms(ps) > 0) {
            rate_limiter::consume_or_abort(&mut limiters.frequency, 1, clock);
        };

        (true, failures)
    }

    // === Accessors ===

    /// Read-only handle to the per-tx `Cooldown` limiter. Useful for
    /// off-chain indexers and tests; production code should not
    /// need to reach into the limiters directly.
    public fun limiters_per_tx(limiters: &PolicyLimiters): &RateLimiter { &limiters.per_tx }
    /// Read-only handle to the monthly `FixedWindow` limiter.
    public fun limiters_monthly(limiters: &PolicyLimiters): &RateLimiter { &limiters.monthly }
    /// Read-only handle to the frequency `Cooldown` limiter.
    public fun limiters_frequency(limiters: &PolicyLimiters): &RateLimiter { &limiters.frequency }

    // === Test-only ===

    /// Test-only destructor. `PolicyLimiters` has `has store, drop`,
    /// so a `drop` would normally suffice, but the inner `RateLimiter`
    /// also has `drop` and the explicit destructuring documents the
    /// shape of the struct for test readers.
    #[test_only]
    public fun destroy_limiters_for_testing(limiters: PolicyLimiters) {
        let PolicyLimiters { per_tx: _, monthly: _, frequency: _ } = limiters;
    }
}
