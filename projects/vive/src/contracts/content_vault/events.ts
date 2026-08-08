/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/content_vault::events';
export const ProjectCreated = new MoveStruct({ name: `${$moduleName}::ProjectCreated`, fields: {
        project_id: bcs.Address,
        root_directory_id: bcs.Address,
        access_registry_id: bcs.Address,
        created_by: bcs.Address
    } });
export const AccessGranted = new MoveStruct({ name: `${$moduleName}::AccessGranted`, fields: {
        project_id: bcs.Address,
        who: bcs.Address,
        perm: bcs.u8()
    } });
export const AccessRevoked = new MoveStruct({ name: `${$moduleName}::AccessRevoked`, fields: {
        project_id: bcs.Address,
        who: bcs.Address
    } });
export const DirectoryCreated = new MoveStruct({ name: `${$moduleName}::DirectoryCreated`, fields: {
        project_id: bcs.Address,
        directory_id: bcs.Address,
        parent_id: bcs.Address,
        name_hash: bcs.vector(bcs.u8()),
        created_by: bcs.Address
    } });
export const FileCreated = new MoveStruct({ name: `${$moduleName}::FileCreated`, fields: {
        project_id: bcs.Address,
        file_id: bcs.Address,
        directory_id: bcs.Address,
        name_hash: bcs.vector(bcs.u8()),
        created_by: bcs.Address
    } });
export const VersionAdded = new MoveStruct({ name: `${$moduleName}::VersionAdded`, fields: {
        project_id: bcs.Address,
        file_id: bcs.Address,
        version: bcs.u64(),
        content_blob_id: bcs.vector(bcs.u8()),
        metadata_blob_id: bcs.vector(bcs.u8()),
        created_by: bcs.Address
    } });
export const FileMoved = new MoveStruct({ name: `${$moduleName}::FileMoved`, fields: {
        project_id: bcs.Address,
        file_id: bcs.Address,
        from_directory_id: bcs.Address,
        to_directory_id: bcs.Address,
        name_hash: bcs.vector(bcs.u8())
    } });
export const EntryRemoved = new MoveStruct({ name: `${$moduleName}::EntryRemoved`, fields: {
        project_id: bcs.Address,
        directory_id: bcs.Address,
        name_hash: bcs.vector(bcs.u8()),
        is_directory: bcs.bool()
    } });
