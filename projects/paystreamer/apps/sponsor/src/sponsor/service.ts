import { Transaction } from '@mysten/sui/transactions';
import { client, getSponsorKeypair, getSponsorAddress } from '../lib/sui.js';
import { validateMoveCalls } from './validation.js';

export interface PrepareRequest {
  transaction: string;
  userAddress: string;
}

export interface PrepareResponse {
  bytes: string;
}

export interface ExecuteRequest {
  bytes: string;
  userSignature: string;
  userAddress: string;
}

export interface ExecuteResponse {
  digest: string;
}

export interface SponsorError {
  error: string;
  code: 'VALIDATION_ERROR' | 'SUBMISSION_FAILED';
}

/**
 * Step 1: Prepare a transaction for sponsorship
 * Takes a Transaction JSON from frontend, builds with sponsor's gas, returns bytes
 */
export async function prepareTransaction(
  request: PrepareRequest
): Promise<PrepareResponse> {
  const { transaction: txJson, userAddress } = request;

  // Reconstruct transaction from JSON
  const transaction = Transaction.from(txJson);

  // Validate that all Move call targets are allowed
  try {
    validateMoveCalls(transaction);
  } catch (error) {
    throw {
      error: error instanceof Error ? error.message : 'Validation failed',
      code: 'VALIDATION_ERROR' as const,
    };
  }

  // Set sender
  transaction.setSender(userAddress);

  // Set gas owner to sponsor
  const sponsorAddress = getSponsorAddress();
  transaction.setGasOwner(sponsorAddress);

  // Fetch sponsor's SUI coins for gas payment
  const coins = await client.getCoins({
    owner: sponsorAddress,
    coinType: '0x2::sui::SUI',
  });

  if (coins.data.length === 0) {
    throw {
      error: 'Sponsor has no SUI coins for gas',
      code: 'SUBMISSION_FAILED' as const,
    };
  }

  // Use the first coin as gas payment
  const gasCoin = coins.data[0];
  transaction.setGasPayment([{
    objectId: gasCoin.coinObjectId,
    digest: gasCoin.digest,
    version: gasCoin.version,
  }]);
  transaction.setGasBudget(50000000);

  // Build the transaction with sponsor's gas
  const builtTx = await transaction.build({ client });

  // Return base64 encoded bytes
  return {
    bytes: Buffer.from(builtTx).toString('base64'),
  };
}

/**
 * Step 2: Execute a sponsored transaction
 * Takes bytes + user signature, adds sponsor signature, executes
 */
export async function executeTransaction(
  request: ExecuteRequest
): Promise<ExecuteResponse> {
  const { bytes: bytesBase64, userSignature, userAddress } = request;

  // Decode the transaction bytes
  const transactionBytes = Buffer.from(bytesBase64, 'base64');

  // Sponsor signs the transaction
  const sponsorKeypair = getSponsorKeypair();
  const { signature: sponsorSignature } = await sponsorKeypair.signTransaction(transactionBytes);

  // Combine signatures: user signature first, then sponsor signature
  const signatures = [userSignature, sponsorSignature];

  // Execute the transaction
  const result = await client.executeTransactionBlock({
    transactionBlock: transactionBytes,
    signature: signatures,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  console.log(`[Sponsor] Transaction sponsored successfully: ${result.digest}`);

  return { digest: result.digest };
}
