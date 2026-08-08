import { Transaction } from '@mysten/sui/transactions';

export type SuiMerchantManagerObjectIds = {
  packageId: string;
  configObjectId: string;
  nonceRegistryObjectId: string;
  execRoleObjectId: string;
};

export function buildExecuteNativePayoutTx(params: {
  objects: SuiMerchantManagerObjectIds;
  payoutIntentId: Uint8Array;
  merchantAddress: string;
  recipientAddress: string;
  paymentCoinObjectId: string;
  sessionExpiryMs: bigint;
  sessionSignature: Uint8Array;
  sessionPublicKey: Uint8Array;
  platformSignature: Uint8Array;
  platformPublicKey: Uint8Array;
  nonce: Uint8Array;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.objects.packageId}::payout::execute_native_payout`,
    arguments: [
      tx.object(params.objects.configObjectId),
      tx.object(params.objects.execRoleObjectId),
      tx.object(params.objects.nonceRegistryObjectId),
      tx.object('0x6'),
      tx.pure.vector('u8', Array.from(params.payoutIntentId)),
      tx.pure.address(params.merchantAddress),
      tx.pure.address(params.recipientAddress),
      tx.object(params.paymentCoinObjectId),
      tx.pure.u64(params.sessionExpiryMs),
      tx.pure.vector('u8', Array.from(params.sessionSignature)),
      tx.pure.vector('u8', Array.from(params.sessionPublicKey)),
      tx.pure.vector('u8', Array.from(params.platformSignature)),
      tx.pure.vector('u8', Array.from(params.platformPublicKey)),
      tx.pure.vector('u8', Array.from(params.nonce)),
    ],
  });
  return tx;
}
