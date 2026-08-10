import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_NATIVE_COIN_TYPE } from '@noderails/common';
import { resolveSuiCoinType } from './sui-balance';

export type SuiEscrowObjectIds = {
  packageId: string;
  configObjectId: string;
  registryObjectId: string;
};

async function pickSuiCoinObjectId(
  client: SuiClient,
  owner: string,
  coinType: string,
): Promise<string> {
  const coins = await client.getCoins({ owner, coinType });
  const primary = coins.data[0];
  if (!primary) {
    throw new Error(`No ${coinType} coins found in wallet`);
  }
  return primary.coinObjectId;
}

async function readSubscriptionPoolBalance(
  client: SuiClient,
  params: {
    packageId: string;
    registryObjectId: string;
    coinType: string;
    payer: string;
    merchant: string;
  },
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${params.packageId}::escrow::subscription_pool_balance`,
    typeArguments: [params.coinType],
    arguments: [
      tx.object(params.registryObjectId),
      tx.pure.address(params.payer),
      tx.pure.address(params.merchant),
    ],
  });
  const insp = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: params.payer,
  });
  if (insp.error) {
    throw new Error(insp.error);
  }
  const returnValues = insp.results?.[0]?.returnValues;
  if (!returnValues?.length) {
    return 0n;
  }
  const [bytes] = returnValues[0];
  const buf = Buffer.from(bytes);
  if (buf.length < 8) {
    return 0n;
  }
  return buf.readBigUInt64LE(0);
}

export async function executeSuiFundSubscriptionPool(params: {
  objects: SuiEscrowObjectIds;
  tokenContractAddress: string;
  merchantAddress: string;
  amount: bigint;
  rpcUrl: string;
  payerAddress: string;
  signAndExecute: (tx: Transaction) => Promise<{ digest: string }>;
}): Promise<string> {
  const client = new SuiClient({ url: params.rpcUrl });
  const coinType = resolveSuiCoinType(params.tokenContractAddress);
  const tx = new Transaction();
  tx.setSender(params.payerAddress);

  const [coin] =
    coinType === SUI_NATIVE_COIN_TYPE
      ? tx.splitCoins(tx.gas, [params.amount])
      : tx.splitCoins(tx.object(await pickSuiCoinObjectId(client, params.payerAddress, coinType)), [
          params.amount,
        ]);

  tx.moveCall({
    target: `${params.objects.packageId}::escrow::fund_subscription_pool`,
    typeArguments: [coinType],
    arguments: [
      tx.object(params.objects.registryObjectId),
      tx.object(params.objects.configObjectId),
      coin,
      tx.pure.address(params.merchantAddress),
    ],
  });

  const result = await params.signAndExecute(tx);
  return result.digest;
}

export async function fetchSuiSubscriptionPoolBalance(params: {
  packageId: string;
  registryObjectId: string;
  tokenContractAddress: string;
  payer: string;
  merchant: string;
  rpcUrl: string;
}): Promise<bigint> {
  const client = new SuiClient({ url: params.rpcUrl });
  const coinType = resolveSuiCoinType(params.tokenContractAddress);
  try {
    return await readSubscriptionPoolBalance(client, {
      packageId: params.packageId,
      registryObjectId: params.registryObjectId,
      coinType,
      payer: params.payer,
      merchant: params.merchant,
    });
  } catch {
    return 0n;
  }
}
