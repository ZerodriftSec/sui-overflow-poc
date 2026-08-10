import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { resolveSuiBrowserRpcUrl } from './sui-rpc';
import { API_BASE } from './api';

const SUI_NATIVE_COIN_TYPE = '0x2::sui::SUI';

export type SuiServerCaptureData = {
  chainType: 'SUI';
  chainId: number;
  packageId: string;
  configObjectId: string;
  registryObjectId: string;
  coinType: string;
  paymentIntentIdHex: string;
  merchantAddress: string;
  amount: string;
  feeBps: number;
  timelocksHex: string;
  platformPublicKeyBase64: string;
  platformSignatureBase64: string;
  sponsored?: boolean;
  mtxmChainId?: string;
  transactionBlockBase64?: string;
  sponsorSignature?: string;
  /** When false, skip user wallet sign — sponsor-only execute. */
  dualSignRequired?: boolean;
};

async function reportSuiSponsoredCapture(
  intentId: string,
  payload: {
    userSignature?: string;
    transactionBlockBase64: string;
    sponsorSignature: string;
    mtxmChainId: string;
    packageId: string;
    dualSignRequired?: boolean;
  },
): Promise<string> {
  const res = await fetch(`${API_BASE}/checkout/report-native-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intentId,
      suiSponsored: payload,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message ?? 'Failed to execute sponsored capture');
  }
  const json = await res.json();
  const data = json.data ?? json;
  return (data.txHash as string) || '';
}

export async function executeSuiCapture(params: {
  captureData: SuiServerCaptureData;
  intentId: string;
  rpcUrl?: string;
  chainId: number;
  payerAddress: string;
  signAndExecute?: (tx: Transaction) => Promise<{ digest: string }>;
  signTransactionBlock?: (transactionBlockBase64: string) => Promise<string>;
}): Promise<string> {
  const { captureData: d } = params;
  const rpcUrl = params.rpcUrl ?? resolveSuiBrowserRpcUrl(params.chainId);

  if (
    d.sponsored &&
    d.transactionBlockBase64 &&
    d.sponsorSignature &&
    d.mtxmChainId
  ) {
    const needsUserSign = d.dualSignRequired !== false;
    let userSignature: string | undefined;
    if (needsUserSign) {
      if (!params.signTransactionBlock) {
        throw new Error('signTransactionBlock is required for dual-sign sponsored capture');
      }
      userSignature = await params.signTransactionBlock(d.transactionBlockBase64);
    }
    const digest = await reportSuiSponsoredCapture(params.intentId, {
      userSignature,
      transactionBlockBase64: d.transactionBlockBase64,
      sponsorSignature: d.sponsorSignature,
      mtxmChainId: d.mtxmChainId,
      packageId: d.packageId,
      dualSignRequired: d.dualSignRequired,
    });
    return digest || userSignature || d.sponsorSignature;
  }

  if (!params.signAndExecute) {
    throw new Error('signAndExecute is required for non-sponsored Sui capture');
  }

  const client = new SuiClient({ url: rpcUrl });
  const piBytes = Uint8Array.from(Buffer.from(d.paymentIntentIdHex.replace(/^0x/, ''), 'hex'));
  const timelocksBytes = Uint8Array.from(Buffer.from(d.timelocksHex.replace(/^0x/, ''), 'hex'));
  const platformSig = Uint8Array.from(Buffer.from(d.platformSignatureBase64, 'base64'));
  const platformPk = Uint8Array.from(Buffer.from(d.platformPublicKeyBase64, 'base64'));

  const tx = new Transaction();
  tx.setSender(params.payerAddress);

  const amount = BigInt(d.amount);
  if (d.coinType === SUI_NATIVE_COIN_TYPE) {
    const [coin] = tx.splitCoins(tx.gas, [amount]);
    tx.moveCall({
      target: `${d.packageId}::escrow::capture_payment`,
      typeArguments: [d.coinType],
      arguments: [
        tx.object(d.registryObjectId),
        tx.object(d.configObjectId),
        tx.object('0x6'),
        tx.pure.vector('u8', Array.from(piBytes)),
        tx.pure.address(d.merchantAddress),
        tx.pure.u16(d.feeBps),
        tx.pure.vector('u8', Array.from(timelocksBytes)),
        coin,
        tx.pure.vector('u8', Array.from(platformSig)),
        tx.pure.vector('u8', Array.from(platformPk)),
      ],
    });
  } else {
    const coins = await client.getCoins({
      owner: params.payerAddress,
      coinType: d.coinType,
    });
    const primary = coins.data[0];
    if (!primary) {
      throw new Error(`No ${d.coinType} coins found in wallet`);
    }
    const [coin] = tx.splitCoins(tx.object(primary.coinObjectId), [amount]);
    tx.moveCall({
      target: `${d.packageId}::escrow::capture_payment`,
      typeArguments: [d.coinType],
      arguments: [
        tx.object(d.registryObjectId),
        tx.object(d.configObjectId),
        tx.object('0x6'),
        tx.pure.vector('u8', Array.from(piBytes)),
        tx.pure.address(d.merchantAddress),
        tx.pure.u16(d.feeBps),
        tx.pure.vector('u8', Array.from(timelocksBytes)),
        coin,
        tx.pure.vector('u8', Array.from(platformSig)),
        tx.pure.vector('u8', Array.from(platformPk)),
      ],
    });
  }

  const result = await params.signAndExecute(tx);
  return result.digest;
}
