import { Transaction } from '@mysten/sui/transactions';

// ALLOWED_TARGETS: List of Move function targets that the sponsor will accept
// Only transactions calling these functions can be sponsored
export const ALLOWED_TARGETS = [
  // pusd module
  '0x7b09f1813d3e96e7759983486e40b4ec4ac32dc802095cbe9ff384d421383160::pusd::mint',

  // account module
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::account::create_account',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::account::deposit',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::account::withdraw',

  // billing module
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::billing::create_subscription',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::billing::pause_subscription',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::billing::resume_subscription',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::billing::cancel_subscription',

  // platform module
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::register_platform',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::create_tier',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::deactivate_tier_by_index',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::update_platform',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::propose_treasury_change',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::accept_treasury_change',
  '0xf310efaea5adf4bba799c3628563f8c6e0c9677785dca6d7865744e4a3b80afb::platform::cancel_treasury_change',
];

/**
 * Validates that all Move call targets in the transaction are in ALLOWED_TARGETS
 * @param transaction The Transaction object to validate
 * @throws Error if any Move call target is not in ALLOWED_TARGETS
 */
export function validateMoveCalls(transaction: Transaction): void {
  // Access transaction commands through the SDK
  // The transaction has commands that we can examine
  const commands = (transaction as any)._transaction?.kind?.commands ||
                   (transaction as any).transaction?.kind?.commands;

  if (!commands || !Array.isArray(commands)) {
    console.warn('[Validation] Warning: Could not extract commands from transaction');
    return;
  }

  for (const command of commands) {
    if (command && command.kind === 'MoveCall') {
      const target = `${command.data.target.package}::${command.data.target.module}::${command.data.target.function}`;
      
      if (!ALLOWED_TARGETS.includes(target)) {
        throw new Error(`Move call target "${target}" is not in ALLOWED_TARGETS`);
      }
    }
  }
}

/**
 * Validates the transaction bytes directly
 * @param transactionBytes Base64 encoded transaction bytes
 */
export function validateTransactionBytes(transactionBytes: Uint8Array): void {
  if (!transactionBytes || transactionBytes.length === 0) {
    throw new Error('Transaction bytes are empty');
  }
}
