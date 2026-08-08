/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * definitions, treasury timelock, per-platform rate limiters, and
 * `subscriber_count` bookkeeping.
 * 
 * caller can read it; mutating functions (`update_platform`, tier the owner is the
 * address captured at `register_platform` time and **bootstrap `admin_address`
 * style check** — mirroring `subscriptions::registry` — with a doc comment noting
 * the future the bootstrap admin pattern.
 * 
 * The platform is identified by `Platform.owner: address` (set at
 * `register_platform` to `ctx.sender()`). Mutating functions assert
 * `ctx.sender() == platform.owner`. A future hardening pass will
 * 
 * 1.  `volume_limiter` (`FixedWindow`, 30d, $1M) — bounds total withdrawal volume
 *     per 30-day window.
 * 2.  `frequency_limiter` (`Bucket`, 1000/hr, refill 100/hr) — bounds total
 *     payment frequency per platform per hour.
 * 3.  `account_billing_limiter` (`Bucket`, 10000/hr, refill 1000/hr) — bounds
 *     distinct accounts billed per hour (DoS bound).
 * 
 * All three are OZ `RateLimiter` values; `payment.move` calls `try_consume_*` and
 * observes `try_consume`'s all-or-nothing semantics (failure leaves persisted
 * state untouched).
 * 
 * Two-step `propose_treasury_change(new_addr)` →
 * `accept_treasury_change(platform, clock)` (48h timelock) pattern,
 * treasury-hijack gap.
 * 
 * Maintained by `increment_subscriber_count` / `decrement_subscriber_count` (both
 * `public(package)`). The only expected caller is `billing.move` on
 * `create_subscription` / `cancel_subscription`. Discovery is finally not broken.
 * 
 * ## Build-order note
 * 
 * module; no other module needs the type). `billing.move` consumes `tier_amount`
 * and `tier_frequency_ms` via the accessors exposed value type
 * (`store + copy + drop`) embedded in the platform's
 * `VecMap<u64, SubscriptionTier>` keyed by `tier_index` (sequential) so the index
 * is stable across deactivations.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as type_name from './deps/std/type_name.js';
import * as vec_map from './deps/sui/vec_map.js';
import * as rate_limiter from './deps/openzeppelin_utils/rate_limiter.js';
const $moduleName = '@local-pkg/subscriptions::platform';
export const SubscriptionTier = new MoveStruct({ name: `${$moduleName}::SubscriptionTier`, fields: {
        name: bcs.string(),
        amount: bcs.u64(),
        frequency_ms: bcs.u64(),
        denomination: type_name.TypeName,
        is_active: bcs.bool()
    } });
export const PendingTreasuryChange = new MoveStruct({ name: `${$moduleName}::PendingTreasuryChange`, fields: {
        new_treasury: bcs.Address,
        execute_after_ms: bcs.u64()
    } });
export const Platform = new MoveStruct({ name: `${$moduleName}::Platform`, fields: {
        id: bcs.Address,
        /** Bootstrap admin (captured from `ctx.sender()` at registration). */
        owner: bcs.Address,
        /**
         * Current treasury. All platform payments land here until a timelocked change is
         * accepted.
         */
        treasury: bcs.Address,
        /** In-flight treasury change, if any. `None` when no change is pending. */
        pending_treasury: bcs.option(PendingTreasuryChange),
        /** Display name. */
        name: bcs.string(),
        /** Display description. */
        description: bcs.string(),
        /** Category (e.g. `"AI"`, `"Media"`, `"Tools"`). */
        category: bcs.string(),
        /** Optional webhook URL for off-chain notifications. */
        webhook_url: bcs.option(bcs.string()),
        /** Verified-platform flag. Flipped by a future moderation */
        is_verified: bcs.bool(),
        /**
         * `decrement_subscriber_count`. Off-chain indexers can use this directly for
         * discovery / leaderboards.
         */
        subscriber_count: bcs.u64(),
        /** Creation timestamp (ms, Sui `Clock`). */
        created_at: bcs.u64(),
        /**
         * Sequential tiers, keyed by `tier_index`. Insertion order is the index;
         * deactivation keeps the slot populated (set `is_active = false`) so historical
         * subscriptions keep pointing at the right `tier_index`.
         */
        tiers: vec_map.VecMap(bcs.u64(), SubscriptionTier),
        /**
         * Volume limiter: `FixedWindow`, 30d, $1M default. Bounds the total withdrawal
         * volume per 30-day window.
         */
        volume_limiter: rate_limiter.RateLimiter,
        /**
         * Frequency limiter: `Bucket`, 1000/hr, refill 100/hr. Bounds the total number of
         * payments per hour.
         */
        frequency_limiter: rate_limiter.RateLimiter,
        /**
         * Account-billing limiter: `Bucket`, 10000/hr, refill 1000/hr. Bounds the distinct
         * accounts billed per hour (DoS bound).
         */
        account_billing_limiter: rate_limiter.RateLimiter,
        /** Schema version. Currently `2`. */
        version: bcs.u16()
    } });
