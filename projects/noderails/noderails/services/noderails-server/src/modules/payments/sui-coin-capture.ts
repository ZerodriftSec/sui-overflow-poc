import { timelocksToHex, packTimelocks } from '@noderails/web3';
import {
  SUI_NATIVE_COIN_TYPE,
  buildCaptureCoinAuthMessage,
  buildCaptureNativeAuthMessage,
} from '@noderails/sui';
import { isNativeToken, isValidSuiAddress, normalizeSuiAddress, ValidationError } from '@noderails/common';
import type { MtxmClient } from '@noderails/mtxm-client';
import type { Logger } from '@noderails/service-base';
import {
  paymentIntentIdSuiBytes,
  requireSuiEscrowObjects,
} from './sui-escrow-tx.js';
import { decodeMtxmSuiEd25519Signature, resolveMtxmSuiPlatformPubkey } from './sui-mtxm-auth.js';
import { resolveMtxmSuiSigner } from './sui-mtxm-signer.js';

export type SuiCaptureData = {
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
};

export async function prepareSuiCaptureForUserWallet(
  mtxm: MtxmClient,
  input: {
    intentId: string;
    chainId: number;
    mtxmChainDbId: string;
    escrowAddress: string;
    escrowConfigObjectId: string | null;
    paymentRegistryObjectId: string | null;
    tokenContractAddress: string;
    walletAddress: string;
    merchantWallet: string;
    cryptoAmount: string;
    feeBps: number;
    disputeStartSeconds: number;
    settlementSeconds: number;
    logger: Logger;
  },
): Promise<{ captureData: SuiCaptureData }> {
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
  });

  const capturedAt = Math.floor(Date.now() / 1000);
  const timelocks = packTimelocks(capturedAt, input.disputeStartSeconds, input.settlementSeconds);
  const timelocksHex = timelocksToHex(timelocks);
  const timelocksBytes = Uint8Array.from(Buffer.from(timelocksHex.replace(/^0x/, ''), 'hex'));
  const piBytes = paymentIntentIdSuiBytes(input.intentId);
  const amount = BigInt(input.cryptoAmount);
  const isNative = isNativeToken(input.tokenContractAddress);
  const coinType = isNative ? SUI_NATIVE_COIN_TYPE : input.tokenContractAddress.trim();
  const merchantAddress = normalizeSuiAddress(input.merchantWallet);

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

  input.logger.info('Sui capture prepared for user wallet', {
    intentId: input.intentId,
    packageId: objects.packageId,
    coinType,
  });

  return {
    captureData: {
      chainType: 'SUI',
      chainId: input.chainId,
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
    },
  };
}
