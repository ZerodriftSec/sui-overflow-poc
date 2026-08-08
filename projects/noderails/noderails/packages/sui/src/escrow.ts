import { Transaction } from '@mysten/sui/transactions';

export const SUI_CLOCK_OBJECT_ID = '0x6';
export const SUI_NATIVE_COIN_TYPE = '0x2::sui::SUI';

export type SuiEscrowObjectIds = {
  packageId: string;
  configObjectId: string;
  registryObjectId: string;
  walletRegistryObjectId: string;
};

export function buildCapturePaymentTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  paymentIntentId: Uint8Array;
  merchantAddress: string;
  feeBps: number;
  timelocks: Uint8Array;
  coinObjectId: string;
  platformSignature: Uint8Array;
  platformPublicKey: Uint8Array;
}): Transaction {
  if (params.paymentIntentId.length !== 32 || params.timelocks.length !== 32) {
    throw new Error('paymentIntentId and timelocks must be 32 bytes');
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::capture_payment`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
      tx.pure.address(params.merchantAddress),
      tx.pure.u16(params.feeBps),
      tx.pure.vector('u8', Array.from(params.timelocks)),
      tx.object(params.coinObjectId),
      tx.pure.vector('u8', Array.from(params.platformSignature)),
      tx.pure.vector('u8', Array.from(params.platformPublicKey)),
    ],
  });
  return tx;
}

export function buildSettlePaymentTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  paymentIntentId: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::settle_payment`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
    ],
  });
  return tx;
}

export function buildInitiateDisputeTx(params: {
  objects: SuiEscrowObjectIds;
  paymentIntentId: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::initiate_dispute`,
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
    ],
  });
  return tx;
}

export function buildRefundPaymentTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  paymentIntentId: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::refund_payment`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
    ],
  });
  return tx;
}

export function buildResolveDisputeTx(params: {
  objects: SuiEscrowObjectIds;
  coinType: string;
  paymentIntentId: Uint8Array;
  winnerAddress: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::escrow::resolve_dispute`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      tx.pure.vector('u8', Array.from(params.paymentIntentId)),
      tx.pure.address(params.winnerAddress),
    ],
  });
  return tx;
}