export const PlatformRegistered = new MoveStruct({ name: `${$moduleName}::PlatformRegistered`, fields: {
        platform_id: bcs.Address,
        owner: bcs.Address,
        name: bcs.string(),
        v: bcs.u16()
    } });
export const PlatformUpdated = new MoveStruct({ name: `${$moduleName}::PlatformUpdated`, fields: {
        platform_id: bcs.Address,
        updated_by: bcs.Address,
        v: bcs.u16()
    } });
export const TierCreated = new MoveStruct({ name: `${$moduleName}::TierCreated`, fields: {
        platform_id: bcs.Address,
        tier_index: bcs.u64(),
        tier_name: bcs.string(),
        amount: bcs.u64(),
        frequency_ms: bcs.u64(),
        denomination: type_name.TypeName,
        v: bcs.u16()
    } });
export const TierDeactivated = new MoveStruct({ name: `${$moduleName}::TierDeactivated`, fields: {
        platform_id: bcs.Address,
        tier_index: bcs.u64(),
        v: bcs.u16()
    } });
export const TreasuryChangeProposed = new MoveStruct({ name: `${$moduleName}::TreasuryChangeProposed`, fields: {
        platform_id: bcs.Address,
        new_treasury: bcs.Address,
        execute_after_ms: bcs.u64(),
        v: bcs.u16()
    } });
export const TreasuryChangeAccepted = new MoveStruct({ name: `${$moduleName}::TreasuryChangeAccepted`, fields: {
        platform_id: bcs.Address,
        new_treasury: bcs.Address,
        v: bcs.u16()
    } });
export const TreasuryChangeCancelled = new MoveStruct({ name: `${$moduleName}::TreasuryChangeCancelled`, fields: {
        platform_id: bcs.Address,
        v: bcs.u16()
    } });
export const SubscriberCountChanged = new MoveStruct({ name: `${$moduleName}::SubscriberCountChanged`, fields: {
        platform_id: bcs.Address,
        new_count: bcs.u64(),
        is_increment: bcs.bool(),
        delta_magnitude: bcs.u64(),
        v: bcs.u16()
    } });
export interface NewTierArguments {
    name: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    frequencyMs: RawTransactionArgument<number | bigint>;
    denomination: TransactionArgument;
}
export interface NewTierOptions {
    package?: string;
    arguments: NewTierArguments | [
        name: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        frequencyMs: RawTransactionArgument<number | bigint>,
        denomination: TransactionArgument
    ];
}
/**
 * Construct a fresh active tier. Pure value constructor; no permission required.
 * The owner of the platform calls `create_tier` to attach the new tier; that
 * function is the one that mutates the platform.
 */
