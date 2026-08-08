/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `subscriptions::policies` — two-pass policy evaluation against the per-account
 * `PolicySet` declared in `account.move`.
 * 
 * ## Why two passes
 * 
 * A naive evaluator that called `rate_limiter::consume_or_abort` (or
 * `try_consume`) at every check would burn tokens from a `Bucket`-shaped limiter
 * on the first failing check, even though no payment actually
 * 
 * 1.  **Project, do not mutate.** For each policy dimension, call the read-only
 *     `rate_limiter::available(clock)` projection. Compare against the requested
 *     amount. Build `vector<PolicyFailure>` with
 * 2.  **Consume on success.** Only when `failures.is_empty()`, call
 *     `rate_limiter::consume_or_abort` in a sweep. The persisted limiter state is
 *     unchanged on failure.
 * 
 * `evaluate` must NOT burn tokens. The `test_evaluate_failed_does_not_burn_tokens`
 * test pins this behavior.
 * 
 * ## Architecture mapping
 * 
 * The `PolicySet` value type (per_tx_max, monthly_max, min_balance,
 * frequency_min_ms) is declared in `account.move`; this module adds the behavior.
 * The per-account rate-limiter state is held in a `PolicyLimiters` struct that
 * callers (payment.move, billing.move) store alongside the account —
 * `has store, drop`, no `key`, embedded wherever the integrator wants.
 * 
 * `PolicyLimiters` carries three OZ `RateLimiter`s:
 * 
 * - `per_tx` — `Cooldown` of `capacity = per_tx_max` with the cooldown window set
 *   to `frequency_min_ms`. Drains on successive consumes within a cycle; the gate
 *   arms once the budget is spent and releases at
 *   `cooldown_end_ms = now + frequency_min_ms`.
 * - `monthly` — `FixedWindow` of `capacity = monthly_max` with `window_ms = 30d`.
 *   Resets every 30 days.
 * - `frequency` — `Cooldown` of `capacity = 1` (one attempt per cycle) with the
 *   cooldown window set to `frequency_min_ms`. Distinct from `per_tx` so the
 *   per-tx cap and the minimum-gap gate can be enforced independently even though
 *   both share the same `frequency_min_ms` source field.
 * 
 * `evaluate` is the only mutating function. `empty_limiters`,
 * `ensure_initialized`, and the accessors are the read/build surface.
 * 
 * in `payment.move` (which calls `evaluate` and emits `PaymentProcessed` with the
 * full `vector<PolicyFailure>` for indexer discrimination). This module emits no
 * events of its own.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as rate_limiter from './deps/openzeppelin_utils/rate_limiter.js';
const $moduleName = '@local-pkg/subscriptions::policies';
export const PolicyLimiters = new MoveStruct({ name: `${$moduleName}::PolicyLimiters`, fields: {
        /** `Cooldown` limiter backing the per-transaction cap. */
        per_tx: rate_limiter.RateLimiter,
        /** `FixedWindow` limiter backing the monthly cap. */
        monthly: rate_limiter.RateLimiter,
        /** `Cooldown` limiter backing the minimum-gap frequency gate. */
        frequency: rate_limiter.RateLimiter
    } });
export const PolicyFailure = new MoveStruct({ name: `${$moduleName}::PolicyFailure`, fields: {
        code: bcs.u16(),
        amount_required: bcs.u64(),
        amount_available: bcs.u64()
    } });
export interface EmptyLimitersArguments {
}
export interface EmptyLimitersOptions {
    package?: string;
    arguments?: EmptyLimitersArguments | [
    ];
}
/**
 * Cold-start `PolicyLimiters`. The three limiters are constructed with the
 * smallest legal capacity / window so the OZ constructors do not abort, and the
 * first-pass `available(clock)` projection returns a non-zero headroom (i.e. a
 * no-op). `ensure_initialized` rebuilds each field against the current `PolicySet`
 * before the first real `evaluate`.
 *
 * The `FixedWindow` is seeded with `initial_available = 1` (matching its capacity)
 * so a first read at the construction time returns the full budget; this matches
 * the semantic of "the window just opened, full headroom is available". Without
 * this seed, OZ's bucket accrual would return 0 for the first window (the bucket
 * starts empty and only refills at the next interval boundary), which is the wrong
 * default for a fresh limiter.
 *
 * Callers MUST call `ensure_initialized` before the first `evaluate` so the
 * limiters match the current `PolicySet`.
 */
