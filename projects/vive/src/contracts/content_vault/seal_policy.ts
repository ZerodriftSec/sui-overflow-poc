/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { type Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
export interface SealApproveArguments {
    id: RawTransactionArgument<Array<number>>;
    registry: RawTransactionArgument<string>;
}
export interface SealApproveOptions {
    package?: string;
    arguments: SealApproveArguments | [
        id: RawTransactionArgument<Array<number>>,
        registry: RawTransactionArgument<string>
    ];
}
/**
 * Seal key-server entrypoint.
 *
 * Identity layout (after Seal strips the package-id prefix): project_id_bytes (32)
 * || file_id_bytes (32) || nonce...
 *
 * Policy: caller must hold READ on the project's AccessRegistry, and the identity
 * must be prefixed by that registry's project_id.
 */
export function sealApprove(options: SealApproveOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        'vector<u8>',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["id", "registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'seal_policy',
        function: 'seal_approve',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AssertSealApproveArguments {
    id: RawTransactionArgument<Array<number>>;
    registry: RawTransactionArgument<string>;
}
export interface AssertSealApproveOptions {
    package?: string;
    arguments: AssertSealApproveArguments | [
        id: RawTransactionArgument<Array<number>>,
        registry: RawTransactionArgument<string>
    ];
}
/** Same check exposed as a pure assert for tests / PTB composition. */
export function assertSealApprove(options: AssertSealApproveOptions) {
    const packageAddress = options.package ?? '@local-pkg/content_vault';
    const argumentsTypes = [
        'vector<u8>',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["id", "registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'seal_policy',
        function: 'assert_seal_approve',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}