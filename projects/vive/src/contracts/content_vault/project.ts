/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/content_vault::project';
export const Project = new MoveStruct({ name: `${$moduleName}::Project`, fields: {
        id: bcs.Address,
        /** Optional human title (non-sensitive); rich metadata stays off-chain. */
        title: bcs.string(),
        owner: bcs.Address,
        access_registry_id: bcs.Address,
        root_directory_id: bcs.Address,
        created_at_ms: bcs.u64()
    } });
export interface IdArguments {
    project: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TitleArguments {
    project: RawTransactionArgument<string>;
}
export interface TitleOptions {
    package?: string;
    arguments: TitleArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function title(options: TitleOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'title',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerArguments {
    project: RawTransactionArgument<string>;
}
export interface OwnerOptions {
    package?: string;
    arguments: OwnerArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function owner(options: OwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AccessRegistryIdArguments {
    project: RawTransactionArgument<string>;
}
export interface AccessRegistryIdOptions {
    package?: string;
    arguments: AccessRegistryIdArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function accessRegistryId(options: AccessRegistryIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'access_registry_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RootDirectoryIdArguments {
    project: RawTransactionArgument<string>;
}
export interface RootDirectoryIdOptions {
    package?: string;
    arguments: RootDirectoryIdArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function rootDirectoryId(options: RootDirectoryIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'root_directory_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreatedAtMsArguments {
    project: RawTransactionArgument<string>;
}
export interface CreatedAtMsOptions {
    package?: string;
    arguments: CreatedAtMsArguments | [
        project: RawTransactionArgument<string>
    ];
}
export function createdAtMs(options: CreatedAtMsOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'created_at_ms',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateProjectArguments {
    title: RawTransactionArgument<string>;
}
export interface CreateProjectOptions {
    package?: string;
    arguments: CreateProjectArguments | [
        title: RawTransactionArgument<string>
    ];
}
/**
 * Create a project with root directory, access registry, and admin cap. Grants the
 * creator full READ|WRITE|ADMIN permissions.
 *
 * Objects are returned unsared for PTB composability (e.g. create default
 * directories under `root`, then `finalize_project`).
 */
export function createProject(options: CreateProjectOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'create_project',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FinalizeProjectArguments {
    adminCap: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    root: RawTransactionArgument<string>;
    project: RawTransactionArgument<string>;
}
export interface FinalizeProjectOptions {
    package?: string;
    arguments: FinalizeProjectArguments | [
        adminCap: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        root: RawTransactionArgument<string>,
        project: RawTransactionArgument<string>
    ];
}
/**
 * Share registry/root/project and transfer the admin cap to the sender. Call after
 * any PTB chaining that needs the unsared objects from `create_project`.
 */
export function finalizeProject(options: FinalizeProjectOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["adminCap", "registry", "root", "project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'finalize_project',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareProjectObjectsArguments {
    registry: RawTransactionArgument<string>;
    root: RawTransactionArgument<string>;
    project: RawTransactionArgument<string>;
}
export interface ShareProjectObjectsOptions {
    package?: string;
    arguments: ShareProjectObjectsArguments | [
        registry: RawTransactionArgument<string>,
        root: RawTransactionArgument<string>,
        project: RawTransactionArgument<string>
    ];
}
/** Share the project bundle without transferring the admin cap. */
export function shareProjectObjects(options: ShareProjectObjectsOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "root", "project"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'share_project_objects',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateProjectEntryArguments {
    title: RawTransactionArgument<string>;
}
export interface CreateProjectEntryOptions {
    package?: string;
    arguments: CreateProjectEntryArguments | [
        title: RawTransactionArgument<string>
    ];
}
/** Entry wrapper: creates project and transfers admin cap to sender. */
export function createProjectEntry(options: CreateProjectEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x1::string::String',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'create_project_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetTitleArguments {
    project: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
}
export interface SetTitleOptions {
    package?: string;
    arguments: SetTitleArguments | [
        project: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>
    ];
}
/** Update the on-chain title (admin only). */
export function setTitle(options: SetTitleOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["project", "admin", "title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'set_title',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetTitleEntryArguments {
    project: RawTransactionArgument<string>;
    admin: RawTransactionArgument<string>;
    title: RawTransactionArgument<string>;
}
export interface SetTitleEntryOptions {
    package?: string;
    arguments: SetTitleEntryArguments | [
        project: RawTransactionArgument<string>,
        admin: RawTransactionArgument<string>,
        title: RawTransactionArgument<string>
    ];
}
export function setTitleEntry(options: SetTitleEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["project", "admin", "title"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'set_title_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertDirectoryInProjectArguments {
    project: RawTransactionArgument<string>;
    directory: RawTransactionArgument<string>;
}
export interface AssertDirectoryInProjectOptions {
    package?: string;
    arguments: AssertDirectoryInProjectArguments | [
        project: RawTransactionArgument<string>,
        directory: RawTransactionArgument<string>
    ];
}
/** Convenience: assert a directory belongs to this project. */
export function assertDirectoryInProject(options: AssertDirectoryInProjectOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["project", "directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'project',
        function: 'assert_directory_in_project',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}