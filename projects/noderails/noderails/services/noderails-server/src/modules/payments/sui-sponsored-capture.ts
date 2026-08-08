import {
  SUI_NATIVE_COIN_TYPE,
  buildCaptureNativeAuthMessage,
  buildCaptureCoinAuthMessage,
} from '@noderails/sui';
import { isNativeToken, isValidSuiAddress, normalizeSuiAddress, ValidationError } from '@noderails/common';
import type { MtxmClient } from '@noderails/mtxm-client';
import type { Logger } from '@noderails/service-base';
import type { SuiCaptureData } from './sui-coin-capture.js';
import {
  paymentIntentIdSuiBytes,
  requireSuiEscrowObjects,
  suiClientForChain,
  SUI_SPONSOR_GAS_BUDGET_CAPTURE,
} from './sui-escrow-tx.js';
import { decodeMtxmSuiEd25519Signature, executeSuiSponsoredMtxm, formatSuiEscrowAuthError, resolveMtxmSuiPlatformPubkey } from './sui-mtxm-auth.js';
import { resolveMtxmSuiSigner } from './sui-mtxm-signer.js';

export type SuiSponsoredCaptureData = SuiCaptureData & {
  sponsored: true;
  mtxmChainId: string;
  transactionBlockBase64: string;
  sponsorSignature: string;
  dualSignRequired?: boolean;
};

export async function prepareSuiSponsoredCaptureForUserWallet(
  mtxm: MtxmClient,
  input: {
    intentId: string;
    chainId: number;
    mtxmChainDbId: string;
    rpcUrl: string | null;
    escrowAddress: string;
    escrowConfigObjectId: string | null;
    paymentRegistryObjectId: string | null;
    walletRegistryObjectId: string | null;
    tokenContractAddress: string;
    walletAddress: string;
    merchantWallet: string;
    cryptoAmount: string;
    feeBps: number;
    disputeStartSeconds: number;
    settlementSeconds: number;
    logger: Logger;
  },
): Promise<{ captureData: SuiSponsoredCaptureData }> {
  if (!isValidSuiAddress(input.merchantWallet)) {
    throw new ValidationError('Invalid Sui merchant settlement address');
  }
  if (!isValidSuiAddress(input.walletAddress)) {
    throw new ValidationError('Invalid Sui payer wallet address');
  }

  const objects = requireSuiEscrowObjects({
    escrowAddress: input.escrowAddress,
    escrowConfigObjectId: input.escrowConfigObjectId,
    paymentRegistryObjectId: input.paymentRegistryObjectId,
    walletRegistryObjectId: input.walletRegistryObjectId,
  });

  const { timelocksToHex, packTimelocks } = await import('@noderails/web3');
  const capturedAt = Math.floor(Date.now() / 1000);
  const timelocks = packTimelocks(capturedAt, input.disputeStartSeconds, input.settlementSeconds);
  const timelocksHex = timelocksToHex(timelocks);
  const timelocksBytes = Uint8Array.from(Buffer.from(timelocksHex.replace(/^0x/, ''), 'hex'));
  const piBytes = paymentIntentIdSuiBytes(input.intentId);
  const amount = BigInt(input.cryptoAmount);
  const isNative = isNativeToken(input.tokenContractAddress);
  const coinType = isNative ? SUI_NATIVE_COIN_TYPE : input.tokenContractAddress.trim();
  const merchantAddress = normalizeSuiAddress(input.merchantWallet);
  const payerAddress = normalizeSuiAddress(input.walletAddress);

  const authMessage = isNative
    ? buildCaptureNativeAuthMessage({
        paymentIntentId: piBytes,
        merchantAddress,
        amount,
        feeBps: input.feeBps,
        timelocks: timelocksBytes,
      })
    : buildCaptureCoinAuthMessage({
        paymentIntentId: piBytes,
        merchantAddress,
        coinType,
        amount,
        feeBps: input.feeBps,
        timelocks: timelocksBytes,
      });

  const signer = await resolveMtxmSuiSigner(mtxm);

  const signRes = await mtxm.signTypedData({
    chainId: input.mtxmChainDbId,
    chainType: 'SUI',
    signerId: signer.signerId,
    sui: {
      domain: {
        name: 'NodeRailsEscrow',
        version: '1',
        chainId: input.chainId,
      },
      rawPreimageBase64: authMessage.toString('base64'),
      payload: { intentId: input.intentId, kind: isNative ? 'capture_native' : 'capture_coin' },
    },
  });

  const authMaterial = decodeMtxmSuiEd25519Signature(signRes);
  const sigBytes = authMaterial.signature;
  const platformPubkeyBytes = resolveMtxmSuiPlatformPubkey(
    authMaterial,
    signer.ed25519PubkeyBytes,
    Uint8Array.from(authMessage),
  );

  const client = suiClientForChain({ rpcUrl: input.rpcUrl, chainId: input.chainId });
  const { Transaction, buildSuiSponsorSignTransactionBase64 } = await import('@noderails/sui');
  const tx = new Transaction();

  if (isNative) {
    const [coin] = tx.splitCoins(tx.gas, [amount]);
    tx.moveCall({
      target: `${objects.packageId}::escrow::capture_payment`,
      typeArguments: [coinType],
      arguments: [
        tx.object(objects.registryObjectId),
        tx.object(objects.configObjectId),
        tx.object('0x6'),
        tx.pure.vector('u8', Array.from(piBytes)),
        tx.pure.address(merchantAddress),
        tx.pure.u16(input.feeBps),
        tx.pure.vector('u8', Array.from(timelocksBytes)),
        coin,
        tx.pure.vector('u8', Array.from(sigBytes)),
        tx.pure.vector('u8', Array.from(platformPubkeyBytes)),
      ],
    });
  } else {
    const coins = await client.getCoins({ owner: payerAddress, coinType });
    const primary = coins.data[0];
    if (!primary) {
      throw new ValidationError(`No ${coinType} coins found in payer wallet`);
    }
    const [coin] = tx.splitCoins(tx.object(primary.coinObjectId), [amount]);
    tx.moveCall({
      target: `${objects.packageId}::escrow::capture_payment`,
      typeArguments: [coinType],
      arguments: [
        tx.object(objects.registryObjectId),
        tx.object(objects.configObjectId),
        tx.object('0x6'),
        tx.pure.vector('u8', Array.from(piBytes)),
        tx.pure.address(merchantAddress),
        tx.pure.u16(input.feeBps),
        tx.pure.vector('u8', Array.from(timelocksBytes)),
        coin,
        tx.pure.vector('u8', Array.from(sigBytes)),
        tx.pure.vector('u8', Array.from(platformPubkeyBytes)),
      ],
    });
  }

  const transactionBase64 = await buildSuiSponsorSignTransactionBase64(tx, payerAddress, client);
  let sponsorRes;
  try {
    sponsorRes = await mtxm.sponsorSign({
      chainId: input.mtxmChainDbId,
      transactionBase64,
      senderAddress: payerAddress,
      gasBudget: SUI_SPONSOR_GAS_BUDGET_CAPTURE,
    });
  } catch (err) {
    throw new ValidationError(formatSuiEscrowAuthError(err));
  }

  input.logger.info('Sui sponsored capture prepared for user wallet', {
    intentId: input.intentId,
    packageId: objects.packageId,
    coinType,
    sponsor: sponsorRes.sponsor,
  });

  return {
    captureData: {
      chainType: 'SUI',
      sponsored: true,
      chainId: input.chainId,
      mtxmChainId: input.mtxmChainDbId,
      packageId: objects.packageId,
      configObjectId: objects.configObjectId,
      registryObjectId: objects.registryObjectId,
      coinType,
      paymentIntentIdHex: `0x${Buffer.from(piBytes).toString('hex')}`,
      merchantAddress,
      amount: input.cryptoAmount,
      feeBps: input.feeBps,
      timelocksHex,
      platformPublicKeyBase64: Buffer.from(platformPubkeyBytes).toString('base64'),
      platformSignatureBase64: Buffer.from(sigBytes).toString('base64'),
      transactionBlockBase64: sponsorRes.transactionBlockBase64,
      sponsorSignature: sponsorRes.sponsorSignature,
      dualSignRequired: sponsorRes.dualSignRequired ?? true,
    },
  };
}

