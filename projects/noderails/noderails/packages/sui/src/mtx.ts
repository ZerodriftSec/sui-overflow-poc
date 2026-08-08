import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import type { MtxmSendTxRequest } from '@noderails/mtxm-client';
import { withSuiRpcRetry } from './sui-rpc-retry.js';

/**
 * Build unsigned PTB bytes with sender embedded for MTXM `sponsor-sign`.
 */
export async function buildSuiSponsorSignTransactionBase64(
  tx: Transaction,
  sender: string,
  client: SuiClient,
): Promise<string> {
  tx.setSender(sender);
  const bytes = await withSuiRpcRetry(() => tx.build({ client }));
  return Buffer.from(bytes).toString('base64');
}

export async function transactionToMtxmSuiBase64(
  tx: Transaction,
  sender: string,
  client: SuiClient,
): Promise<string> {
  tx.setSender(sender);
  const bytes = await withSuiRpcRetry(() => tx.build({ client }));
  return Buffer.from(bytes).toString('base64');
}

export function mtxmSuiRawPtbPayload(params: {
  chainMtxmId: string;
  signerId: string;
  packageId: string;
  transactionBase64: string;
  metadata?: Record<string, unknown>;
}): MtxmSendTxRequest {
  return {
    chainId: params.chainMtxmId,
    signerId: params.signerId,
    to: params.packageId,
    sui: {
      transactionBase64: params.transactionBase64,
    },
    metadata: params.metadata,
  };
}

export function mtxmSuiAuthPayload(params: {
  chainMtxmId: string;
  signerId: string;
  rawPreimageBase64: string;
  domain?: { name: string; version: string; chainId: number };
}): Record<string, unknown> {
  return {
    chainId: params.chainMtxmId,
    chainType: 'SUI',
    signerId: params.signerId,
    sui: {
      domain: params.domain ?? { name: 'NodeRailsEscrow', version: '1', chainId: 201 },
      rawPreimageBase64: params.rawPreimageBase64,
    },
  };
}
