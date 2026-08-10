/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Coin type registry: multisig-managed map from coin `TypeName` to `u8`
 * discriminant.
 * 
 * This module owns the shared `CoinTypeRegistry` object that the
 * `REGISTRY_ADMIN_ROLE` holders populate to add new stablecoin types without a
 * package upgrade. The registry is the single source of truth for which coin types
 * are accepted by the protocol; `account.move` and `payment.move` look up the
 * discriminant here at account-creation time and at deposit time (denomination
 * enforcement, architecture §6.4).
 * 
 * Per the v2 architecture doc (§5.7, §6.10): stablecoin diversity is
 * **governance-extensible**. The bootstrap path uses the multisig
 * `register_coin_type<T>(ctx)` flow.
 * 
 * Discriminant 0 is reserved for native SUI.
 * 
 * `AccessControl<AC>` (see `access_control.move`) is reserved for a future
 * hardening pass. The v2 bootstrap uses a simple `admin_address` field as the
 * authority. The bootstrap admin must be rotated to the multisig in the same
 * publish tx that calls `init`-time registrations; the `rotate_admin` entry point
 * handles the rotation with an off-chain script and on-chain audit trail.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
import * as type_name from './deps/std/type_name.js';
const $moduleName = '@local-pkg/subscriptions::registry';
export const CoinTypeRegistry = new MoveStruct({ name: `${$moduleName}::CoinTypeRegistry`, fields: {
        id: bcs.Address,
        /**
         * `TypeName -> u8` discriminant. Allows forward lookup from a generic coin type to
         * its registered discriminant.
         */
        discriminants: table.Table,
        /** `u8 -> TypeName`. Reverse lookup from discriminant to type. */
        types: table.Table,
        /**
         * The address authorized to add or remove coin types. Bootstrap field; the
         * protocol-wide `AccessControl<AC>` is the source of truth
         * (`REGISTRY_ADMIN_ROLE`). We mirror the address for O(1) reads; the AC is the
         * authority.
         */
        admin_address: bcs.Address,
        /** Schema version. Bumped on metadata-format changes. */
        version: bcs.u16()
    } });
export const CoinTypeRegistered = new MoveStruct({ name: `${$moduleName}::CoinTypeRegistered`, fields: {
        coin_type: type_name.TypeName,
        discriminant: bcs.u8(),
        v: bcs.u16()
    } });
export const CoinTypeRemoved = new MoveStruct({ name: `${$moduleName}::CoinTypeRemoved`, fields: {
        type_name: type_name.TypeName,
        removed_by: bcs.Address
    } });
export interface AdminAddressArguments {
    r: RawTransactionArgument<string>;
}
export interface AdminAddressOptions {
    package?: string;
    arguments: AdminAddressArguments | [
        r: RawTransactionArgument<string>
    ];
}
/**
 * Current bootstrap admin address. The protocol-wide `AccessControl<AC>` is the
 * source of truth for the `REGISTRY_ADMIN_ROLE`; this is the O(1) mirror.
 */
export function adminAddress(options: AdminAddressOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'admin_address',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionArguments {
    r: RawTransactionArgument<string>;
}
export interface VersionOptions {
    package?: string;
    arguments: VersionArguments | [
        r: RawTransactionArgument<string>
    ];
}
/** Schema version of the registry. Bumped on metadata-format changes. */
export function version(options: VersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DiscriminantOfArguments {
    r: RawTransactionArgument<string>;
}
export interface DiscriminantOfOptions {
    package?: string;
    arguments: DiscriminantOfArguments | [
        r: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * `u8` discriminant registered against `T`, or `none` if the type is not in the
 * registry. Read-only view; safe to call from any context.
 */
export function discriminantOf(options: DiscriminantOfOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'discriminant_of',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface GetDiscriminantArguments {
    r: RawTransactionArgument<string>;
    typeNameArg: TransactionArgument;
}
export interface GetDiscriminantOptions {
    package?: string;
    arguments: GetDiscriminantArguments | [
        r: RawTransactionArgument<string>,
        typeNameArg: TransactionArgument
    ];
}
/**
 * Look up the `u8` discriminant for a `TypeName`. Aborts with `ECoinTypeNotFound`
 * if the type is not registered.
 */
export function getDiscriminant(options: GetDiscriminantOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r", "typeNameArg"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'get_discriminant',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GetTypeArguments {
    r: RawTransactionArgument<string>;
    discriminant: RawTransactionArgument<number>;
}
export interface GetTypeOptions {
    package?: string;
    arguments: GetTypeArguments | [
        r: RawTransactionArgument<string>,
        discriminant: RawTransactionArgument<number>
    ];
}
/**
 * Reverse lookup: get the `TypeName` for a `u8` discriminant. Aborts with
 * `EDiscriminantNotFound` if the discriminant is not registered.
 */
export function getType(options: GetTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["r", "discriminant"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'get_type',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegisterCoinTypeArguments {
    r: RawTransactionArgument<string>;
}
export interface RegisterCoinTypeOptions {
    package?: string;
    arguments: RegisterCoinTypeArguments | [
        r: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Register a new coin type. The caller must equal
 * `CoinTypeRegistry.admin_address`. The protocol-wide `AccessControl<AC>` is the
 * source of truth for the `REGISTRY_ADMIN_ROLE`; for v2 we use a simple
 * `admin_address` check as a bootstrap mechanism (will be replaced by
 * `Auth<REGISTRY_ADMIN_ROLE>` in a future hardening pass).
 *
 * Discriminant allocation: auto-assigns the next available `u8` discriminant by
 * finding the maximum existing discriminant in `types` and adding 1. Discriminant
 * 0 is reserved for native SUI.
 *
 * #### Aborts
 *
 * - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
 * - `ECoinTypeAlreadyRegistered` if `T` is already in the registry.
 */
export function registerCoinType(options: RegisterCoinTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'register_coin_type',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RemoveCoinTypeArguments {
    r: RawTransactionArgument<string>;
}
export interface RemoveCoinTypeOptions {
    package?: string;
    arguments: RemoveCoinTypeArguments | [
        r: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Remove a coin type. The caller must be the current admin. Emits
 * `CoinTypeRemoved`. Future registrations of the same `T` after removal are
 * allowed and re-allocate a fresh discriminant via `register_coin_type<T>`.
 *
 * #### Aborts
 *
 * - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
 * - `ECoinTypeNotFound` if `T` is not in the registry.
 */
export function removeCoinType(options: RemoveCoinTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["r"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'remove_coin_type',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface RotateAdminArguments {
    r: RawTransactionArgument<string>;
    newAdmin: RawTransactionArgument<string>;
}
export interface RotateAdminOptions {
    package?: string;
    arguments: RotateAdminArguments | [
        r: RawTransactionArgument<string>,
        newAdmin: RawTransactionArgument<string>
    ];
}
/**
 * Rotate the bootstrap admin address. Should be replaced by an OZ
 * `Auth<REGISTRY_ADMIN_ROLE>` flow in a future hardening pass. Production
 * deployments must call this once at bootstrap to transfer authority to the
 * multisig.
 *
 * #### Aborts
 *
 * - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
 * - `EZeroAddress` if `new_admin == @0x0`.
 */
export function rotateAdmin(options: RotateAdminOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["r", "newAdmin"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'registry',
        function: 'rotate_admin',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}