export async function executeSuiSponsoredCaptureMtxm(
  mtxm: MtxmClient,
  params: {
    mtxmChainId: string;
    packageId: string;
    intentId: string;
    transactionBlockBase64: string;
    sponsorSignature: string;
    userSignature?: string;
    dualSignRequired?: boolean;
    logger: Logger;
  },
) {
  const result = await executeSuiSponsoredMtxm(mtxm, {
    mtxmChainId: params.mtxmChainId,
    packageId: params.packageId,
    transactionBlockBase64: params.transactionBlockBase64,
    sponsorSignature: params.sponsorSignature,
    userSignature: params.userSignature,
    dualSignRequired: params.dualSignRequired,
    metadata: { kind: 'capture_payment_sponsored', intentId: params.intentId },
  });

  params.logger.info('Sui sponsored capture executed via MTXM', {
    intentId: params.intentId,
    digest: result.digest,
    mtxmTxId: result.transactionId,
  });

  return result;
}

/** Build unsigned capture PTB kind for subscription wallet setup (client → sponsor-sign). */
export async function buildSuiWalletSetupKindBase64(input: {
  rpcUrl: string | null;
  chainId: number;
  objects: ReturnType<typeof requireSuiEscrowObjects>;
  payerAddress: string;
  coinType: string;
  merchantAddress: string;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  expiresAtMs: bigint;
  walletObjectId: string | null;
}): Promise<string> {
  const client = suiClientForChain({ rpcUrl: input.rpcUrl, chainId: input.chainId });
  const { buildWalletFundAndAuthorizeTx, buildWalletInitSubscriptionTx, pickSuiCoinObjectId, buildSuiSponsorSignTransactionBase64 } =
    await import('@noderails/sui');

  const coinObjectId = await pickSuiCoinObjectId(client, input.payerAddress, input.coinType);
  const tx = input.walletObjectId
    ? buildWalletFundAndAuthorizeTx({
        objects: input.objects,
        coinType: input.coinType,
        walletObjectId: input.walletObjectId,
        merchantAddress: input.merchantAddress,
        coinObjectId,
        remainingBudget: input.remainingBudget,
        maxPerCharge: input.maxPerCharge,
        expiresAtMs: input.expiresAtMs,
      })
    : buildWalletInitSubscriptionTx({
        objects: input.objects,
        coinType: input.coinType,
        merchantAddress: input.merchantAddress,
        coinObjectId,
        remainingBudget: input.remainingBudget,
        maxPerCharge: input.maxPerCharge,
        expiresAtMs: input.expiresAtMs,
      });

  tx.setSender(input.payerAddress);
  return buildSuiSponsorSignTransactionBase64(tx, input.payerAddress, client);
}
