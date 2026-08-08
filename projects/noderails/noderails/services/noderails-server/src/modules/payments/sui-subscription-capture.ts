import { packTimelocks, timelocksToHex } from '@noderails/web3';
import {
  SUI_NATIVE_COIN_TYPE,
  buildCaptureFromWalletTx,
  buildCaptureWalletSubscriptionAuthMessage,
  readWalletIdForOwner,
  readWalletSubscriptionState,
  WALLET_RULE_ACTIVE,
  transactionToMtxmSuiBase64,
  mtxmSuiRawPtbPayload,
} from '@noderails/sui';
import { isNativeToken, isValidSuiAddress, normalizeSuiAddress, ValidationError } from '@noderails/common';
import type { MtxmClient } from '@noderails/mtxm-client';
import type { Logger } from '@noderails/service-base';
import {
  paymentIntentIdSuiBytes,
  requireSuiEscrowObjects,
  suiClientForChain,
} from './sui-escrow-tx.js';
import { decodeMtxmSuiEd25519Signature, resolveMtxmSuiPlatformPubkey } from './sui-mtxm-auth.js';
import { resolveMtxmSuiSigner } from './sui-mtxm-signer.js';

type SuiChainRow = {
  rpcUrl: string | null;
  chainId: number;
  escrowAddress: string;
  escrowConfigObjectId: string | null;
  paymentRegistryObjectId: string | null;
  walletRegistryObjectId?: string | null;
};

async function readWalletIdForOwnerWithRetry(
  client: ReturnType<typeof suiClientForChain>,
  params: {
    packageId: string;
    walletRegistryObjectId: string;
    owner: string;
  },
  logger?: Logger,
): Promise<string | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const walletObjectId = await readWalletIdForOwner(client, params);
      if (walletObjectId) {
        return walletObjectId;
      }
    } catch (err) {
      lastErr = err;
      logger?.warn('Sui wallet registry read attempt failed', { attempt, error: String(err) });
    }
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (lastErr) {
    throw lastErr;
  }
  return null;
}

export async function assertSuiWalletForCapture(
  chain: SuiChainRow & { mtxmChainDbId?: string | null },
  params: {
    tokenContractAddress: string;
    payerWallet: string;
    merchantWallet: string;
    requiredAmount: bigint;
  },
  logger?: Logger,
): Promise<{ walletObjectId: string }> {
  const objects = requireSuiEscrowObjects({
    escrowAddress: chain.escrowAddress,
    escrowConfigObjectId: chain.escrowConfigObjectId,
    paymentRegistryObjectId: chain.paymentRegistryObjectId,
    walletRegistryObjectId: chain.walletRegistryObjectId,
  });
  const coinType = isNativeToken(params.tokenContractAddress)
    ? SUI_NATIVE_COIN_TYPE
    : params.tokenContractAddress.trim();
  const client = suiClientForChain(chain);
  const payer = normalizeSuiAddress(params.payerWallet);
  const merchant = normalizeSuiAddress(params.merchantWallet);

  let walletObjectId: string | null;
  try {
    walletObjectId = await readWalletIdForOwnerWithRetry(
      client,
      {
        packageId: objects.packageId,
        walletRegistryObjectId: objects.walletRegistryObjectId,
        owner: payer,
      },
      logger,
    );
  } catch (err) {
    logger?.warn('Sui wallet registry read failed', { error: String(err) });
    throw new ValidationError(
      `Could not read NodeRailsWallet (${String(err instanceof Error ? err.message : err)}). ` +
        'Complete subscription authorization in checkout first, then retry payment.',
    );
  }

  if (!walletObjectId) {
    throw new ValidationError(
      'No NodeRailsWallet found for this payer. Fund and authorize the subscription wallet in checkout first.',
    );
  }

  let state;
  try {
    state = await readWalletSubscriptionState(client, {
      packageId: objects.packageId,
      walletObjectId,
      coinType,
      merchant,
      sender: payer,
    });
  } catch (err) {
    logger?.warn('Sui wallet subscription state read failed', { error: String(err) });
    throw new ValidationError('Could not read wallet subscription rule state.');
  }

  if (state.ruleStatus !== WALLET_RULE_ACTIVE) {
    throw new ValidationError('Sui subscription rule is not active. Re-authorize in checkout.');
  }
  if (state.balance < params.requiredAmount) {
    throw new ValidationError(
      `NodeRailsWallet balance too low: ${state.balance.toString()} but charge needs ${params.requiredAmount.toString()}.`,
    );
  }
  if (state.remainingBudget < params.requiredAmount) {
    throw new ValidationError(
      `Subscription budget exhausted: remaining ${state.remainingBudget.toString()}, charge needs ${params.requiredAmount.toString()}.`,
    );
  }
  if (state.maxPerCharge < params.requiredAmount) {
    throw new ValidationError('Charge amount exceeds max per charge on subscription rule.');
  }

  return { walletObjectId };
}

