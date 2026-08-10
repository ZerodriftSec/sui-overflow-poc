/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `SubscriptionAccount<T>` — the core user-facing object in PayStreamer v2.
 * 
 * This module owns:
 * 
 * 1.  The `SubscriptionV1` value type (per Option C in the design notes: declared
 *     here with the full field set; `billing.move` augments with mutators and
 *     event emissions without redefining the type).
 * 2.  The `PolicySet` value type (same pattern; `policies.move` augments with
 *     evaluation, two-pass consume, and event emissions).
 * 3.  The `AccountStatus` lifecycle enum (active / paused / closed).
 * 4.  The shared `SubscriptionAccount<T>` object plus its discovery handle
 *     `AccountCap`.
 * 
 * ## Authority model (architecture §7.1)
 * 
 * The v2 authority model is `AccountCap` (discovery) + `AccountCap.permissions`
 * (bitfield authority). There is no embedded `AccessControl<AC>` per account: the
 * OZ `AccessControl` consumes its OTW exactly once at `init`, so per-account ACs
 * are infeasible (and unnecessary — see `access_control.move`). Role checks in
 * this module therefore consult `has_permission(cap, perm)` against the bitfield
 * on the cap, not an embedded AC.
 * 
 * Per the v2 design doc (§5.2, §6.4, §7.7), this module:
 * 
 * - holds a `VecMap<ID, SubscriptionV1>` per the project rules (CLAUDE.md:
 *   subscriptions remain embedded, not standalone objects);
 * - cascades `pause_account` to all active subscriptions (BUG FIX #8);
 * - emits `v: u16 = 2` on every event for indexer discrimination.
 * 
 * ## Build-order note
 * 
 * `SubscriptionV1` and `PolicySet` are declared here per Option C of the design
 * notes. Downstream `billing.move` and `policies.move` add behavior (mutators,
 * event emissions, evaluation) without redefining the types. The v1 module was the
 * style reference for header, imports, and sectioning.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as balance_1 from './deps/sui/balance.js';
import * as vec_map from './deps/sui/vec_map.js';
const $moduleName = '@local-pkg/subscriptions::account';
export const SubscriptionV1 = new MoveStruct({ name: `${$moduleName}::SubscriptionV1`, fields: {
        platform_id: bcs.Address,
        tier_index: bcs.u64(),
        tier_amount: bcs.u64(),
        tier_frequency_ms: bcs.u64(),
        status: bcs.u8(),
        schedule_frequency_ms: bcs.u64(),
        next_billing_time: bcs.u64(),
        last_billing_time: bcs.u64(),
        total_paid: bcs.u64(),
        payment_count: bcs.u64(),
        last_attempt_time: bcs.u64(),
        attempt_count: bcs.u8(),
        max_attempts: bcs.u8(),
        nonce: bcs.u64(),
        created_at: bcs.u64(),
        updated_at: bcs.u64()
    } });
export const PolicySet = new MoveStruct({ name: `${$moduleName}::PolicySet`, fields: {
        /** Per-transaction maximum amount. `0` = no cap. */
        per_tx_max: bcs.u64(),
        /** Monthly maximum amount. `0` = no cap. */
        monthly_max: bcs.u64(),
        /** Minimum balance that must remain after any withdrawal. `0` = no min. */
        min_balance: bcs.u64(),
        /** Minimum cooldown between attempts. `0` = no cooldown. */
        frequency_min_ms: bcs.u64()
    } });
export const AccountStatus = new MoveStruct({ name: `${$moduleName}::AccountStatus`, fields: {
        variant: bcs.u8()
    } });
export const SubscriptionAccount = new MoveStruct({ name: `${$moduleName}::SubscriptionAccount<phantom T>`, fields: {
        id: bcs.Address,
        /**
         * Stored balance for the account. Subscriber deposits funds via `deposit` before
         * payments are processed.
         */
        balance: balance_1.Balance,
        /**
         * Per-platform subscriptions, keyed by `platform_id`. The project rules
         * (CLAUDE.md) keep them embedded; the wrapper type `SubscriptionV1` enables
         * in-place upgrade to V2.
         */
        subscriptions: vec_map.VecMap(bcs.Address, SubscriptionV1),
        /** Policy set. Replaced wholesale via `update_policies`. */
        policies: PolicySet,
        /** Lifecycle status. Pause cascades to subscriptions; close is terminal. */
        status: AccountStatus,
        /** Creation timestamp (ms, Sui `Clock`). */
        created_at: bcs.u64(),
        /**
         * Per-account replay nonce. Bumped on every successful payment (via `bump_nonce`
         * from `payment.move`).
         */
        nonce: bcs.u64(),
        /** Schema version (currently `2`). Bumped on account-creating migration. */
        version: bcs.u16()
    } });
export const AccountCreated = new MoveStruct({ name: `${$moduleName}::AccountCreated`, fields: {
        account_id: bcs.Address,
        cap_id: bcs.Address,
        owner: bcs.Address,
        v: bcs.u16()
    } });
export const Deposit = new MoveStruct({ name: `${$moduleName}::Deposit`, fields: {
        account_id: bcs.Address,
        depositor: bcs.Address,
        amount: bcs.u64(),
        new_balance: bcs.u64(),
        v: bcs.u16()
    } });
export const AccountPaused = new MoveStruct({ name: `${$moduleName}::AccountPaused`, fields: {
        account_id: bcs.Address,
        subscription_count: bcs.u64(),
        v: bcs.u16()
    } });
export const AccountResumed = new MoveStruct({ name: `${$moduleName}::AccountResumed`, fields: {
        account_id: bcs.Address,
        v: bcs.u16()
    } });
export const AccountClosed = new MoveStruct({ name: `${$moduleName}::AccountClosed`, fields: {
        account_id: bcs.Address,
        v: bcs.u16()
    } });
export const PoliciesUpdated = new MoveStruct({ name: `${$moduleName}::PoliciesUpdated`, fields: {
        account_id: bcs.Address,
        old_policies: PolicySet,
        new_policies: PolicySet,
        v: bcs.u16()
    } });
export interface NewSubscriptionV1Arguments {
    platformId: RawTransactionArgument<string>;
    tierIndex: RawTransactionArgument<number | bigint>;
    tierAmount: RawTransactionArgument<number | bigint>;
    tierFrequencyMs: RawTransactionArgument<number | bigint>;
    status: RawTransactionArgument<number>;
    scheduleFrequencyMs: RawTransactionArgument<number | bigint>;
    nextBillingTime: RawTransactionArgument<number | bigint>;
    lastBillingTime: RawTransactionArgument<number | bigint>;
    totalPaid: RawTransactionArgument<number | bigint>;
    paymentCount: RawTransactionArgument<number | bigint>;
    lastAttemptTime: RawTransactionArgument<number | bigint>;
    attemptCount: RawTransactionArgument<number>;
    maxAttempts: RawTransactionArgument<number>;
    nonce: RawTransactionArgument<number | bigint>;
    createdAt: RawTransactionArgument<number | bigint>;
    updatedAt: RawTransactionArgument<number | bigint>;
}
export interface NewSubscriptionV1Options {
    package?: string;
    arguments: NewSubscriptionV1Arguments | [
        platformId: RawTransactionArgument<string>,
        tierIndex: RawTransactionArgument<number | bigint>,
        tierAmount: RawTransactionArgument<number | bigint>,
        tierFrequencyMs: RawTransactionArgument<number | bigint>,
        status: RawTransactionArgument<number>,
        scheduleFrequencyMs: RawTransactionArgument<number | bigint>,
        nextBillingTime: RawTransactionArgument<number | bigint>,
        lastBillingTime: RawTransactionArgument<number | bigint>,
        totalPaid: RawTransactionArgument<number | bigint>,
        paymentCount: RawTransactionArgument<number | bigint>,
        lastAttemptTime: RawTransactionArgument<number | bigint>,
        attemptCount: RawTransactionArgument<number>,
        maxAttempts: RawTransactionArgument<number>,
        nonce: RawTransactionArgument<number | bigint>,
        createdAt: RawTransactionArgument<number | bigint>,
        updatedAt: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Build a fresh `SubscriptionV1`. The account-module owner holds the canonical
 * constructor; `billing.move` will expose higher-level
 * `create_subscription(account, ...)` that calls this. Time fields are
 * caller-supplied (use `clock.timestamp_ms()`) so the constructor remains pure and
 * testable.
 */
export function newSubscriptionV1(options: NewSubscriptionV1Options) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x2::object::ID',
        'u64',
        'u64',
        'u64',
        'u8',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u8',
        'u8',
        'u64',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["platformId", "tierIndex", "tierAmount", "tierFrequencyMs", "status", "scheduleFrequencyMs", "nextBillingTime", "lastBillingTime", "totalPaid", "paymentCount", "lastAttemptTime", "attemptCount", "maxAttempts", "nonce", "createdAt", "updatedAt"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'new_subscription_v1',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubPlatformIdArguments {
    s: TransactionArgument;
}
export interface SubPlatformIdOptions {
    package?: string;
    arguments: SubPlatformIdArguments | [
        s: TransactionArgument
    ];
}
/** `platform_id` (map key). Role: any caller (read-only view). */
export function subPlatformId(options: SubPlatformIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_platform_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubTierIndexArguments {
    s: TransactionArgument;
}
export interface SubTierIndexOptions {
    package?: string;
    arguments: SubTierIndexArguments | [
        s: TransactionArgument
    ];
}
/** `tier_index`. */
export function subTierIndex(options: SubTierIndexOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_tier_index',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubTierAmountArguments {
    s: TransactionArgument;
}
export interface SubTierAmountOptions {
    package?: string;
    arguments: SubTierAmountArguments | [
        s: TransactionArgument
    ];
}
/** `tier_amount` (smallest unit of `T`). */
export function subTierAmount(options: SubTierAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_tier_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubTierFrequencyMsArguments {
    s: TransactionArgument;
}
export interface SubTierFrequencyMsOptions {
    package?: string;
    arguments: SubTierFrequencyMsArguments | [
        s: TransactionArgument
    ];
}
/** `tier_frequency_ms` between successful payments. */
export function subTierFrequencyMs(options: SubTierFrequencyMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_tier_frequency_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubStatusArguments {
    s: TransactionArgument;
}
export interface SubStatusOptions {
    package?: string;
    arguments: SubStatusArguments | [
        s: TransactionArgument
    ];
}
/** `status` (0 active, 1 paused, 2 cancelled). */
export function subStatus(options: SubStatusOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_status',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubIsActiveArguments {
    s: TransactionArgument;
}
export interface SubIsActiveOptions {
    package?: string;
    arguments: SubIsActiveArguments | [
        s: TransactionArgument
    ];
}
/** True iff `status == 0`. */
export function subIsActive(options: SubIsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubIsPausedArguments {
    s: TransactionArgument;
}
export interface SubIsPausedOptions {
    package?: string;
    arguments: SubIsPausedArguments | [
        s: TransactionArgument
    ];
}
/** True iff `status == 1`. */
export function subIsPaused(options: SubIsPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_is_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubIsCancelledArguments {
    s: TransactionArgument;
}
export interface SubIsCancelledOptions {
    package?: string;
    arguments: SubIsCancelledArguments | [
        s: TransactionArgument
    ];
}
/** True iff `status == 2`. */
export function subIsCancelled(options: SubIsCancelledOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_is_cancelled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubScheduleFrequencyMsArguments {
    s: TransactionArgument;
}
export interface SubScheduleFrequencyMsOptions {
    package?: string;
    arguments: SubScheduleFrequencyMsArguments | [
        s: TransactionArgument
    ];
}
/** `schedule_frequency_ms` (may differ from `tier_frequency_ms` after edits). */
export function subScheduleFrequencyMs(options: SubScheduleFrequencyMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_schedule_frequency_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubNextBillingTimeArguments {
    s: TransactionArgument;
}
export interface SubNextBillingTimeOptions {
    package?: string;
    arguments: SubNextBillingTimeArguments | [
        s: TransactionArgument
    ];
}
/** `next_billing_time` (ms). */
export function subNextBillingTime(options: SubNextBillingTimeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_next_billing_time',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubLastBillingTimeArguments {
    s: TransactionArgument;
}
export interface SubLastBillingTimeOptions {
    package?: string;
    arguments: SubLastBillingTimeArguments | [
        s: TransactionArgument
    ];
}
/** `last_billing_time` (ms; 0 if never billed). */
export function subLastBillingTime(options: SubLastBillingTimeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_last_billing_time',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubTotalPaidArguments {
    s: TransactionArgument;
}
export interface SubTotalPaidOptions {
    package?: string;
    arguments: SubTotalPaidArguments | [
        s: TransactionArgument
    ];
}
/** `total_paid` lifetime. */
export function subTotalPaid(options: SubTotalPaidOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_total_paid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubPaymentCountArguments {
    s: TransactionArgument;
}
export interface SubPaymentCountOptions {
    package?: string;
    arguments: SubPaymentCountArguments | [
        s: TransactionArgument
    ];
}
/** `payment_count` lifetime. */
export function subPaymentCount(options: SubPaymentCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_payment_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubLastAttemptTimeArguments {
    s: TransactionArgument;
}
export interface SubLastAttemptTimeOptions {
    package?: string;
    arguments: SubLastAttemptTimeArguments | [
        s: TransactionArgument
    ];
}
/** `last_attempt_time` ms (for failed-attempt retry). */
export function subLastAttemptTime(options: SubLastAttemptTimeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_last_attempt_time',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubAttemptCountArguments {
    s: TransactionArgument;
}
export interface SubAttemptCountOptions {
    package?: string;
    arguments: SubAttemptCountArguments | [
        s: TransactionArgument
    ];
}
/** `attempt_count` (lifetime failed attempts; reset on success). */
export function subAttemptCount(options: SubAttemptCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_attempt_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubMaxAttemptsArguments {
    s: TransactionArgument;
}
export interface SubMaxAttemptsOptions {
    package?: string;
    arguments: SubMaxAttemptsArguments | [
        s: TransactionArgument
    ];
}
/** `max_attempts` (per cycle; 0 = no cap). */
export function subMaxAttempts(options: SubMaxAttemptsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_max_attempts',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubNonceArguments {
    s: TransactionArgument;
}
export interface SubNonceOptions {
    package?: string;
    arguments: SubNonceArguments | [
        s: TransactionArgument
    ];
}
/** `nonce` (per-subscription replay nonce; bumped on successful payment). */
export function subNonce(options: SubNonceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_nonce',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubCreatedAtArguments {
    s: TransactionArgument;
}
export interface SubCreatedAtOptions {
    package?: string;
    arguments: SubCreatedAtArguments | [
        s: TransactionArgument
    ];
}
/** `created_at` ms. */
export function subCreatedAt(options: SubCreatedAtOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_created_at',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubUpdatedAtArguments {
    s: TransactionArgument;
}
export interface SubUpdatedAtOptions {
    package?: string;
    arguments: SubUpdatedAtArguments | [
        s: TransactionArgument
    ];
}
/** `updated_at` ms. */
export function subUpdatedAt(options: SubUpdatedAtOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'sub_updated_at',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmptyPolicySetOptions {
    package?: string;
    arguments?: [
    ];
}
/**
 * Empty (no-cap) `PolicySet`. Equivalent to the v1 "effectively unlimited"
 * defaults and a safe starting point for new accounts. Role: any caller.
 */
export function emptyPolicySet(options: EmptyPolicySetOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'empty_policy_set',
    });
}
export interface NewPolicySetArguments {
    perTxMax: RawTransactionArgument<number | bigint>;
    monthlyMax: RawTransactionArgument<number | bigint>;
    minBalance: RawTransactionArgument<number | bigint>;
    frequencyMinMs: RawTransactionArgument<number | bigint>;
}
export interface NewPolicySetOptions {
    package?: string;
    arguments: NewPolicySetArguments | [
        perTxMax: RawTransactionArgument<number | bigint>,
        monthlyMax: RawTransactionArgument<number | bigint>,
        minBalance: RawTransactionArgument<number | bigint>,
        frequencyMinMs: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Custom `PolicySet` constructor. `0` on any field means "no cap for this
 * dimension" (semantics defined by `policies.move`). Role: any caller.
 */
export function newPolicySet(options: NewPolicySetOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'u64',
        'u64',
        'u64',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["perTxMax", "monthlyMax", "minBalance", "frequencyMinMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'new_policy_set',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PolicyPerTxMaxArguments {
    p: TransactionArgument;
}
export interface PolicyPerTxMaxOptions {
    package?: string;
    arguments: PolicyPerTxMaxArguments | [
        p: TransactionArgument
    ];
}
/** `per_tx_max` cap. */
export function policyPerTxMax(options: PolicyPerTxMaxOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'policy_per_tx_max',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PolicyMonthlyMaxArguments {
    p: TransactionArgument;
}
export interface PolicyMonthlyMaxOptions {
    package?: string;
    arguments: PolicyMonthlyMaxArguments | [
        p: TransactionArgument
    ];
}
/** `monthly_max` cap. */
export function policyMonthlyMax(options: PolicyMonthlyMaxOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'policy_monthly_max',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PolicyMinBalanceArguments {
    p: TransactionArgument;
}
export interface PolicyMinBalanceOptions {
    package?: string;
    arguments: PolicyMinBalanceArguments | [
        p: TransactionArgument
    ];
}
/** `min_balance` floor. */
export function policyMinBalance(options: PolicyMinBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'policy_min_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PolicyFrequencyMinMsArguments {
    p: TransactionArgument;
}
export interface PolicyFrequencyMinMsOptions {
    package?: string;
    arguments: PolicyFrequencyMinMsArguments | [
        p: TransactionArgument
    ];
}
/** `frequency_min_ms` cooldown. */
export function policyFrequencyMinMs(options: PolicyFrequencyMinMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'policy_frequency_min_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AccountStatusActiveOptions {
    package?: string;
    arguments?: [
    ];
}
/** `AccountStatus::active`. */
export function accountStatusActive(options: AccountStatusActiveOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'account_status_active',
    });
}
export interface AccountStatusPausedOptions {
    package?: string;
    arguments?: [
    ];
}
/** `AccountStatus::paused`. */
export function accountStatusPaused(options: AccountStatusPausedOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'account_status_paused',
    });
}
export interface AccountStatusClosedOptions {
    package?: string;
    arguments?: [
    ];
}
/** `AccountStatus::closed`. */
export function accountStatusClosed(options: AccountStatusClosedOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'account_status_closed',
    });
}
export interface StatusVariantArguments {
    s: TransactionArgument;
}
export interface StatusVariantOptions {
    package?: string;
    arguments: StatusVariantArguments | [
        s: TransactionArgument
    ];
}
/** Raw `u8` discriminant. */
export function statusVariant(options: StatusVariantOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'status_variant',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsActiveArguments {
    s: TransactionArgument;
}
export interface IsActiveOptions {
    package?: string;
    arguments: IsActiveArguments | [
        s: TransactionArgument
    ];
}
/** True iff `variant == 0`. */
export function isActive(options: IsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsPausedArguments {
    s: TransactionArgument;
}
export interface IsPausedOptions {
    package?: string;
    arguments: IsPausedArguments | [
        s: TransactionArgument
    ];
}
/** True iff `variant == 1`. */
export function isPaused(options: IsPausedOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'is_paused',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsClosedArguments {
    s: TransactionArgument;
}
export interface IsClosedOptions {
    package?: string;
    arguments: IsClosedArguments | [
        s: TransactionArgument
    ];
}
/** True iff `variant == 2`. */
export function isClosed(options: IsClosedOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["s"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'is_closed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateAccountArguments {
    Registry: RawTransactionArgument<string>;
}
export interface CreateAccountOptions {
    package?: string;
    arguments: CreateAccountArguments | [
        Registry: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Create a new `SubscriptionAccount<T>` and mint a fresh `AccountCap` with the
 * OWNER permission bit set. The coin `T` must be registered in the
 * `CoinTypeRegistry`; the `AccountType` is resolved at creation time and stored in
 * the account (BUG FIX #3).
 *
 * Returns the account and cap by value. The caller (PTB) is responsible for
 * `share_account` to share the account and transfer the cap to the appropriate
 * address. The cap's `account_id` field is pre-bound to the freshly-minted
 * account.
 *
 * #### Aborts
 *
 * - `ECoinTypeNotRegistered` if `T` is not in the registry.
 * - `EInvalidDiscriminant` if the registry's `u8` does not map to a built-in
 *   `AccountType` variant.
 */
export function createAccount(options: CreateAccountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["Registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'create_account',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ShareAccountArguments {
    account: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
}
export interface ShareAccountOptions {
    package?: string;
    arguments: ShareAccountArguments | [
        account: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Share the account and transfer the cap to `ctx.sender()`. The typical
 * post-`create_account` step in a PTB:
 *
 * ```ignore
 * let (account, cap) = account::create_account<T>(...);
 * account::share_account(account, cap, ctx);
 * ```
 *
 * The cap goes to the caller; the account is shared so that `payment.move` (and
 * other PTB steps) can take `&mut` on it.
 */
export function shareAccount(options: ShareAccountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account", "cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'share_account',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DepositArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    coin: RawTransactionArgument<string>;
}
export interface DepositOptions {
    package?: string;
    arguments: DepositArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        coin: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Deposit a `Coin<T>` into the account. The cap's `account_id` must match the
 * account; the cap's `permissions` bitfield must include `permission_owner()` OR
 * `permission_depositor()`. The account must not be closed.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EAccountClosed` if the account is closed.
 * - `EUnauthorized` if the cap lacks OWNER or DEPOSITOR permission.
 * - `EZeroAmount` if the coin has zero value.
 */
export function deposit(options: DepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "coin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface WithdrawArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
}
export interface WithdrawOptions {
    package?: string;
    arguments: WithdrawArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Withdraw `amount` of a `Coin<T>` from the account. The cap's `account_id` must
 * match the account; the cap's `permissions` bitfield must include
 * `permission_owner()`. The account must not be closed.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EAccountClosed` if the account is closed.
 * - `EUnauthorized` if the cap lacks the OWNER permission.
 * - `EZeroAmount` if the requested amount is zero.
 * - `EInsufficientBalance` if the account balance is less than the requested
 *   amount.
 */
export function withdraw(options: WithdrawOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'withdraw',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PauseAccountArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
}
export interface PauseAccountOptions {
    package?: string;
    arguments: PauseAccountArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Pause the account. Cascades to all active subscriptions (sets each `status == 0`
 * to `status == 1`, BUG FIX #8). The cap must hold the OWNER permission.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EAccountClosed` if the account is already closed.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 */
export function pauseAccount(options: PauseAccountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'pause_account',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ResumeAccountArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
}
export interface ResumeAccountOptions {
    package?: string;
    arguments: ResumeAccountArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Resume the account. Does NOT auto-resume subscriptions — the user must call
 * `billing::resume_subscription` per platform to prevent surprise billing (design
 * §7.7). The cap must hold the OWNER permission.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EAccountNotPaused` if the account is not in the paused state.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 */
export function resumeAccount(options: ResumeAccountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'resume_account',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CloseAccountArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
}
export interface CloseAccountOptions {
    package?: string;
    arguments: CloseAccountArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Close the account. Terminal — deposits are rejected after close. The cap must
 * hold the OWNER permission. Does NOT auto-drain remaining balance; the user or
 * `payment.move` may still pull funds out via `internal_withdraw` until the
 * container is empty.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 */
export function closeAccount(options: CloseAccountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'close_account',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UpdatePoliciesArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    newPolicies: TransactionArgument;
}
export interface UpdatePoliciesOptions {
    package?: string;
    arguments: UpdatePoliciesArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        newPolicies: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Replace the account's `PolicySet` wholesale. The cap must hold the OWNER
 * permission. Both old and new sets are emitted in the `PoliciesUpdated` event for
 * off-chain reconciliation.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 */
export function updatePolicies(options: UpdatePoliciesOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "newPolicies"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'update_policies',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface MintDelegatedCapArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    permissions: RawTransactionArgument<number>;
}
export interface MintDelegatedCapOptions {
    package?: string;
    arguments: MintDelegatedCapArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        permissions: RawTransactionArgument<number>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Mint a fresh `AccountCap` for the same account with a caller- chosen
 * `permissions` bitfield. The presented cap must hold the OWNER permission —
 * delegated-cap minting is owner-only.
 *
 * The returned cap is `key`-only (not `store`), so it is non-transferable by
 * default; the caller (PTB) transfers it to the agent address. The cap's
 * `account_id` is pre-bound to `object::id(account)`.
 *
 * The bitfield is validated by `new_account_cap` (zero and bits beyond
 * `OWNER|DEPOSITOR|AGENT` are rejected upstream).
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `ENotOwnerCap` if the cap lacks the OWNER bit.
 */
export function mintDelegatedCap(options: MintDelegatedCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        'u32',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "permissions"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'mint_delegated_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IdArguments {
    account: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** `object::id` of the account. Role: any caller (read-only view). */
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface AccountTypeOptions {
    package?: string;
    arguments?: [
    ];
    typeArguments: [
        string
    ];
}
/**
 * Coin denomination (immutable after creation). Derived from `T`'s TypeName. Role:
 * any caller (read-only view).
 */
export function accountType(options: AccountTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'account_type',
        typeArguments: options.typeArguments
    });
}
export interface BalanceArguments {
    account: RawTransactionArgument<string>;
}
export interface BalanceOptions {
    package?: string;
    arguments: BalanceArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Live headroom in the smallest unit of `T`. Role: any caller (read-only view). */
export function balance(options: BalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface StatusArguments {
    account: RawTransactionArgument<string>;
}
export interface StatusOptions {
    package?: string;
    arguments: StatusArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Account lifecycle status. Role: any caller (read-only view). */
export function status(options: StatusOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'status',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PoliciesArguments {
    account: RawTransactionArgument<string>;
}
export interface PoliciesOptions {
    package?: string;
    arguments: PoliciesArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Active `PolicySet` reference. Role: any caller (read-only view). */
export function policies(options: PoliciesOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'policies',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface NonceArguments {
    account: RawTransactionArgument<string>;
}
export interface NonceOptions {
    package?: string;
    arguments: NonceArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Per-account replay nonce. Role: any caller (read-only view). */
export function nonce(options: NonceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'nonce',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface VersionArguments {
    account: RawTransactionArgument<string>;
}
export interface VersionOptions {
    package?: string;
    arguments: VersionArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Schema version (currently `2`). Role: any caller (read-only view). */
export function version(options: VersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CreatedAtArguments {
    account: RawTransactionArgument<string>;
}
export interface CreatedAtOptions {
    package?: string;
    arguments: CreatedAtArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Creation timestamp (ms). Role: any caller (read-only view). */
export function createdAt(options: CreatedAtOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'created_at',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionsArguments {
    account: RawTransactionArgument<string>;
}
export interface SubscriptionsOptions {
    package?: string;
    arguments: SubscriptionsArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Read-only handle to the subscriptions map. `billing.move` reads from this to
 * look up per-platform state. Role: any caller (read-only view).
 */
export function subscriptions(options: SubscriptionsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'subscriptions',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface HasSubscriptionArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface HasSubscriptionOptions {
    package?: string;
    arguments: HasSubscriptionArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * True iff the account has a subscription keyed by `platform_id`. Role: any caller
 * (read-only view).
 */
export function hasSubscription(options: HasSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'has_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface GetSubscriptionArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface GetSubscriptionOptions {
    package?: string;
    arguments: GetSubscriptionArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Read-only lookup of a single subscription by `platform_id`. Role: any caller
 * (read-only view).
 */
export function getSubscription(options: GetSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'get_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionCountArguments {
    account: RawTransactionArgument<string>;
}
export interface SubscriptionCountOptions {
    package?: string;
    arguments: SubscriptionCountArguments | [
        account: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Number of embedded subscriptions. Role: any caller (read-only view). */
export function subscriptionCount(options: SubscriptionCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["account"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'account',
        function: 'subscription_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}