export interface EmitProjectCreatedArguments {
    projectId: RawTransactionArgument<string>;
    rootDirectoryId: RawTransactionArgument<string>;
    accessRegistryId: RawTransactionArgument<string>;
    createdBy: RawTransactionArgument<string>;
}
export interface EmitProjectCreatedOptions {
    package?: string;
    arguments: EmitProjectCreatedArguments | [
        projectId: RawTransactionArgument<string>,
        rootDirectoryId: RawTransactionArgument<string>,
        accessRegistryId: RawTransactionArgument<string>,
        createdBy: RawTransactionArgument<string>
    ];
}
export function emitProjectCreated(options: EmitProjectCreatedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "rootDirectoryId", "accessRegistryId", "createdBy"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_project_created',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitAccessGrantedArguments {
    projectId: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
    perm: RawTransactionArgument<number>;
}
export interface EmitAccessGrantedOptions {
    package?: string;
    arguments: EmitAccessGrantedArguments | [
        projectId: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>,
        perm: RawTransactionArgument<number>
    ];
}
export function emitAccessGranted(options: EmitAccessGrantedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        'address',
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "who", "perm"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_access_granted',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitAccessRevokedArguments {
    projectId: RawTransactionArgument<string>;
    who: RawTransactionArgument<string>;
}
export interface EmitAccessRevokedOptions {
    package?: string;
    arguments: EmitAccessRevokedArguments | [
        projectId: RawTransactionArgument<string>,
        who: RawTransactionArgument<string>
    ];
}
export function emitAccessRevoked(options: EmitAccessRevokedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "who"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_access_revoked',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitDirectoryCreatedArguments {
    projectId: RawTransactionArgument<string>;
    directoryId: RawTransactionArgument<string>;
    parentId: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    createdBy: RawTransactionArgument<string>;
}
export interface EmitDirectoryCreatedOptions {
    package?: string;
    arguments: EmitDirectoryCreatedArguments | [
        projectId: RawTransactionArgument<string>,
        directoryId: RawTransactionArgument<string>,
        parentId: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        createdBy: RawTransactionArgument<string>
    ];
}
export function emitDirectoryCreated(options: EmitDirectoryCreatedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        'vector<u8>',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "directoryId", "parentId", "nameHash", "createdBy"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_directory_created',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitFileCreatedArguments {
    projectId: RawTransactionArgument<string>;
    fileId: RawTransactionArgument<string>;
    directoryId: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    createdBy: RawTransactionArgument<string>;
}
export interface EmitFileCreatedOptions {
    package?: string;
    arguments: EmitFileCreatedArguments | [
        projectId: RawTransactionArgument<string>,
        fileId: RawTransactionArgument<string>,
        directoryId: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        createdBy: RawTransactionArgument<string>
    ];
}
export function emitFileCreated(options: EmitFileCreatedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        'vector<u8>',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "fileId", "directoryId", "nameHash", "createdBy"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_file_created',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitVersionAddedArguments {
    projectId: RawTransactionArgument<string>;
    fileId: RawTransactionArgument<string>;
    version: RawTransactionArgument<number | bigint>;
    contentBlobId: RawTransactionArgument<Array<number>>;
    metadataBlobId: RawTransactionArgument<Array<number>>;
    createdBy: RawTransactionArgument<string>;
}
export interface EmitVersionAddedOptions {
    package?: string;
    arguments: EmitVersionAddedArguments | [
        projectId: RawTransactionArgument<string>,
        fileId: RawTransactionArgument<string>,
        version: RawTransactionArgument<number | bigint>,
        contentBlobId: RawTransactionArgument<Array<number>>,
        metadataBlobId: RawTransactionArgument<Array<number>>,
        createdBy: RawTransactionArgument<string>
    ];
}
export function emitVersionAdded(options: EmitVersionAddedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        'u64',
        'vector<u8>',
        'vector<u8>',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "fileId", "version", "contentBlobId", "metadataBlobId", "createdBy"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_version_added',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitFileMovedArguments {
    projectId: RawTransactionArgument<string>;
    fileId: RawTransactionArgument<string>;
    fromDirectoryId: RawTransactionArgument<string>;
    toDirectoryId: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
}
export interface EmitFileMovedOptions {
    package?: string;
    arguments: EmitFileMovedArguments | [
        projectId: RawTransactionArgument<string>,
        fileId: RawTransactionArgument<string>,
        fromDirectoryId: RawTransactionArgument<string>,
        toDirectoryId: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>
    ];
}
export function emitFileMoved(options: EmitFileMovedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        '0x2::object::ID',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "fileId", "fromDirectoryId", "toDirectoryId", "nameHash"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_file_moved',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitEntryRemovedArguments {
    projectId: RawTransactionArgument<string>;
    directoryId: RawTransactionArgument<string>;
    nameHash: RawTransactionArgument<Array<number>>;
    isDirectory: RawTransactionArgument<boolean>;
}
export interface EmitEntryRemovedOptions {
    package?: string;
    arguments: EmitEntryRemovedArguments | [
        projectId: RawTransactionArgument<string>,
        directoryId: RawTransactionArgument<string>,
        nameHash: RawTransactionArgument<Array<number>>,
        isDirectory: RawTransactionArgument<boolean>
    ];
}
export function emitEntryRemoved(options: EmitEntryRemovedOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        'vector<u8>',
        'bool'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "directoryId", "nameHash", "isDirectory"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'events',
        function: 'emit_entry_removed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}