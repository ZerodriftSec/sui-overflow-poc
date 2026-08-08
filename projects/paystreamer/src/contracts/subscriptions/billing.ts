/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `subscriptions::billing` — subscription lifecycle for PayStreamer v2.
 * 
 * This module owns the per-platform subscription state machine: creation, pause,
 * resume, cancellation, and the bookkeeping that happens on every successful or
 * failed bill. The `SubscriptionV1` value type is declared in `account.move` (per
 * the project Option-C pattern); this module adds the behavior — constructors (via
 * `account::new_subscription_v1`), mutators, lifecycle event emissions, and the
 * `can_bill` query.
 * 
 * Authority model (architecture §6.5):
 * 
 * - `create_subscription` / `pause_subscription` / `resume_subscription` /
 *   `cancel_subscription` require an `AccountCap` whose `account_id` matches the
 *   target account. The cap's OWNER permission is the authority. We assert the
 *   `account_id` match here so a cap bound to account A cannot mutate a
 *   subscription in account B; the cap is then trusted to carry the OWNER bit per
 *   `account.move`'s mint semantics.
 * - `record_payment` and `record_failed_payment` are `public(package)` so only
 *   `payment.move` (same package) can advance the schedule. The caller in
 *   `payment.move` is expected to gate the call behind `can_bill == true` so we
 *   get idempotency for free — this module does not re-check the schedule here.
 * - `can_bill` is a public read-only query: it returns `true` iff the subscription
 *   exists, is `status == 0` (active), and
 *   `clock.timestamp_ms() >= next_billing_time`.
 * 
 * All events carry `v: u16 = 2` for indexer discrimination (architecture §8). The
 * `change_kind` field on `SubscriptionUpdated` uses the spec's mapping: 0 = tier
 * change, 1 = resumed, 2 = cancelled, 3 = paused.
 * 
 * Errors use the 0x06\_\_ module-id range per the project convention.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/subscriptions::billing';
export const SubscriptionCreated = new MoveStruct({ name: `${$moduleName}::SubscriptionCreated`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        tier_index: bcs.u64(),
        tier_amount: bcs.u64(),
        tier_frequency_ms: bcs.u64(),
        v: bcs.u16()
    } });
export const SubscriptionUpdated = new MoveStruct({ name: `${$moduleName}::SubscriptionUpdated`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        change_kind: bcs.u8(),
        v: bcs.u16()
    } });
export const PaymentRecorded = new MoveStruct({ name: `${$moduleName}::PaymentRecorded`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        amount: bcs.u64(),
        new_total_paid: bcs.u64(),
        new_payment_count: bcs.u64(),
        nonce: bcs.u64(),
        v: bcs.u16()
    } });
export const FailedPaymentRecorded = new MoveStruct({ name: `${$moduleName}::FailedPaymentRecorded`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        amount: bcs.u64(),
        reason: bcs.u64(),
        v: bcs.u16()
    } });