export async function submitSuiSubscriptionCaptureMtxm(
  mtxm: MtxmClient,
  params: {
    intentId: string;
    chain: SuiChainRow & { mtxmChainDbId: string | null };
    payerWallet: string;
    merchantWallet: string;
    tokenContractAddress: string;
    amountRaw: bigint;
    feeBps: number;
    disputeStartSeconds: number;
    settlementSeconds: number;
    logger: Logger;
  },
) {
  if (!isValidSuiAddress(params.merchantWallet)) {
    throw new ValidationError('Invalid Sui merchant settlement address');
  }
  if (!isValidSuiAddress(params.payerWallet)) {
    throw new ValidationError('Invalid Sui payer wallet address');
  }

  const { walletObjectId } = await assertSuiWalletForCapture(
    params.chain,
    {
      tokenContractAddress: params.tokenContractAddress,
      payerWallet: params.payerWallet,
      merchantWallet: params.merchantWallet,
      requiredAmount: params.amountRaw,
    },
    params.logger,
  );

  const objects = requireSuiEscrowObjects({
    escrowAddress: params.chain.escrowAddress,
    escrowConfigObjectId: params.chain.escrowConfigObjectId,
    paymentRegistryObjectId: params.chain.paymentRegistryObjectId,
    walletRegistryObjectId: params.chain.walletRegistryObjectId,
  });

  const capturedAt = Math.floor(Date.now() / 1000);
  const timelocks = packTimelocks(capturedAt, params.disputeStartSeconds, params.settlementSeconds);
  const timelocksBytes = Uint8Array.from(Buffer.from(timelocksToHex(timelocks).replace(/^0x/, ''), 'hex'));
  const piBytes = paymentIntentIdSuiBytes(params.intentId);
  const coinType = isNativeToken(params.tokenContractAddress)
    ? SUI_NATIVE_COIN_TYPE
    : params.tokenContractAddress.trim();
  const merchantAddress = normalizeSuiAddress(params.merchantWallet);
  const payerAddress = normalizeSuiAddress(params.payerWallet);

  const authMessage = buildCaptureWalletSubscriptionAuthMessage({
    paymentIntentId: piBytes,
    payerAddress,
    merchantAddress,
    coinType,
    amount: params.amountRaw,
    feeBps: params.feeBps,
    timelocks: timelocksBytes,
  });

  const mtxmChainId = params.chain.mtxmChainDbId?.trim() || String(params.chain.chainId);
  const signer = await resolveMtxmSuiSigner(mtxm);

  const signRes = await mtxm.signTypedData({
    chainId: mtxmChainId,
    chainType: 'SUI',
    signerId: signer.signerId,
    sui: {
      domain: {
        name: 'NodeRailsEscrow',
        version: '1',
        chainId: params.chain.chainId,
      },
      rawPreimageBase64: authMessage.toString('base64'),
      payload: { intentId: params.intentId, kind: 'capture_wallet_subscription' },
    },
  });

  const authMaterial = decodeMtxmSuiEd25519Signature(signRes);
  const sigBytes = authMaterial.signature;
  const platformPubkeyBytes = resolveMtxmSuiPlatformPubkey(
    authMaterial,
    signer.ed25519PubkeyBytes,
    Uint8Array.from(authMessage),
  );

  const tx = buildCaptureFromWalletTx({
    objects,
    coinType,
    walletObjectId,
    paymentIntentId: piBytes,
    merchantAddress,
    payerAddress,
    amount: params.amountRaw,
    feeBps: params.feeBps,
    timelocks: timelocksBytes,
    platformSignature: sigBytes,
    platformPublicKey: platformPubkeyBytes,
  });

  const client = suiClientForChain(params.chain);
  const transactionBase64 = await transactionToMtxmSuiBase64(tx, signer.address, client);
  const payload = mtxmSuiRawPtbPayload({
    chainMtxmId: mtxmChainId,
    signerId: signer.signerId,
    packageId: objects.packageId,
    transactionBase64,
    metadata: { kind: 'capture_from_wallet', intentId: params.intentId },
  });

  params.logger.info('Sui wallet subscription capture submitting via MTXM', {
    intentId: params.intentId,
    packageId: objects.packageId,
    coinType,
    walletObjectId,
  });

  return mtxm.sendTransaction(payload);
}
