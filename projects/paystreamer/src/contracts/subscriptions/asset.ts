/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Asset tag and pluggable balance container — the confidential-transfer seam.
 * 
 * This module owns two related types:
 * 
 * 1.  `Asset<T>` — a type-level tag identifying the asset a subscription is
 *     denominated in. It carries a `TypeName` of `T` for cheap registry lookups,
 *     but is otherwise a phantom-tag: the actual funds live in a
 *     `BalanceContainer<T>`, not in the `Asset<T>` itself.
 * 2.  `BalanceContainer<T>` — a tagged union of balance implementations. v2 ships
 *     only variant 0, a public `Balance<T>`. A future variant 1 (confidential
 *     `TokenAccount<T>` reference) lives in `extensions::confidential` and is
 *     purely additive: a fresh enum discriminant, a fresh constructor, and an
 *     implementation of the same 4-method interface. Core is unchanged.
 * 
 * The 4-method interface — `view_value`, `try_withdraw`, `deposit`,
 * `is_denied_for` — is the only public surface for accessing the underlying
 * balance. `account.move`, `billing.move`, and `payment.move` call these functions
 * and never touch `Balance<T>` directly.
 * 
 * Per the v2 architecture doc (§5.1, §6.3, §7.5): core is asset-agnostic. When Sui
 * confidential transfers stabilize on mainnet, the CT path is added as a new
 * variant in `extensions/confidential.move` and the contract gains a new asset
 * class without touching `account`, `billing`, `policies`, or `payment`.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as type_name from './deps/std/type_name.js';
import * as balance from './deps/sui/balance.js';
const $moduleName = '@local-pkg/subscriptions::asset';
export const Asset = new MoveStruct({ name: `${$moduleName}::Asset<phantom T>`, fields: {
        tag: type_name.TypeName
    } });
export const BalanceContainer = new MoveStruct({ name: `${$moduleName}::BalanceContainer<phantom T>`, fields: {
        /** Discriminant: 0 = public balance (v2), 1 = confidential (later). */
        variant: bcs.u8(),
        /**
         * Variant 0: the live public `Balance<T>`. Storing the actual `Balance<T>` (rather
         * than a serialized `vector<u8>` encoding) preserves `Balance`'s special abilities
         * and avoids a serialize/deserialize round-trip on every operation. A future
         * variant 1 would leave this empty and use `extension_bytes` for its own opaque
         * state.
         */
        public_balance: balance.Balance,
        /** Reserved for the future confidential extension (variant 1). Empty for variant 0. */
        extension_bytes: bcs.vector(bcs.u8())
    } });
export interface AssetOptions {
    package?: string;
    arguments?: [
    ];
    typeArguments: [
        string
    ];
}
/**
 * Constructor for an `Asset<T>` tag. The `TypeName` is captured at construction
 * time using `with_original_ids`, so the tag is stable across upgrades that do not
 * rename the type.
 *
 * Role: any caller. The `Asset<T>` is a cheap value type.
 */
export function asset(options: AssetOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'asset',
        typeArguments: options.typeArguments
    });
}
export interface TypeNameOfArguments {
    a: TransactionArgument;
}
export interface TypeNameOfOptions {
    package?: string;
    arguments: TypeNameOfArguments | [
        a: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * `TypeName` of the tagged type `T`. Useful for registry lookups and for matching
 * an `Asset<T>` against a `CoinTypeRegistry` entry.
 *
 * Role: any caller (read-only view).
 */
export function typeNameOf(options: TypeNameOfOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["a"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'type_name_of',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface NewPublicOptions {
    package?: string;
    arguments?: [
    ];
    typeArguments: [
        string
    ];
}
/**
 * Create an empty `BalanceContainer<T>` for a public-balance `T`. The discriminant
 * is 0 and `public_balance` is a zero `Balance<T>`; the first `deposit` populates
 * it.
 *
 * Role: any caller. Construction is a one-time cost at `create_account` time.
 */
export function newPublic(options: NewPublicOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'new_public',
        typeArguments: options.typeArguments
    });
}
export interface VariantArguments {
    c: TransactionArgument;
}
export interface VariantOptions {
    package?: string;
    arguments: VariantArguments | [
        c: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Variant discriminant of the container. Variant 0 = public balance (v2); future
 * variants (1, …) are confidential.
 *
 * Role: any caller (read-only view).
 */
export function variant(options: VariantOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'variant',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface ViewValueArguments {
    c: TransactionArgument;
}
export interface ViewValueOptions {
    package?: string;
    arguments: ViewValueArguments | [
        c: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * Read the current headroom in the smallest unit of `T`. For public balances, this
 * is the live `balance::value` of the stored `Balance<T>`. The `clock` argument is
 * unused in v2; it is part of the fixed interface so the confidential extension
 * can consult deny-list timing without changing callers.
 *
 * #### Aborts
 *
 * - `EVariantMismatch` if the container is not variant 0.
 */
export function viewValue(options: ViewValueOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["c"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'view_value',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface TryWithdrawArguments {
    c: TransactionArgument;
    amount: RawTransactionArgument<number | bigint>;
}
export interface TryWithdrawOptions {
    package?: string;
    arguments: TryWithdrawArguments | [
        c: TransactionArgument,
        amount: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Split off `amount` from the container and return it as a fresh `Balance<T>`. The
 * caller is responsible for turning the returned `Balance<T>` into a `Coin<T>` and
 * transferring it to the recipient (typically `coin::from_balance(b, ctx)`
 * followed by `transfer::public_transfer`); we return `Balance<T>` so the caller
 * can compose the value in a PTB.
 *
 * #### Aborts
 *
 * - `EVariantMismatch` if the container is not variant 0.
 * - `EZeroAmount` if `amount == 0`.
 * - `EInsufficientBalance` if the live headroom is below `amount`.
 */
export function tryWithdraw(options: TryWithdrawOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["c", "amount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'try_withdraw',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DepositArguments {
    c: TransactionArgument;
    coin: RawTransactionArgument<string>;
}
export interface DepositOptions {
    package?: string;
    arguments: DepositArguments | [
        c: TransactionArgument,
        coin: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Deposit a `Coin<T>` into the container. The coin is fully consumed and its
 * balance is joined onto the container's `Balance<T>`.
 *
 * #### Aborts
 *
 * - `EVariantMismatch` if the container is not variant 0.
 * - `EZeroAmount` if the coin has zero value.
 */
export function deposit(options: DepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["c", "coin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface IsDeniedForArguments {
    C: TransactionArgument;
    Addr: RawTransactionArgument<string>;
}
export interface IsDeniedForOptions {
    package?: string;
    arguments: IsDeniedForArguments | [
        C: TransactionArgument,
        Addr: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Deny-list query. For public balances there is no on-chain deny-list hook; this
 * always returns `false`. The confidential extension will override semantics here,
 * consulting its issuer's auditor / freeze list. The address parameter is the
 * would-be recipient or sender; in v2 we accept it and ignore it so the interface
 * is fixed across variants.
 */
export function isDeniedFor(options: IsDeniedForOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["C", "Addr"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'asset',
        function: 'is_denied_for',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}