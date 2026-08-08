import { ValidationError } from '@noderails/common';
import { MtxmClient } from '@noderails/mtxm-client';
import type { Logger } from '@noderails/service-base';
import { formatSuiRpcErrorMessage } from '@noderails/sui';
import { getDatabaseClient } from '@noderails/database';
import { env } from '../../config.js';
import {
  buildSuiWalletSetupKindBase64,
  executeSuiSponsoredCaptureMtxm,
} from './sui-sponsored-capture.js';
import { requireSuiEscrowObjects, suiClientForChain, SUI_SPONSOR_GAS_BUDGET_DEFAULT } from './sui-escrow-tx.js';
import { executeSuiSponsoredMtxm } from './sui-mtxm-auth.js';
import { readWalletIdForOwner } from '@noderails/sui';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

async function loadCheckoutChain(chainId: number) {
  const db = getDatabaseClient();
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain || chain.chainType !== 'SUI') {
    throw new ValidationError('Sui chain not configured');
  }
  return chain;
}

export async function sponsorSuiCheckoutTransaction(
  input: {
    checkoutSessionId: string;
    chainId: number;
    senderAddress: string;
    transactionKindBase64?: string;
    transactionBase64?: string;
    gasBudget?: string;
  },
  logger: Logger,
  mtxmClient: MtxmClient = mtxm,
) {
  const db = getDatabaseClient();
  const session = await db.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
  });
  if (!session) {
    throw new ValidationError('Invalid checkout session');
  }
  const chain = await loadCheckoutChain(input.chainId);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chain.chainId);

  const sponsorRes = await mtxmClient.sponsorSign({
    chainId: mtxmChainId,
    senderAddress: input.senderAddress,
    gasBudget: input.gasBudget ?? SUI_SPONSOR_GAS_BUDGET_DEFAULT,
    ...(input.transactionBase64
      ? { transactionBase64: input.transactionBase64 }
      : { transactionKindBase64: input.transactionKindBase64! }),
  });

  logger.info('Sui checkout sponsor-sign completed', {
    checkoutSessionId: input.checkoutSessionId,
    sender: input.senderAddress,
    sponsor: sponsorRes.sponsor,
  });

  return sponsorRes;
}

export async function executeSuiCheckoutSponsored(
  input: {
    checkoutSessionId: string;
    chainId: number;
    packageId: string;
    transactionBlockBase64: string;
    userSignature?: string;
    sponsorSignature: string;
    dualSignRequired?: boolean;
    metadata?: Record<string, unknown>;
  },
  logger: Logger,
  mtxmClient: MtxmClient = mtxm,
) {
  const db = getDatabaseClient();
  const session = await db.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
  });
  if (!session) {
    throw new ValidationError('Invalid checkout session');
  }
  const chain = await loadCheckoutChain(input.chainId);
  const mtxmChainId = chain.mtxmChainDbId?.trim() || String(chain.chainId);

  const result = await executeSuiSponsoredMtxm(mtxmClient, {
    mtxmChainId,
    packageId: input.packageId,
    transactionBlockBase64: input.transactionBlockBase64,
    sponsorSignature: input.sponsorSignature,
    userSignature: input.userSignature,
    dualSignRequired: input.dualSignRequired,
    metadata: {
      checkoutSessionId: input.checkoutSessionId,
      ...input.metadata,
    },
  });

  logger.info('Sui checkout execute-sponsored completed', {
    checkoutSessionId: input.checkoutSessionId,
    digest: result.digest,
  });

  return result;
}

export async function buildWalletSetupKindForCheckout(input: {
  checkoutSessionId: string;
  chainId: number;
  tokenContractAddress: string;
  senderAddress: string;
  merchantAddress: string;
  remainingBudget: bigint;
  maxPerCharge: bigint;
  expiresAtMs: bigint;
}) {
  const db = getDatabaseClient();
  const session = await db.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
  });
  if (!session) {
    throw new ValidationError('Invalid checkout session');
  }
  const chain = await loadCheckoutChain(input.chainId);
  const objects = requireSuiEscrowObjects({
    escrowAddress: chain.escrowAddress,
    escrowConfigObjectId: chain.escrowConfigObjectId,
    paymentRegistryObjectId: chain.paymentRegistryObjectId,
    walletRegistryObjectId: chain.walletRegistryObjectId,
  });
  const client = suiClientForChain(chain);
  const { SUI_NATIVE_COIN_TYPE } = await import('@noderails/sui');
  const coinType =
    input.tokenContractAddress === 'native' || input.tokenContractAddress === '0x0'
      ? SUI_NATIVE_COIN_TYPE
      : input.tokenContractAddress.trim();
  const walletObjectId = await readWalletIdForOwner(client, {
    packageId: objects.packageId,
    walletRegistryObjectId: objects.walletRegistryObjectId,
    owner: input.senderAddress,
  });

  let transactionBase64: string;
  try {
    transactionBase64 = await buildSuiWalletSetupKindBase64({
      rpcUrl: chain.rpcUrl,
      chainId: chain.chainId,
      objects,
      payerAddress: input.senderAddress,
      coinType,
      merchantAddress: input.merchantAddress,
      remainingBudget: input.remainingBudget,
      maxPerCharge: input.maxPerCharge,
      expiresAtMs: input.expiresAtMs,
      walletObjectId,
    });
  } catch (err) {
    throw new ValidationError(formatSuiRpcErrorMessage(err));
  }

  return { transactionBase64, packageId: objects.packageId };
}

export { executeSuiSponsoredCaptureMtxm };
