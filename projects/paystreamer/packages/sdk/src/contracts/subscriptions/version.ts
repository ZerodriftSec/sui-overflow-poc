/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * The protocol-wide `CORE` one-time witness is declared in `ac.move`. from there.
 * This module owns the version triples; migration entry points across the package
 * consult `version()` to decide whether to apply.
 */

import { type Transaction } from '@mysten/sui/transactions';
export interface VersionMajorOptions {
    package?: string;
    arguments?: [
    ];
}
/** Returns the current major protocol version. Role: any caller (read-only view). */
export function versionMajor(options: VersionMajorOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'version',
        function: 'version_major',
    });
}
export interface VersionMinorOptions {
    package?: string;
    arguments?: [
    ];
}
/** Returns the current minor protocol version. Role: any caller (read-only view). */
export function versionMinor(options: VersionMinorOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'version',
        function: 'version_minor',
    });
}
export interface VersionPatchOptions {
    package?: string;
    arguments?: [
    ];
}
/** Returns the current patch protocol version. Role: any caller (read-only view). */
export function versionPatch(options: VersionPatchOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'version',
        function: 'version_patch',
    });
}
export interface VersionOptions {
    package?: string;
    arguments?: [
    ];
}
/**
 * Returns the full protocol version as `(major, minor, patch)`. Role: any caller
 * (read-only view).
 */
export function version(options: VersionOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'version',
        function: 'version',
    });
}