/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { type Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
export interface IsPrefixArguments {
    prefix: RawTransactionArgument<Array<number>>;
    word: RawTransactionArgument<Array<number>>;
}
export interface IsPrefixOptions {
    package?: string;
    arguments: IsPrefixArguments | [
        prefix: RawTransactionArgument<Array<number>>,
        word: RawTransactionArgument<Array<number>>
    ];
}
/** Returns true if `prefix` is a byte-prefix of `word`. */
export function isPrefix(options: IsPrefixOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        'vector<u8>',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["prefix", "word"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'utils',
        function: 'is_prefix',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NameHashArguments {
    projectId: RawTransactionArgument<string>;
    name: RawTransactionArgument<Array<number>>;
}
export interface NameHashOptions {
    package?: string;
    arguments: NameHashArguments | [
        projectId: RawTransactionArgument<string>,
        name: RawTransactionArgument<Array<number>>
    ];
}
/** Domain-separated name hash: blake2b256(project_id_bytes || name_bytes). */
export function nameHash(options: NameHashOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "name"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'utils',
        function: 'name_hash',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SealIdPrefixArguments {
    projectId: RawTransactionArgument<string>;
}
export interface SealIdPrefixOptions {
    package?: string;
    arguments: SealIdPrefixArguments | [
        projectId: RawTransactionArgument<string>
    ];
}
/**
 * Seal identity prefix binding an encryption to a project. Full identity is
 * typically: project_id_bytes || file_id_bytes || nonce.
 */
export function sealIdPrefix(options: SealIdPrefixOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'utils',
        function: 'seal_id_prefix',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BuildSealIdArguments {
    projectId: RawTransactionArgument<string>;
    fileId: RawTransactionArgument<string>;
    nonce: RawTransactionArgument<Array<number>>;
}
export interface BuildSealIdOptions {
    package?: string;
    arguments: BuildSealIdArguments | [
        projectId: RawTransactionArgument<string>,
        fileId: RawTransactionArgument<string>,
        nonce: RawTransactionArgument<Array<number>>
    ];
}
/** Build a seal identity: project_id || file_id || nonce. */
export function buildSealId(options: BuildSealIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        '0x2::object::ID',
        '0x2::object::ID',
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["projectId", "fileId", "nonce"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'utils',
        function: 'build_seal_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProjectIdBytesFromSealIdArguments {
    id: RawTransactionArgument<Array<number>>;
}
export interface ProjectIdBytesFromSealIdOptions {
    package?: string;
    arguments: ProjectIdBytesFromSealIdArguments | [
        id: RawTransactionArgument<Array<number>>
    ];
}
/** Extract project_id bytes (first 32) from a seal identity. */
export function projectIdBytesFromSealId(options: ProjectIdBytesFromSealIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        'vector<u8>'
    ] satisfies (string | null)[];
    const parameterNames = ["id"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'utils',
        function: 'project_id_bytes_from_seal_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}