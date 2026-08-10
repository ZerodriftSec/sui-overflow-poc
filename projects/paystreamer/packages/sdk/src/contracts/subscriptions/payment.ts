/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `process_due_payment` funds. It is called by `scheduler.move` (the
 * permissionless on-chain entry point) after the global circuit breaker, the
 * global pause flag, and the platform's `PLATFORM_SCHEDULER_ROLE` grant have been
 * checked upstream. The function then verifies the per-subscription schedule, runs
 * the per-platform rate limiters, performs the two-pass policy evaluation, and
 * uses the address-balance model to transfer funds directly from the subscriber's
 * address to the platform treasury.
 * 
 * ## Address-balance payment flow
 * 
 * The payment uses Sui's address balance model:
 * 
 * 1.  Create a withdrawal from the subscriber's address balance
 * 2.  Redeem the withdrawal to get `Balance<T>`
 * 3.  Send the balance to the platform treasury
 * 
 * ## Error code range
 * 
 * `billing.move` for sibling ranges.
 */

import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/subscriptions::payment';
export const PaymentProcessed = new MoveStruct({ name: `${$moduleName}::PaymentProcessed`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        amount: bcs.u64(),
        policy_failures_count: bcs.u64(),
        nonce: bcs.u64(),
        v: bcs.u16()
    } });
export const PaymentFailed = new MoveStruct({ name: `${$moduleName}::PaymentFailed`, fields: {
        account_id: bcs.Address,
        platform_id: bcs.Address,
        amount: bcs.u64(),
        reason: bcs.u64(),
        v: bcs.u16()
    } });
export interface ProcessDuePaymentArguments {
    platform: RawTransactionArgument<string>;
    account: RawTransactionArgument<string>;
    policyLimiters: TransactionArgument;
}
export interface ProcessDuePaymentOptions {
    package?: string;
    arguments: ProcessDuePaymentArguments | [
        platform: RawTransactionArgument<string>,
        account: RawTransactionArgument<string>,
        policyLimiters: TransactionArgument
    ];
    typeArguments: [
        string
    ];
}
/**
 * THE single money-moving path. Called by `scheduler.move` (which has already
 * checked the global circuit breaker, the global pause flag, and the platform's
 * `PLATFORM_SCHEDULER_ROLE` grant).
 *
 * Note: Due to Sui framework limitations, this function requires the subscriber to
 * have deposited a Coin<T> into the account first. The scheduler withdraws from
 * the account's balance and sends to treasury. This is a transitional model until
 * address-balance APIs become public.
 *
 * owns; the scheduler owns steps 1, 2, 4, 6):
 *
 * 1. Verify `can_bill` (subscription is active and due) billed amount, not a
 *    caller-supplied value)
 * 2. Check the platform's three rate limiters (`volume`, `frequency`,
 *    `account_billing`)
 * 3. Two-pass policy evaluation against the account's `PolicySet` and live
 *    `PolicyLimiters`
 * 4. Withdraw from account's stored balance
 * 5. Send to treasury via `sui::coin::send_funds`
 * 6. `record_payment` on the subscription (advances schedule, bumps the
 *    per-subscription nonce) and `bump_nonce` on the step 10)
 * 7. Emit `PaymentProcessed` with the policy results
 *
 * On a policy violation, `record_failed_payment` is called so the subscription's
 * retry state (attempt_count, last_attempt_time) is correctly stamped for the next
 * call. On other failures (`ENotDue`, `EPlatformRateLimited`, `EZeroAmount`) the
 * call aborts before any state change; the `PaymentFailed` event records the
 * reason.
 */
export function processDuePayment(options: ProcessDuePaymentOptions) {
    const packageAddress = options.package ?? '@local-pkg/subscriptions';
    const argumentsTypes = [
        null,
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["platform", "account", "policyLimiters"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'payment',
        function: 'process_due_payment',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}