export function emptyLimiters(options: EmptyLimitersOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames: string[] = [];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'empty_limiters',
        arguments: normalizeMoveArguments(options.arguments ?? [], argumentsTypes, parameterNames),
    });
}
export interface EnsureInitializedArguments {
    account: RawTransactionArgument<string>;
    limiters: TransactionArgument;
}
export interface EnsureInitializedOptions {
    package?: string;
    arguments: EnsureInitializedArguments | [
        account: RawTransactionArgument<string>,
        limiters: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Rebuild the three `RateLimiter`s from the current `PolicySet`. The account's
 * `PolicySet` is the source of truth at the time this function is called. The
 * function is idempotent in the sense that calling it again with the same
 * `PolicySet` produces limiters with the same caps; a future hardening pass may
 * add rebuilds.
 *
 * `FixedWindow` to `now` — the new monthly window starts at the call time. This is
 * the OZ-recommended pattern for rate changes (see the rate_limiter module docs,
 * "Reconfiguration": any change to the rate must re-anchor to
 * `clock.timestamp_ms()` so the new rate only applies going forward).
 */
export function ensureInitialized(options: EnsureInitializedOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "limiters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'ensure_initialized',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface FailurePerTxArguments {
    amount: RawTransactionArgument<number | bigint>;
    available: RawTransactionArgument<number | bigint>;
}
export interface FailurePerTxOptions {
    package?: string;
    arguments: FailurePerTxArguments | [
        amount: RawTransactionArgument<number | bigint>,
        available: RawTransactionArgument<number | bigint>
    ];
}
/** Build a `PolicyFailure` for the per-tx dimension. */
export function failurePerTx(options: FailurePerTxOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["amount", "available"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_per_tx',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureMonthlyArguments {
    amount: RawTransactionArgument<number | bigint>;
    available: RawTransactionArgument<number | bigint>;
}
export interface FailureMonthlyOptions {
    package?: string;
    arguments: FailureMonthlyArguments | [
        amount: RawTransactionArgument<number | bigint>,
        available: RawTransactionArgument<number | bigint>
    ];
}
/** Build a `PolicyFailure` for the monthly dimension. */
export function failureMonthly(options: FailureMonthlyOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["amount", "available"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_monthly',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureMinBalanceArguments {
    amount: RawTransactionArgument<number | bigint>;
    available: RawTransactionArgument<number | bigint>;
}
export interface FailureMinBalanceOptions {
    package?: string;
    arguments: FailureMinBalanceArguments | [
        amount: RawTransactionArgument<number | bigint>,
        available: RawTransactionArgument<number | bigint>
    ];
}
/** Build a `PolicyFailure` for the min-balance dimension. */
export function failureMinBalance(options: FailureMinBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["amount", "available"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_min_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureFrequencyArguments {
    amount: RawTransactionArgument<number | bigint>;
    available: RawTransactionArgument<number | bigint>;
}
export interface FailureFrequencyOptions {
    package?: string;
    arguments: FailureFrequencyArguments | [
        amount: RawTransactionArgument<number | bigint>,
        available: RawTransactionArgument<number | bigint>
    ];
}
/** Build a `PolicyFailure` for the frequency dimension. */
export function failureFrequency(options: FailureFrequencyOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["amount", "available"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_frequency',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureCodeArguments {
    f: TransactionArgument;
}
export interface FailureCodeOptions {
    package?: string;
    arguments: FailureCodeArguments | [
        f: TransactionArgument
    ];
}
/** `code` of the failure. Matches one of the `E*` constants above. */
export function failureCode(options: FailureCodeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["f"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_code',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureAmountRequiredArguments {
    f: TransactionArgument;
}
export interface FailureAmountRequiredOptions {
    package?: string;
    arguments: FailureAmountRequiredArguments | [
        f: TransactionArgument
    ];
}
/** `amount_required` (the request that violated the policy). */
export function failureAmountRequired(options: FailureAmountRequiredOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["f"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_amount_required',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FailureAmountAvailableArguments {
    f: TransactionArgument;
}
export interface FailureAmountAvailableOptions {
    package?: string;
    arguments: FailureAmountAvailableArguments | [
        f: TransactionArgument
    ];
}
/** `amount_available` (the headroom the limiter would have granted). */
export function failureAmountAvailable(options: FailureAmountAvailableOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["f"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'failure_amount_available',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EvaluateArguments {
    account: RawTransactionArgument<string>;
    limiters: TransactionArgument;
    amount: RawTransactionArgument<number | bigint>;
}
export interface EvaluateOptions {
    package?: string;
    arguments: EvaluateArguments | [
        account: RawTransactionArgument<string>,
        limiters: TransactionArgument,
        amount: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Two-pass policy evaluation.
 *
 * **Pass 1 — project, do not mutate.** For each dimension with a non-zero cap,
 * call `rate_limiter::available(clock)` (read-only projection) and compare against
 * the requested `amount`. Push a typed `PolicyFailure` into the failure vector for
 * every check that fails. The `min_balance` check is a direct arithmetic
 * comparison (no limiter involved) and uses saturating subtraction to avoid
 * underflow when `current_balance < min_balance`.
 *
 * **Pass 2 — consume on success.** If and only if the failure vector is empty,
 * call `rate_limiter::consume_or_abort` on each failed evaluate must NOT burn
 * tokens.
 *
 * Returns `(allowed, failures)`. The caller (typically `payment.move`) is
 * responsible for asserting `allowed` before proceeding to the money-moving path.
 *
 * Note: `min_balance` policy is no longer enforced at evaluation time since the
 * subscriber's address balance is not accessible in the address-balance model.
 * Insufficient balance failures are surfaced by the withdrawal/redeem operations
 * at payment time.
 */
export function evaluate(options: EvaluateOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "limiters", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'evaluate',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface LimitersPerTxArguments {
    limiters: TransactionArgument;
}
export interface LimitersPerTxOptions {
    package?: string;
    arguments: LimitersPerTxArguments | [
        limiters: TransactionArgument
    ];
}
/**
 * Read-only handle to the per-tx `Cooldown` limiter. Useful for off-chain indexers
 * and tests; production code should not need to reach into the limiters directly.
 */
export function limitersPerTx(options: LimitersPerTxOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["limiters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'limiters_per_tx',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LimitersMonthlyArguments {
    limiters: TransactionArgument;
}
export interface LimitersMonthlyOptions {
    package?: string;
    arguments: LimitersMonthlyArguments | [
        limiters: TransactionArgument
    ];
}
/** Read-only handle to the monthly `FixedWindow` limiter. */
export function limitersMonthly(options: LimitersMonthlyOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["limiters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'limiters_monthly',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LimitersFrequencyArguments {
    limiters: TransactionArgument;
}
export interface LimitersFrequencyOptions {
    package?: string;
    arguments: LimitersFrequencyArguments | [
        limiters: TransactionArgument
    ];
}
/** Read-only handle to the frequency `Cooldown` limiter. */
export function limitersFrequency(options: LimitersFrequencyOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["limiters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'policies',
        function: 'limiters_frequency',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}