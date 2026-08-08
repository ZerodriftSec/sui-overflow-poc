/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import * as table from './deps/sui/table.js';
const $moduleName = '@local-pkg/content_vault::file';
export const VersionInfo = new MoveStruct({ name: `${$moduleName}::VersionInfo`, fields: {
        version: bcs.u64(),
        content_blob_id: bcs.vector(bcs.u8()),
        content_hash: bcs.vector(bcs.u8()),
        content_size: bcs.u64(),
        metadata_blob_id: bcs.vector(bcs.u8()),
        walrus_end_epoch: bcs.u64(),
        created_at_ms: bcs.u64(),
        created_by: bcs.Address
    } });
export const File = new MoveStruct({ name: `${$moduleName}::File`, fields: {
        id: bcs.Address,
        directory_id: bcs.Address,
        project_id: bcs.Address,
        name_hash: bcs.vector(bcs.u8()),
        mime_type: bcs.vector(bcs.u8()),
        current_version: bcs.u64(),
        version_count: bcs.u64(),
        versions: table.Table,
        seal_id_prefix: bcs.vector(bcs.u8()),
        created_at_ms: bcs.u64(),
        created_by: bcs.Address
    } });
export interface IdArguments {
    file: RawTransactionArgument<string>;
}
export interface IdOptions {
    package?: string;
    arguments: IdArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function id(options: IdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProjectIdArguments {
    file: RawTransactionArgument<string>;
}
export interface ProjectIdOptions {
    package?: string;
    arguments: ProjectIdArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function projectId(options: ProjectIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'project_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DirectoryIdArguments {
    file: RawTransactionArgument<string>;
}
export interface DirectoryIdOptions {
    package?: string;
    arguments: DirectoryIdArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function directoryId(options: DirectoryIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'directory_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameHashArguments {
    file: RawTransactionArgument<string>;
}
export interface NameHashOptions {
    package?: string;
    arguments: NameHashArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function nameHash(options: NameHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'name_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MimeTypeArguments {
    file: RawTransactionArgument<string>;
}
export interface MimeTypeOptions {
    package?: string;
    arguments: MimeTypeArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function mimeType(options: MimeTypeOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'mime_type',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CurrentVersionArguments {
    file: RawTransactionArgument<string>;
}
export interface CurrentVersionOptions {
    package?: string;
    arguments: CurrentVersionArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function currentVersion(options: CurrentVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'current_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionCountArguments {
    file: RawTransactionArgument<string>;
}
export interface VersionCountOptions {
    package?: string;
    arguments: VersionCountArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function versionCount(options: VersionCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'version_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealIdPrefixArguments {
    file: RawTransactionArgument<string>;
}
export interface SealIdPrefixOptions {
    package?: string;
    arguments: SealIdPrefixArguments | [
        file: RawTransactionArgument<string>
    ];
}
export function sealIdPrefix(options: SealIdPrefixOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["file"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'seal_id_prefix',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BorrowVersionArguments {
    file: RawTransactionArgument<string>;
    version: RawTransactionArgument<number | bigint>;
}
export interface BorrowVersionOptions {
    package?: string;
    arguments: BorrowVersionArguments | [
        file: RawTransactionArgument<string>,
        version: RawTransactionArgument<number | bigint>
    ];
}
export function borrowVersion(options: BorrowVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "version"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'borrow_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionContentBlobIdArguments {
    info: TransactionArgument;
}
export interface VersionContentBlobIdOptions {
    package?: string;
    arguments: VersionContentBlobIdArguments | [
        info: TransactionArgument
    ];
}
export function versionContentBlobId(options: VersionContentBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["info"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'version_content_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionMetadataBlobIdArguments {
    info: TransactionArgument;
}
export interface VersionMetadataBlobIdOptions {
    package?: string;
    arguments: VersionMetadataBlobIdArguments | [
        info: TransactionArgument
    ];
}
export function versionMetadataBlobId(options: VersionMetadataBlobIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["info"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'version_metadata_blob_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionContentSizeArguments {
    info: TransactionArgument;
}
export interface VersionContentSizeOptions {
    package?: string;
    arguments: VersionContentSizeArguments | [
        info: TransactionArgument
    ];
}
export function versionContentSize(options: VersionContentSizeOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["info"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'version_content_size',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionWalrusEndEpochArguments {
    info: TransactionArgument;
}
export interface VersionWalrusEndEpochOptions {
    package?: string;
    arguments: VersionWalrusEndEpochArguments | [
        info: TransactionArgument
    ];
}
export function versionWalrusEndEpoch(options: VersionWalrusEndEpochOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["info"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'version_walrus_end_epoch',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateFileArguments {
    directory: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    mimeType: RawTransactionArgument<Array<number>>;
    contentBlobId: RawTransactionArgument<Array<number>>;
    contentHash: RawTransactionArgument<Array<number>>;
    contentSize: RawTransactionArgument<number | bigint>;
    metadataBlobId: RawTransactionArgument<Array<number>>;
    walrusEndEpoch: RawTransactionArgument<number | bigint>;
}
export interface CreateFileOptions {
    package?: string;
    arguments: CreateFileArguments | [
        directory: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        mimeType: RawTransactionArgument<Array<number>>,
        contentBlobId: RawTransactionArgument<Array<number>>,
        contentHash: RawTransactionArgument<Array<number>>,
        contentSize: RawTransactionArgument<number | bigint>,
        metadataBlobId: RawTransactionArgument<Array<number>>,
        walrusEndEpoch: RawTransactionArgument<number | bigint>
    ];
}
/** Create a file under `directory` with an initial version. */
export function createFile(options: CreateFileOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u64',
        'vector<u8>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["directory", "registry", "nameHash", "mimeType", "contentBlobId", "contentHash", "contentSize", "metadataBlobId", "walrusEndEpoch"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'create_file',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateFileEntryArguments {
    directory: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    mimeType: RawTransactionArgument<Array<number>>;
    contentBlobId: RawTransactionArgument<Array<number>>;
    contentHash: RawTransactionArgument<Array<number>>;
    contentSize: RawTransactionArgument<number | bigint>;
    metadataBlobId: RawTransactionArgument<Array<number>>;
    walrusEndEpoch: RawTransactionArgument<number | bigint>;
}
export interface CreateFileEntryOptions {
    package?: string;
    arguments: CreateFileEntryArguments | [
        directory: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        mimeType: RawTransactionArgument<Array<number>>,
        contentBlobId: RawTransactionArgument<Array<number>>,
        contentHash: RawTransactionArgument<Array<number>>,
        contentSize: RawTransactionArgument<number | bigint>,
        metadataBlobId: RawTransactionArgument<Array<number>>,
        walrusEndEpoch: RawTransactionArgument<number | bigint>
    ];
}
export function createFileEntry(options: CreateFileEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u64',
        'vector<u8>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["directory", "registry", "nameHash", "mimeType", "contentBlobId", "contentHash", "contentSize", "metadataBlobId", "walrusEndEpoch"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'create_file_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AddVersionArguments {
    file: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    contentBlobId: RawTransactionArgument<Array<number>>;
    contentHash: RawTransactionArgument<Array<number>>;
    contentSize: RawTransactionArgument<number | bigint>;
    metadataBlobId: RawTransactionArgument<Array<number>>;
    walrusEndEpoch: RawTransactionArgument<number | bigint>;
}
export interface AddVersionOptions {
    package?: string;
    arguments: AddVersionArguments | [
        file: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        contentBlobId: RawTransactionArgument<Array<number>>,
        contentHash: RawTransactionArgument<Array<number>>,
        contentSize: RawTransactionArgument<number | bigint>,
        metadataBlobId: RawTransactionArgument<Array<number>>,
        walrusEndEpoch: RawTransactionArgument<number | bigint>
    ];
}
/** Append a new version. Does not touch the parent Directory. */
export function addVersion(options: AddVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'u64',
        'vector<u8>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "registry", "contentBlobId", "contentHash", "contentSize", "metadataBlobId", "walrusEndEpoch"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'add_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AddVersionEntryArguments {
    file: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    contentBlobId: RawTransactionArgument<Array<number>>;
    contentHash: RawTransactionArgument<Array<number>>;
    contentSize: RawTransactionArgument<number | bigint>;
    metadataBlobId: RawTransactionArgument<Array<number>>;
    walrusEndEpoch: RawTransactionArgument<number | bigint>;
}
export interface AddVersionEntryOptions {
    package?: string;
    arguments: AddVersionEntryArguments | [
        file: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        contentBlobId: RawTransactionArgument<Array<number>>,
        contentHash: RawTransactionArgument<Array<number>>,
        contentSize: RawTransactionArgument<number | bigint>,
        metadataBlobId: RawTransactionArgument<Array<number>>,
        walrusEndEpoch: RawTransactionArgument<number | bigint>
    ];
}
export function addVersionEntry(options: AddVersionEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        'vector<u8>',
        'vector<u8>',
        'u64',
        'vector<u8>',
        'u64',
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "registry", "contentBlobId", "contentHash", "contentSize", "metadataBlobId", "walrusEndEpoch"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'add_version_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MoveFileArguments {
    file: RawTransactionArgument<string>;
    fromDir: RawTransactionArgument<string>;
    toDir: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface MoveFileOptions {
    package?: string;
    arguments: MoveFileArguments | [
        file: RawTransactionArgument<string>,
        fromDir: RawTransactionArgument<string>,
        toDir: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
/** Move a file between directories in one call (O(1) table ops + pointer update). */
export function moveFile(options: MoveFileOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "fromDir", "toDir", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'move_file',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface MoveFileEntryArguments {
    file: RawTransactionArgument<string>;
    fromDir: RawTransactionArgument<string>;
    toDir: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface MoveFileEntryOptions {
    package?: string;
    arguments: MoveFileEntryArguments | [
        file: RawTransactionArgument<string>,
        fromDir: RawTransactionArgument<string>,
        toDir: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function moveFileEntry(options: MoveFileEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "fromDir", "toDir", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'move_file_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveFileArguments {
    file: RawTransactionArgument<string>;
    directory: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface RemoveFileOptions {
    package?: string;
    arguments: RemoveFileArguments | [
        file: RawTransactionArgument<string>,
        directory: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
/**
 * Remove a file entry from its directory. The File shared object remains (versions
 * preserved).
 */
export function removeFile(options: RemoveFileOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "directory", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'remove_file',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveFileEntryArguments {
    file: RawTransactionArgument<string>;
    directory: RawTransactionArgument<string>;
    registry: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface RemoveFileEntryOptions {
    package?: string;
    arguments: RemoveFileEntryArguments | [
        file: RawTransactionArgument<string>,
        directory: RawTransactionArgument<string>,
        registry: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function removeFileEntry(options: RemoveFileEntryOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        null,
        null,
        null,
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["file", "directory", "registry", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'file',
        function: 'remove_file_entry',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}