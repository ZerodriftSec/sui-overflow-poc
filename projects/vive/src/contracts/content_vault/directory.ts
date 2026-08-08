/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/content_vault::directory';
export const DirEntry = new MoveStruct({ name: `${$moduleName}::DirEntry`, fields: {
        is_directory: bcs.bool(),
        object_id: bcs.Address
    } });
export const Directory = new MoveStruct({ name: `${$moduleName}::Directory`, fields: {
        id: bcs.Address,
        /** Hashed label; empty for root. */
        name_hash: bcs.vector(bcs.u8()),
        parent: bcs.option(bcs.Address),
        project_id: bcs.Address,
        entries: table.Table,
        entry_count: bcs.u64(),
        created_at_ms: bcs.u64()
    } });
export interface IdArguments {
    directory: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProjectIdArguments {
    directory: RawTransactionArgument<string>;
}
export interface ProjectIdOptions {
    package?: string;
    arguments: ProjectIdArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function projectId(options: ProjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'project_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ParentArguments {
    directory: RawTransactionArgument<string>;
}
export interface ParentOptions {
    package?: string;
    arguments: ParentArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function parent(options: ParentOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'parent',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameHashArguments {
    directory: RawTransactionArgument<string>;
}
export interface NameHashOptions {
    package?: string;
    arguments: NameHashArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function nameHash(options: NameHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'name_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EntryCountArguments {
    directory: RawTransactionArgument<string>;
}
export interface EntryCountOptions {
    package?: string;
    arguments: EntryCountArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function entryCount(options: EntryCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'entry_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ContainsArguments {
    directory: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface ContainsOptions {
    package?: string;
    arguments: ContainsArguments | [
        directory: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function contains(options: ContainsOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["directory", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'contains',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BorrowEntryArguments {
    directory: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface BorrowEntryOptions {
    package?: string;
    arguments: BorrowEntryArguments | [
        directory: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function borrowEntry(options: BorrowEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["directory", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'borrow_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EntryObjectIdArguments {
    entry: TransactionArgument;
}
export interface EntryObjectIdOptions {
    package?: string;
    arguments: EntryObjectIdArguments | [
        entry: TransactionArgument
    ];
}
export function entryObjectId(options: EntryObjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["entry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'entry_object_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EntryIsDirectoryArguments {
    entry: TransactionArgument;
}
export interface EntryIsDirectoryOptions {
    package?: string;
    arguments: EntryIsDirectoryArguments | [
        entry: TransactionArgument
    ];
}
export function entryIsDirectory(options: EntryIsDirectoryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["entry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'entry_is_directory',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateDirectoryArguments {
    parent: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface CreateDirectoryOptions {
    package?: string;
    arguments: CreateDirectoryArguments | [
        parent: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Create a subdirectory under `parent` and return it unsared for PTB chaining
 * (e.g. create nested dirs / files, then `share_directory`).
 */
export function createDirectory(options: CreateDirectoryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["parent", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'create_directory',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareDirectoryArguments {
    directory: RawTransactionArgument<string>;
}
export interface ShareDirectoryOptions {
    package?: string;
    arguments: ShareDirectoryArguments | [
        directory: RawTransactionArgument<string>
    ];
}
export function shareDirectory(options: ShareDirectoryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["directory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'share_directory',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateDirectoryEntryArguments {
    parent: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface CreateDirectoryEntryOptions {
    package?: string;
    arguments: CreateDirectoryEntryArguments | [
        parent: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function createDirectoryEntry(options: CreateDirectoryEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["parent", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'create_directory_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveDirectoryArguments {
    parent: RawTransactionArgument<string>;
    child: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface RemoveDirectoryOptions {
    package?: string;
    arguments: RemoveDirectoryArguments | [
        parent: RawTransactionArgument<string>,
        child: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
/** Remove an empty subdirectory entry from its parent. */
export function removeDirectory(options: RemoveDirectoryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["parent", "child", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'remove_directory',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveDirectoryEntryArguments {
    parent: RawTransactionArgument<string>;
    child: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface RemoveDirectoryEntryOptions {
    package?: string;
    arguments: RemoveDirectoryEntryArguments | [
        parent: RawTransactionArgument<string>,
        child: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function removeDirectoryEntry(options: RemoveDirectoryEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["parent", "child", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'remove_directory_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MoveFileEntryArguments {
    fromDir: RawTransactionArgument<string>;
    toDir: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    fileId: RawTransactionArgument<string>;
}
export interface MoveFileEntryOptions {
    package?: string;
    arguments: MoveFileEntryArguments | [
        fromDir: RawTransactionArgument<string>,
        toDir: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        fileId: RawTransactionArgument<string>
    ];
}
/**
 * Move a file entry between directories. Caller must also update the File's
 * directory_id via `file::set_directory_id` in the same PTB (or use
 * `file::move_file`).
 */
export function moveFileEntry(options: MoveFileEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>',
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["fromDir", "toDir", "registry", "nameHash", "fileId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'directory',
        function: 'move_file_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}