/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Protocol-wide access control primitives for PayStreamer v2.
 * 
 * This module owns:
 * 
 * 1.  The protocol-wide `AC` one-time witness (OTW) — the VM-required upper-case
 *     of the module name `access_control`. The OTW is consumed by
 *     `openzeppelin_access::access_control::new` to mint the protocol-wide
 *     `AccessControl<AC>` singleton.
 * 2.  The eight role types consumed by every other core module.
 * 3.  The user-facing `AccountCap` carrying the delegated permission bitfield (BUG
 *     FIX #1 from the v2 architecture doc, §2 and §5.2).
 * 
 * Per the OpenZeppelin invariant, all role types live in the same module as the
 * OTW. The `init` function mints and shares the protocol-wide `AccessControl<AC>`
 * for the global `CoinTypeRegistry` multisig; per-Platform and per-Account
 * `AccessControl<AC>` registries are minted in their own modules.
 * 
 * `Auth<Role>` is a self-validating typed witness. The phantom `AC` tag (the OTW)
 * is the type parameter on every `AccessControl<AC>` instance in the protocol.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/subscriptions::ac';
export const AC = new MoveStruct({ name: `${$moduleName}::AC`, fields: {
        dummy_field: bcs.bool()
    } });
export const PLATFORM_ADMIN_ROLE = new MoveStruct({ name: `${$moduleName}::PLATFORM_ADMIN_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const PLATFORM_SCHEDULER_ROLE = new MoveStruct({ name: `${$moduleName}::PLATFORM_SCHEDULER_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const PLATFORM_TREASURY_ROLE = new MoveStruct({ name: `${$moduleName}::PLATFORM_TREASURY_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const PLATFORM_GLOBAL_ADMIN_ROLE = new MoveStruct({ name: `${$moduleName}::PLATFORM_GLOBAL_ADMIN_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const ACCOUNT_OWNER_ROLE = new MoveStruct({ name: `${$moduleName}::ACCOUNT_OWNER_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const ACCOUNT_DEPOSITOR_ROLE = new MoveStruct({ name: `${$moduleName}::ACCOUNT_DEPOSITOR_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const ACCOUNT_AGENT_ROLE = new MoveStruct({ name: `${$moduleName}::ACCOUNT_AGENT_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const REGISTRY_ADMIN_ROLE = new MoveStruct({ name: `${$moduleName}::REGISTRY_ADMIN_ROLE`, fields: {
        dummy_field: bcs.bool()
    } });
export const AccountCap = new MoveStruct({ name: `${$moduleName}::AccountCap`, fields: {
        id: bcs.Address,
        /** ID of the `SubscriptionAccount<T>` this cap authorizes. */
        account_id: bcs.Address,
        /** Permission bitfield. `OWNER=1`, `DEPOSITOR=2`, `AGENT=4`. */
        permissions: bcs.u32(),
        /** Cap version; bumped when permissions are extended or revoked. */
        version: bcs.u8(),
        /** Creation timestamp in milliseconds (Sui `Clock`). */
        created_at: bcs.u64()
    } });
export interface NewAccountCapArguments {
    accountId: RawTransactionArgument<string>;
    permissions: RawTransactionArgument<number>;
    clockMs: RawTransactionArgument<number | bigint>;
}
export interface NewAccountCapOptions {
    package?: string;
    arguments: NewAccountCapArguments | [
        accountId: RawTransactionArgument<string>,
        permissions: RawTransactionArgument<number>,
        clockMs: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Mint a fresh `AccountCap` bound to `account_id` with the given permission
 * bitfield. The cap is returned by value; the caller is responsible for
 * transferring it to the appropriate address.
 *
 * Role: caller must already hold `ACCOUNT_OWNER_ROLE` on the account's embedded
 * `AccessControl<AC>` (checked at the call site in `account.move`).
 */
export function newAccountCap(options: NewAccountCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        '0x2::object::ID',
        'u32',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["accountId", "permissions", "clockMs"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'new_account_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AccountIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface AccountIdOptions {
    package?: string;
    arguments: AccountIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/**
 * ID of the `SubscriptionAccount<T>` this cap authorizes. Role: any caller
 * (read-only view).
 */
export function accountId(options: AccountIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'account_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PermissionsArguments {
    cap: RawTransactionArgument<string>;
}
export interface PermissionsOptions {
    package?: string;
    arguments: PermissionsArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/** Raw permission bitfield. Role: any caller (read-only view). */
export function permissions(options: PermissionsOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'permissions',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionArguments {
    cap: RawTransactionArgument<string>;
}
export interface VersionOptions {
    package?: string;
    arguments: VersionArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/** Cap version. Role: any caller (read-only view). */
export function version(options: VersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreatedAtArguments {
    cap: RawTransactionArgument<string>;
}
export interface CreatedAtOptions {
    package?: string;
    arguments: CreatedAtArguments | [
        cap: RawTransactionArgument<string>
    ];
}
/**
 * Creation timestamp in milliseconds (Sui `Clock`). Role: any caller (read-only
 * view).
 */
export function createdAt(options: CreatedAtOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'created_at',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasPermissionArguments {
    cap: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface HasPermissionOptions {
    package?: string;
    arguments: HasPermissionArguments | [
        cap: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
/**
 * True iff the cap's `permissions` bitfield contains every bit in `perm`.
 * Zero-`perm` always returns `false` (no permission is a programmer error, not a
 * positive grant). Role: any caller (read-only view).
 */
export function hasPermission(options: HasPermissionOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'u32'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'has_permission',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PermissionOwnerOptions {
    package?: string;
    arguments?: [
    ];
}
/** Owner permission bit (value `1`). Role: any caller (read-only view). */
export function permissionOwner(options: PermissionOwnerOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'permission_owner',
    });
}
export interface PermissionDepositorOptions {
    package?: string;
    arguments?: [
    ];
}
/** Depositor permission bit (value `2`). Role: any caller (read-only view). */
export function permissionDepositor(options: PermissionDepositorOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'permission_depositor',
    });
}
export interface PermissionAgentOptions {
    package?: string;
    arguments?: [
    ];
}
/** Agent permission bit (value `4`). Role: any caller (read-only view). */
export function permissionAgent(options: PermissionAgentOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'permission_agent',
    });
}
export interface TransferAccountCapArguments {
    cap: RawTransactionArgument<string>;
    recipient: RawTransactionArgument<string>;
}
export interface TransferAccountCapOptions {
    package?: string;
    arguments: TransferAccountCapArguments | [
        cap: RawTransactionArgument<string>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Transfer a freshly-minted `AccountCap` to a recipient. Since `AccountCap` is
 * `key`-only (not `store`) per the design doc (§5.2: "non-transferable by
 * default"), the only way to relocate it on chain is via this helper. This is
 * intentionally narrow: the cap is minted and then handed to the user exactly
 * once. Subsequent re-transfers are a future hardening pass (the v1→v2 migration
 * path will add a `transfer_account_cap_to`).
 *
 * Role: any caller. The cap is `key`-only, so the only entity that can pass it to
 * this function is the one that just minted or currently holds it.
 */
export function transferAccountCap(options: TransferAccountCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'ac',
        function: 'transfer_account_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}