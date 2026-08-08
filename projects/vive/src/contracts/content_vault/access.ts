/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/content_vault::access';
export const ProjectAdminCap = new MoveStruct({ name: `${$moduleName}::ProjectAdminCap`, fields: {
        id: bcs.Address,
        project_id: bcs.Address
    } });
export const AccessRegistry = new MoveStruct({ name: `${$moduleName}::AccessRegistry`, fields: {
        id: bcs.Address,
        project_id: bcs.Address,
        grants: table.Table
    } });
export interface ReadOptions {
    package?: string;
    arguments?: [
    ];
}
export function read(options: ReadOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'read',
    });
}
export interface WriteOptions {
    package?: string;
    arguments?: [
    ];
}
export function write(options: WriteOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'write',
    });
}
export interface AdminOptions {
    package?: string;
    arguments?: [
    ];
}
export function admin(options: AdminOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'admin',
    });
}
export interface ReadWriteOptions {
    package?: string;
    arguments?: [
    ];
}
export function readWrite(options: ReadWriteOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'read_write',
    });
}
export interface FullOptions {
    package?: string;
    arguments?: [
    ];
}
export function full(options: FullOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'full',
    });
}
export interface ProjectIdArguments {
    registry: RawTransactionArgument<string>;
}
export interface ProjectIdOptions {
    package?: string;
    arguments: ProjectIdArguments | [
        registry: RawTransactionArgument<string>
    ];
}
export function projectId(options: ProjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'project_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AdminProjectIdArguments {
    cap: RawTransactionArgument<string>;
}
export interface AdminProjectIdOptions {
    package?: string;
    arguments: AdminProjectIdArguments | [
        cap: RawTransactionArgument<string>
    ];
}
export function adminProjectId(options: AdminProjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["cap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'admin_project_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RegistryIdArguments {
    registry: RawTransactionArgument<string>;
}
export interface RegistryIdOptions {
    package?: string;
    arguments: RegistryIdArguments | [
        registry: RawTransactionArgument<string>
    ];
}
export function registryId(options: RegistryIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'registry_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasPermArguments {
    registry: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface HasPermOptions {
    package?: string;
    arguments: HasPermArguments | [
        registry: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
export function hasPerm(options: HasPermOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "who", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'has_perm',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertPermArguments {
    registry: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface AssertPermOptions {
    package?: string;
    arguments: AssertPermArguments | [
        registry: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
export function assertPerm(options: AssertPermOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "who", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'assert_perm',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertAdminCapArguments {
    cap: RawTransactionArgument<string>;
    projectId: RawTransactionArgument<string>;
}
export interface AssertAdminCapOptions {
    package?: string;
    arguments: AssertAdminCapArguments | [
        cap: RawTransactionArgument<string>,
        projectId: RawTransactionArgument<string>
    ];
}
export function assertAdminCap(options: AssertAdminCapOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["cap", "projectId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'assert_admin_cap',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GrantArguments {
    registry: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface GrantOptions {
    package?: string;
    arguments: GrantArguments | [
        registry: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
export function grant(options: GrantOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "admin", "who", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'grant',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeArguments {
    registry: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
}
export interface RevokeOptions {
    package?: string;
    arguments: RevokeArguments | [
        registry: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>
    ];
}
export function revoke(options: RevokeOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "admin", "who"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'revoke',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface GrantEntryArguments {
    registry: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface GrantEntryOptions {
    package?: string;
    arguments: GrantEntryArguments | [
        registry: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
export function grantEntry(options: GrantEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "admin", "who", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'grant_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RevokeEntryArguments {
    registry: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
}
export interface RevokeEntryOptions {
    package?: string;
    arguments: RevokeEntryArguments | [
        registry: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>
    ];
}
export function revokeEntry(options: RevokeEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "admin", "who"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'access',
        function: 'revoke_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}