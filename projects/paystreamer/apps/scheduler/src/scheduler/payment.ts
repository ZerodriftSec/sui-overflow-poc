import { Transaction } from '@mysten/sui/transactions';
import { grpcClient, getSponsorKeypair, getSponsorAddress } from '../lib/sui.js';
import { PACKAGE_ID, CLOCK_OBJECT_ID, PAYMENT_SCHEDULER_ID } from '../lib/config.js';
import { DiscoveredSubscription } from './discovery.js';

export async function processDuePayments(subscriptions: DiscoveredSubscription[]): Promise<string[]> {
  const digests: string[] = [];
  const sponsorAddress = getSponsorAddress();
  const sponsorKeypair = getSponsorKeypair();

  for (const sub of subscriptions) {
    try {
      console.log(`[Payment] Processing for Account: ${sub.accountId}`);
      const tx = new Transaction();

      const limiters = tx.moveCall({
        target: `${PACKAGE_ID}::policies::empty_limiters`,
        arguments: [tx.object(CLOCK_OBJECT_ID)],
      });

      tx.moveCall({
        target: `${PACKAGE_ID}::policies::ensure_initialized`,
        typeArguments: [sub.denomination],
        arguments: [tx.object(sub.accountId), limiters, tx.object(CLOCK_OBJECT_ID)],
      });

      tx.moveCall({
        target: `${PACKAGE_ID}::scheduler::process_due_payment`,
        typeArguments: [sub.denomination],
        arguments: [
          tx.object(PAYMENT_SCHEDULER_ID),
          tx.object(sub.platformId),
          tx.object(sub.accountId),
          limiters,
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      tx.setSender(sponsorAddress);

      const coins = await grpcClient.core.listCoins({ owner: sponsorAddress, coinType: '0x2::sui::SUI' });
      const largestCoin = coins.objects.sort((a: any, b: any) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
      if (largestCoin) {
        tx.setGasPayment([{
          objectId: largestCoin.objectId,
          version: largestCoin.version,
          digest: largestCoin.digest,
        }]);
      }

      const bytes = await tx.build({ client: grpcClient });
      const { signature } = await sponsorKeypair.signTransaction(bytes);

      const result = await grpcClient.core.executeTransaction({
        transaction: bytes,
        signatures: [signature],
        include: { effects: true },
      });

      if (result.$kind === 'FailedTransaction') {
         throw new Error(`Failed execution: ${result.FailedTransaction.status.error?.message}`);
      }

      const digest = result.Transaction.digest;
      await grpcClient.waitForTransaction({ digest });
      
      console.log(`[Payment] Success: ${digest}`);
      digests.push(digest);
    } catch (err: any) {
      console.error(`[Payment] Failed for ${sub.accountId}:`, err);
    }
  }

  return digests;
}