export interface CreateSubscriptionArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
    tierIndex: RawTransactionArgument<number | bigint>;
    tierAmount: RawTransactionArgument<number | bigint>;
    tierFrequencyMs: RawTransactionArgument<number | bigint>;
}
export interface CreateSubscriptionOptions {
    package?: string;
    arguments: CreateSubscriptionArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>,
        tierIndex: RawTransactionArgument<number | bigint>,
        tierAmount: RawTransactionArgument<number | bigint>,
        tierFrequencyMs: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Embed a new subscription in the account's `VecMap`. The cap's `account_id` must
 * match the target account; the cap must hold the OWNER permission. Sets up the
 * billing schedule with `next_billing_time = now + tier_frequency_ms`.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 * - `EAccountPaused` if the account is paused.
 * - `EAccountClosed` if the account is closed.
 * - `ESubscriptionAlreadyExists` if the platform already has a sub.
 */
export function createSubscription(options: CreateSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        'u64',
        'u64',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "platformId", "tierIndex", "tierAmount", "tierFrequencyMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'create_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface PauseSubscriptionArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface PauseSubscriptionOptions {
    package?: string;
    arguments: PauseSubscriptionArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Pause an active subscription. The cap must be bound to this account and must
 * hold the OWNER permission. The subscription must currently be `status == 0`
 * (active); pausing an already paused or cancelled subscription is rejected.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 * - `ESubscriptionNotActive` if the subscription is not active.
 */
export function pauseSubscription(options: PauseSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'pause_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ResumeSubscriptionArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface ResumeSubscriptionOptions {
    package?: string;
    arguments: ResumeSubscriptionArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Resume a paused subscription. The cap must be bound to this account and must
 * hold the OWNER permission. The subscription must currently be `status == 1`
 * (paused); resuming a cancelled subscription is rejected (it must be re-created
 * from scratch).
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 * - `ESubscriptionNotPaused` if the subscription is not paused.
 */
export function resumeSubscription(options: ResumeSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'resume_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CancelSubscriptionArguments {
    cap: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface CancelSubscriptionOptions {
    package?: string;
    arguments: CancelSubscriptionArguments | [
        cap: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Cancel a subscription. Terminal: status flips to 2 and stays there. The cap must
 * be bound to this account and must hold the OWNER permission. Idempotent on
 * already-cancelled subscriptions (no event emitted on a no-op). Cancellations
 * from active or paused states both emit a single `SubscriptionUpdated` event with
 * `change_kind = 2`.
 *
 * #### Aborts
 *
 * - `EInvalidCap` if `cap.account_id != object::id(account)`.
 * - `EUnauthorized` if the cap lacks the OWNER bit.
 */
export function cancelSubscription(options: CancelSubscriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        '0x2::object::ID',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'cancel_subscription',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface CanBillArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface CanBillOptions {
    package?: string;
    arguments: CanBillArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * `true` iff the subscription exists, is active (`status == 0`), and
 * `now >= next_billing_time`. This is the only schedule query the protocol needs;
 * it intentionally does not consult `attempt_count` or `max_attempts` — the policy
 * layer (`policies.move`) and the payment flow handle the retry cap.
 */
export function canBill(options: CanBillOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'can_bill',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionStatusArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionStatusOptions {
    package?: string;
    arguments: SubscriptionStatusArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Subscription `status` (0 active, 1 paused, 2 cancelled). Aborts via
 * `vec_map::get` if the platform has no subscription.
 */
export function subscriptionStatus(options: SubscriptionStatusOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_status',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionTotalPaidArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionTotalPaidOptions {
    package?: string;
    arguments: SubscriptionTotalPaidArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Lifetime `total_paid` (smallest unit of `T`). */
export function subscriptionTotalPaid(options: SubscriptionTotalPaidOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_total_paid',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionPaymentCountArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionPaymentCountOptions {
    package?: string;
    arguments: SubscriptionPaymentCountArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Lifetime `payment_count`. */
export function subscriptionPaymentCount(options: SubscriptionPaymentCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_payment_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionNonceArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionNonceOptions {
    package?: string;
    arguments: SubscriptionNonceArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Per-subscription `nonce` (replay protection; bumped on success). */
export function subscriptionNonce(options: SubscriptionNonceOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_nonce',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionTierAmountArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionTierAmountOptions {
    package?: string;
    arguments: SubscriptionTierAmountArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** `tier_amount` snapshot from subscription creation. */
export function subscriptionTierAmount(options: SubscriptionTierAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_tier_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionTierFrequencyMsArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionTierFrequencyMsOptions {
    package?: string;
    arguments: SubscriptionTierFrequencyMsArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** `tier_frequency_ms` snapshot from subscription creation. */
export function subscriptionTierFrequencyMs(options: SubscriptionTierFrequencyMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_tier_frequency_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionNextBillingTimeArguments {
    account: RawTransactionArgument<string>;
    platformId: RawTransactionArgument<string>;
}
export interface SubscriptionNextBillingTimeOptions {
    package?: string;
    arguments: SubscriptionNextBillingTimeArguments | [
        account: RawTransactionArgument<string>,
        platformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Current `next_billing_time` (ms). */
export function subscriptionNextBillingTime(options: SubscriptionNextBillingTimeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["account", "platformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_next_billing_time',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface SubscriptionDenominationArguments {
    Account: RawTransactionArgument<string>;
    PlatformId: RawTransactionArgument<string>;
}
export interface SubscriptionDenominationOptions {
    package?: string;
    arguments: SubscriptionDenominationArguments | [
        Account: RawTransactionArgument<string>,
        PlatformId: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/** Subscription denomination (the `TypeName` of `T`). Returned by value. */
export function subscriptionDenomination(options: SubscriptionDenominationOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["Account", "PlatformId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'billing',
        function: 'subscription_denomination',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}