export function newTier(options: NewTierOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x1::string::String',
        'u64',
        'u64',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["name", "amount", "frequencyMs", "denomination"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'new_tier',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierNameArguments {
    t: TransactionArgument;
}
export interface TierNameOptions {
    package?: string;
    arguments: TierNameArguments | [
        t: TransactionArgument
    ];
}
/** Tier display name. */
export function tierName(options: TierNameOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierAmountArguments {
    t: TransactionArgument;
}
export interface TierAmountOptions {
    package?: string;
    arguments: TierAmountArguments | [
        t: TransactionArgument
    ];
}
/** Per-billing-cycle amount, in the smallest unit of the tier's denomination. */
export function tierAmount(options: TierAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierFrequencyMsArguments {
    t: TransactionArgument;
}
export interface TierFrequencyMsOptions {
    package?: string;
    arguments: TierFrequencyMsArguments | [
        t: TransactionArgument
    ];
}
/** Per-billing-cycle interval, in milliseconds. */
export function tierFrequencyMs(options: TierFrequencyMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_frequency_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierDenominationArguments {
    t: TransactionArgument;
}
export interface TierDenominationOptions {
    package?: string;
    arguments: TierDenominationArguments | [
        t: TransactionArgument
    ];
}
/** Coin denomination (`TypeName` of the billing token). */
export function tierDenomination(options: TierDenominationOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_denomination',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierIsActiveArguments {
    t: TransactionArgument;
}
export interface TierIsActiveOptions {
    package?: string;
    arguments: TierIsActiveArguments | [
        t: TransactionArgument
    ];
}
/**
 * True iff the tier is currently active (a deactivated tier remains in the map at
 * its original index but is rejected by `payment.move`).
 */
export function tierIsActive(options: TierIsActiveOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["t"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_is_active',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewPendingTreasuryChangeArguments {
    newTreasury: RawTransactionArgument<string>;
    executeAfterMs: RawTransactionArgument<number | bigint>;
}
export interface NewPendingTreasuryChangeOptions {
    package?: string;
    arguments: NewPendingTreasuryChangeArguments | [
        newTreasury: RawTransactionArgument<string>,
        executeAfterMs: RawTransactionArgument<number | bigint>
    ];
}
/** Build a fresh `PendingTreasuryChange`. Pure value constructor. */
export function newPendingTreasuryChange(options: NewPendingTreasuryChangeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        'address',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["newTreasury", "executeAfterMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'new_pending_treasury_change',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PendingTreasuryNewArguments {
    p: TransactionArgument;
}
export interface PendingTreasuryNewOptions {
    package?: string;
    arguments: PendingTreasuryNewArguments | [
        p: TransactionArgument
    ];
}
/** The proposed new treasury address. */
export function pendingTreasuryNew(options: PendingTreasuryNewOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'pending_treasury_new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PendingTreasuryExecuteAfterMsArguments {
    p: TransactionArgument;
}
export interface PendingTreasuryExecuteAfterMsOptions {
    package?: string;
    arguments: PendingTreasuryExecuteAfterMsArguments | [
        p: TransactionArgument
    ];
}
/** The absolute timestamp (ms) at which `accept_treasury_change` becomes valid. */
export function pendingTreasuryExecuteAfterMs(options: PendingTreasuryExecuteAfterMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'pending_treasury_execute_after_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegisterPlatformArguments {
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    category: RawTransactionArgument<string>;
    webhookUrl: RawTransactionArgument<string | null>;
}
export interface RegisterPlatformOptions {
    package?: string;
    arguments: RegisterPlatformArguments | [
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        category: RawTransactionArgument<string>,
        webhookUrl: RawTransactionArgument<string | null>
    ];
}
/**
 * Register a new platform. The caller becomes the platform owner and the initial
 * treasury. The platform is shared so any caller can read it; mutating functions
 * require the owner.
 *
 * The three rate limiters (`volume_limiter`, `frequency_limiter`, limiter state
 * via `volume_limiter(p)` / `frequency_limiter(p)` / `account_billing_limiter(p)`.
 *
 * Returns the new `Platform`'s `ID` for caller convenience. The `Platform` itself
 * is shared in this function (no separate transfer call needed).
 */
export function registerPlatform(options: RegisterPlatformOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::option::Option<0x1::string::String>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "description", "category", "webhookUrl"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'register_platform',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegisterPlatformWithTierArguments {
    name: RawTransactionArgument<string>;
    description: RawTransactionArgument<string>;
    category: RawTransactionArgument<string>;
    webhookUrl: RawTransactionArgument<string | null>;
    tierName: RawTransactionArgument<string>;
    tierAmount: RawTransactionArgument<number | bigint>;
    tierFrequencyMs: RawTransactionArgument<number | bigint>;
}
export interface RegisterPlatformWithTierOptions {
    package?: string;
    arguments: RegisterPlatformWithTierArguments | [
        name: RawTransactionArgument<string>,
        description: RawTransactionArgument<string>,
        category: RawTransactionArgument<string>,
        webhookUrl: RawTransactionArgument<string | null>,
        tierName: RawTransactionArgument<string>,
        tierAmount: RawTransactionArgument<number | bigint>,
        tierFrequencyMs: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Register a new platform and create its first tier atomically. Both operations
 * succeed or both abort — the tier is only appended if the platform registration
 * succeeds.
 *
 * Returns `(platform_id, tier_index = 0)`. Emits both `PlatformRegistered` and
 * `TierCreated`.
 *
 * The tier's `denomination` is derived from the generic type `T` via
 * `type_name::with_original_ids<T>()`.
 */
export function registerPlatformWithTier(options: RegisterPlatformWithTierOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String',
        '0x1::option::Option<0x1::string::String>',
        '0x1::string::String',
        'u64',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["name", "description", "category", "webhookUrl", "tierName", "tierAmount", "tierFrequencyMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'register_platform_with_tier',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface UpdatePlatformArguments {
    platform: RawTransactionArgument<string>;
    name: RawTransactionArgument<string | null>;
    description: RawTransactionArgument<string | null>;
    webhookUrl: RawTransactionArgument<string | null | null>;
}
export interface UpdatePlatformOptions {
    package?: string;
    arguments: UpdatePlatformArguments | [
        platform: RawTransactionArgument<string>,
        name: RawTransactionArgument<string | null>,
        description: RawTransactionArgument<string | null>,
        webhookUrl: RawTransactionArgument<string | null | null>
    ];
}
/**
 * Update platform metadata. Each parameter is a three-state `Option<Option<T>>`:
 *
 * - outer `None` → leave the field unchanged;
 * - outer `Some(None)` → clear the field (`webhook_url` only — `name` and
 *   `description` are non-optional);
 * - outer `Some(Some(v))` → set the field to `v`.
 *
 * Caller must be the platform owner. Emits `PlatformUpdated`.
 *
 * #### Aborts
 *
 * - `EInvalidOwner` if `ctx.sender() != platform.owner`.
 */
export function updatePlatform(options: UpdatePlatformOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x1::option::Option<0x1::string::String>',
        '0x1::option::Option<0x1::string::String>',
        '0x1::option::Option<0x1::option::Option<0x1::string::String>>'
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "name", "description", "webhookUrl"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'update_platform',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateTierArguments {
    platform: RawTransactionArgument<string>;
    name: RawTransactionArgument<string>;
    amount: RawTransactionArgument<number | bigint>;
    frequencyMs: RawTransactionArgument<number | bigint>;
    denomination: TransactionArgument;
}
export interface CreateTierOptions {
    package?: string;
    arguments: CreateTierArguments | [
        platform: RawTransactionArgument<string>,
        name: RawTransactionArgument<string>,
        amount: RawTransactionArgument<number | bigint>,
        frequencyMs: RawTransactionArgument<number | bigint>,
        denomination: TransactionArgument
    ];
}
/**
 * Create a new tier and append it to the platform's tier map at
 * `tier_index = vec_map::length(&tiers)` (sequential). The `is_active` field
 * defaults to `true`.
 *
 * Rejects duplicate names (compared structurally on the `String`). Rejects zero
 * `amount` and zero `frequency_ms`. Enforces `vec_map::length(&tiers) < MAX_TIERS`
 * (20).
 *
 * Caller must be the platform owner. Emits `TierCreated`.
 *
 * #### Aborts
 *
 * - `EInvalidOwner` if `ctx.sender() != platform.owner`.
 * - `EInvalidAmount` if `amount == 0`.
 * - `EInvalidFrequency` if `frequency_ms == 0`.
 * - `ETooManyTiers` if the platform already has `MAX_TIERS` tiers.
 * - `EInvalidTier` if a tier with the same `name` already exists.
 */
export function createTier(options: CreateTierOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x1::string::String',
        'u64',
        'u64',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "name", "amount", "frequencyMs", "denomination"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'create_tier',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DeactivateTierByIndexArguments {
    platform: RawTransactionArgument<string>;
    tierIndex: RawTransactionArgument<number | bigint>;
}
export interface DeactivateTierByIndexOptions {
    package?: string;
    arguments: DeactivateTierByIndexArguments | [
        platform: RawTransactionArgument<string>,
        tierIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Deactivate a tier by index. The slot remains in the map (so pointing at the
 * right place), but `is_active` flips to `false` and `payment.move` will reject
 * it.
 *
 * Caller must be the platform owner. Emits `TierDeactivated`.
 *
 * #### Aborts
 *
 * - `EInvalidOwner` if `ctx.sender() != platform.owner`.
 * - `ETierNotFound` if `tier_index >= vec_map::length(&tiers)`.
 */
export function deactivateTierByIndex(options: DeactivateTierByIndexOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "tierIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'deactivate_tier_by_index',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GetTierArguments {
    platform: RawTransactionArgument<string>;
    tierIndex: RawTransactionArgument<number | bigint>;
}
export interface GetTierOptions {
    package?: string;
    arguments: GetTierArguments | [
        platform: RawTransactionArgument<string>,
        tierIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Read-only lookup of a tier by index. Role: any caller (read-only view).
 *
 * #### Aborts
 *
 * - `ETierNotFound` if `tier_index >= vec_map::length(&tiers)`.
 */
export function getTier(options: GetTierOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "tierIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'get_tier',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProposeTreasuryChangeArguments {
    platform: RawTransactionArgument<string>;
    newTreasury: RawTransactionArgument<string>;
}
export interface ProposeTreasuryChangeOptions {
    package?: string;
    arguments: ProposeTreasuryChangeArguments | [
        platform: RawTransactionArgument<string>,
        newTreasury: RawTransactionArgument<string>
    ];
}
/**
 * Propose a new treasury address. Records the change in `pending_treasury` with
 * `execute_after_ms = now + 48h`. Only one change can be pending at a time; cancel
 * or accept first.
 *
 * Caller must be the platform owner. Emits `TreasuryChangeProposed`.
 *
 * #### Aborts
 *
 * - `EInvalidOwner` if `ctx.sender() != platform.owner`.
 * - `EZeroAddress` if `new_treasury == @0x0`.
 * - `ETreasuryChangeAlreadyPending` if a change is already pending.
 */
export function proposeTreasuryChange(options: ProposeTreasuryChangeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'address',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "newTreasury"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'propose_treasury_change',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AcceptTreasuryChangeArguments {
    platform: RawTransactionArgument<string>;
}
export interface AcceptTreasuryChangeOptions {
    package?: string;
    arguments: AcceptTreasuryChangeArguments | [
        platform: RawTransactionArgument<string>
    ];
}
/**
 * Accept a pending treasury change. After 48h, anyone can call this — the function
 * has no `ctx.sender()` check, mirroring the OZ timelock semantic where accepting
 * is permissionless once the delay elapses. The platform's `treasury` is updated
 * and `pending_treasury` is cleared.
 *
 * Emits `TreasuryChangeAccepted`.
 *
 * #### Aborts
 *
 * - `ENoPendingTreasuryChange` if there is no change pending.
 * - `ETreasuryChangeNotYetDue` if `now < pending.execute_after_ms`.
 */
export function acceptTreasuryChange(options: AcceptTreasuryChangeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'accept_treasury_change',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CancelTreasuryChangeArguments {
    platform: RawTransactionArgument<string>;
}
export interface CancelTreasuryChangeOptions {
    package?: string;
    arguments: CancelTreasuryChangeArguments | [
        platform: RawTransactionArgument<string>
    ];
}
/**
 * Cancel a pending treasury change. Clears `pending_treasury` without touching the
 * live `treasury`. Caller must be the platform owner.
 *
 * Emits `TreasuryChangeCancelled`.
 *
 * #### Aborts
 *
 * - `EInvalidOwner` if `ctx.sender() != platform.owner`.
 * - `ENoPendingTreasuryChange` if there is no change pending.
 */
export function cancelTreasuryChange(options: CancelTreasuryChangeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'cancel_treasury_change',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VolumeLimiterArguments {
    platform: RawTransactionArgument<string>;
}
export interface VolumeLimiterOptions {
    package?: string;
    arguments: VolumeLimiterArguments | [
        platform: RawTransactionArgument<string>
    ];
}
/** Read-only handle to the volume limiter. Role: any caller (read-only view). */
export function volumeLimiter(options: VolumeLimiterOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'volume_limiter',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FrequencyLimiterArguments {
    platform: RawTransactionArgument<string>;
}
export interface FrequencyLimiterOptions {
    package?: string;
    arguments: FrequencyLimiterArguments | [
        platform: RawTransactionArgument<string>
    ];
}
/** Read-only handle to the frequency limiter. Role: any caller (read-only view). */
export function frequencyLimiter(options: FrequencyLimiterOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'frequency_limiter',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AccountBillingLimiterArguments {
    platform: RawTransactionArgument<string>;
}
export interface AccountBillingLimiterOptions {
    package?: string;
    arguments: AccountBillingLimiterArguments | [
        platform: RawTransactionArgument<string>
    ];
}
/**
 * Read-only handle to the account-billing limiter. Role: any caller (read-only
 * view).
 */
export function accountBillingLimiter(options: AccountBillingLimiterOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'account_billing_limiter',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IdArguments {
    p: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** `object::id` of the platform. Role: any caller (read-only view). */
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerArguments {
    p: RawTransactionArgument<string>;
}
export interface OwnerOptions {
    package?: string;
    arguments: OwnerArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Bootstrap admin / platform owner. Role: any caller (read-only view). */
export function owner(options: OwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TreasuryArguments {
    p: RawTransactionArgument<string>;
}
export interface TreasuryOptions {
    package?: string;
    arguments: TreasuryArguments | [
        p: RawTransactionArgument<string>
    ];
}
/**
 * Current treasury. This is the address payments land at. Role: any caller
 * (read-only view).
 */
export function treasury(options: TreasuryOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'treasury',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameArguments {
    p: RawTransactionArgument<string>;
}
export interface NameOptions {
    package?: string;
    arguments: NameArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Display name. Role: any caller (read-only view). */
export function name(options: NameOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'name',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DescriptionArguments {
    p: RawTransactionArgument<string>;
}
export interface DescriptionOptions {
    package?: string;
    arguments: DescriptionArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Display description. Role: any caller (read-only view). */
export function description(options: DescriptionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'description',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CategoryArguments {
    p: RawTransactionArgument<string>;
}
export interface CategoryOptions {
    package?: string;
    arguments: CategoryArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Display category. Role: any caller (read-only view). */
export function category(options: CategoryOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'category',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WebhookUrlArguments {
    p: RawTransactionArgument<string>;
}
export interface WebhookUrlOptions {
    package?: string;
    arguments: WebhookUrlArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Optional webhook URL. Role: any caller (read-only view). */
export function webhookUrl(options: WebhookUrlOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'webhook_url',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsVerifiedArguments {
    p: RawTransactionArgument<string>;
}
export interface IsVerifiedOptions {
    package?: string;
    arguments: IsVerifiedArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Verified-platform flag. Role: any caller (read-only view). */
export function isVerified(options: IsVerifiedOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'is_verified',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SubscriberCountArguments {
    p: RawTransactionArgument<string>;
}
export interface SubscriberCountOptions {
    package?: string;
    arguments: SubscriberCountArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Role: any caller (read-only view). */
export function subscriberCount(options: SubscriberCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'subscriber_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreatedAtArguments {
    p: RawTransactionArgument<string>;
}
export interface CreatedAtOptions {
    package?: string;
    arguments: CreatedAtArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Creation timestamp (ms). Role: any caller (read-only view). */
export function createdAt(options: CreatedAtOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'created_at',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionArguments {
    p: RawTransactionArgument<string>;
}
export interface VersionOptions {
    package?: string;
    arguments: VersionArguments | [
        p: RawTransactionArgument<string>
    ];
}
/** Schema version (currently `2`). Role: any caller (read-only view). */
export function version(options: VersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TierCountArguments {
    p: RawTransactionArgument<string>;
}
export interface TierCountOptions {
    package?: string;
    arguments: TierCountArguments | [
        p: RawTransactionArgument<string>
    ];
}
/**
 * Number of tiers. Includes deactivated tiers (slots stay populated, see
 * `deactivate_tier_by_index`). Role: any caller (read-only view).
 */
export function tierCount(options: TierCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tier_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TiersArguments {
    p: RawTransactionArgument<string>;
}
export interface TiersOptions {
    package?: string;
    arguments: TiersArguments | [
        p: RawTransactionArgument<string>
    ];
}
/**
 * Read-only handle to the full tier map. Lets off-chain tooling iterate without
 * re-fetching. Role: any caller (read-only view).
 */
export function tiers(options: TiersOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'tiers',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PendingTreasuryArguments {
    p: RawTransactionArgument<string>;
}
export interface PendingTreasuryOptions {
    package?: string;
    arguments: PendingTreasuryArguments | [
        p: RawTransactionArgument<string>
    ];
}
/**
 * In-flight treasury change, or `None` if no change is pending. Role: any caller
 * (read-only view).
 */
export function pendingTreasury(options: PendingTreasuryOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["p"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'pending_treasury',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TreasuryChangeDelayMsOptions {
    package?: string;
    arguments?: [
    ];
}
/**
 * 48h treasury-change timelock (ms). Exposed for indexers and off-chain UIs that
 * want to display "executing in N hours".
 */
export function treasuryChangeDelayMs(options: TreasuryChangeDelayMsOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'treasury_change_delay_ms',
    });
}
export interface MaxTiersOptions {
    package?: string;
    arguments?: [
    ];
}
/** Maximum tier count per platform. */
export function maxTiers(options: MaxTiersOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'platform',
        function: 'max_tiers',
    });
}