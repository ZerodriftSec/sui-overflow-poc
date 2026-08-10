import { getDatabaseClient, ChainType } from '@noderails/database';
import { NotFoundError, AuthorizationError, ValidationError, isValidAddress, isValidSolanaAddress, isValidSuiAddress, isValidMerchantWalletAddress } from '@noderails/common';

// ── Create App ──

interface CreateAppInput {
  merchantId: string;
  name: string;
  environment?: 'TEST' | 'PRODUCTION';
}

export async function createApp(input: CreateAppInput) {
  const db = getDatabaseClient();

  return db.app.create({
    data: {
      merchantId: input.merchantId,
      name: input.name,
      environment: input.environment ?? 'TEST',
    },
    select: { id: true, name: true, environment: true, createdAt: true },
  });
}

// ── List Apps ──

export async function listApps(merchantId: string) {
  const db = getDatabaseClient();

  return db.app.findMany({
    where: { merchantId },
    select: {
      id: true, name: true, environment: true,
      receivingWallet: true, payoutWallet: true,
      createdAt: true, updatedAt: true,
      _count: {
        select: {
          appChains: true,
          appTokens: true,
          paymentIntents: true,
          webhooks: true,
          apiKeys: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Get App (verifies ownership) ──

export async function getApp(merchantId: string, appId: string) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({
    where: { id: appId },
    select: {
      id: true, merchantId: true, name: true, environment: true,
      receivingWallet: true, receivingWalletSignature: true,
      payoutWallet: true, payoutApproved: true,
      createdAt: true, updatedAt: true,
      appChains: { include: { chain: true } },
      appTokens: { include: { supportedToken: true } },
      _count: {
        select: {
          appChains: true,
          appTokens: true,
          paymentIntents: true,
          webhooks: true,
          apiKeys: true,
          subscriptions: true,
          invoices: true,
        },
      },
    },
  });

  if (!app) throw new NotFoundError('App', appId);
  if (app.merchantId !== merchantId) throw new AuthorizationError('Access denied to this app');

  return app;
}

// ── Update App ──

interface UpdateAppInput {
  name?: string;
  receivingWallet?: string | null;
  receivingWalletSignature?: string;
  payoutWallet?: string | null;
}

export async function updateApp(merchantId: string, appId: string, input: UpdateAppInput) {
  const currentApp = await getApp(merchantId, appId);

  const db = getDatabaseClient();

  if (
    input.receivingWallet !== undefined &&
    input.receivingWallet !== null &&
    !isValidMerchantWalletAddress(input.receivingWallet)
  ) {
    throw new ValidationError('Invalid receiving wallet (EVM 0x…, Solana base58, or Sui address)');
  }
  if (
    input.payoutWallet !== undefined &&
    input.payoutWallet !== null &&
    !isValidMerchantWalletAddress(input.payoutWallet)
  ) {
    throw new ValidationError('Invalid payout wallet (EVM 0x…, Solana base58, or Sui address)');
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.receivingWallet !== undefined) {
    data.receivingWallet = input.receivingWallet;
    if (input.receivingWallet === null) {
      data.receivingWalletSignature = null;
    }
  }
  if (input.receivingWalletSignature !== undefined) {
    data.receivingWalletSignature = input.receivingWalletSignature;
  }
  if (input.payoutWallet !== undefined) data.payoutWallet = input.payoutWallet;

  // Use a transaction to atomically update the app + create wallet change logs
  return db.$transaction(async (tx) => {
    // Log receiving wallet change (non-null destination only; schema requires newAddress)
    if (
      input.receivingWallet !== undefined &&
      input.receivingWallet !== currentApp.receivingWallet &&
      input.receivingWallet !== null
    ) {
      // Count in-flight payments (non-terminal statuses)
      const inFlightPayments = await tx.paymentIntent.count({
        where: {
          appId,
          status: {
            in: ['CREATED', 'AUTHORIZED', 'CAPTURING', 'CAPTURED', 'PAST_DUE'],
          },
        },
      });

      await tx.walletChangeLog.create({
        data: {
          appId,
          walletType: 'RECEIVING',
          previousAddress: currentApp.receivingWallet,
          newAddress: input.receivingWallet,
          signature: input.receivingWalletSignature,
          changedBy: merchantId,
          inFlightPayments,
          pendingPayouts: 0,
        },
      });
    }

    // Log payout wallet change
    if (
      input.payoutWallet !== undefined &&
      input.payoutWallet !== currentApp.payoutWallet &&
      input.payoutWallet !== null
    ) {
      const pendingPayouts = await tx.payoutIntent.count({
        where: {
          appId,
          status: 'PENDING',
        },
      });

      await tx.walletChangeLog.create({
        data: {
          appId,
          walletType: 'PAYOUT',
          previousAddress: currentApp.payoutWallet,
          newAddress: input.payoutWallet,
          changedBy: merchantId,
          inFlightPayments: 0,
          pendingPayouts,
        },
      });
    }

    return tx.app.update({
      where: { id: appId },
      data: data as any,
      select: {
        id: true, name: true, environment: true,
        receivingWallet: true, payoutWallet: true, updatedAt: true,
      },
    });
  });
}

// ── App Chain Management ──

export async function enableChain(merchantId: string, appId: string, chainId: number) {
  const app = await getApp(merchantId, appId);
  const db = getDatabaseClient();

  // Verify chain is supported
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain || !chain.isEnabled) throw new NotFoundError('SupportedChain', String(chainId));

  // Validate environment match: testnet chains for TEST apps, mainnet chains for PRODUCTION apps
  const expectTestnet = app.environment === 'TEST';
  if (chain.isTestnet !== expectTestnet) {
    const envLabel = app.environment === 'TEST' ? 'test' : 'production';
    const chainLabel = chain.isTestnet ? 'testnet' : 'mainnet';
    throw new ValidationError(
      `Cannot enable ${chainLabel} chain on a ${envLabel} app. ` +
      `${app.environment === 'TEST' ? 'Test' : 'Production'} apps can only use ${envLabel} chains.`
    );
  }

  return db.appChain.upsert({
    where: { appId_chainId: { appId, chainId } },
    create: { appId, chainId, isEnabled: true },
    update: { isEnabled: true },
    include: { chain: true },
  });
}

export async function disableChain(merchantId: string, appId: string, chainId: number) {
  await getApp(merchantId, appId);
  const db = getDatabaseClient();

  // Also disable all AppTokens on this chain for this app
  const tokensOnChain = await db.supportedToken.findMany({
    where: { chainId },
    select: { id: true },
  });
  if (tokensOnChain.length > 0) {
    await db.appToken.updateMany({
      where: {
        appId,
        supportedTokenId: { in: tokensOnChain.map((t) => t.id) },
      },
      data: { isEnabled: false },
    });
  }

  return db.appChain.update({
    where: { appId_chainId: { appId, chainId } },
    data: { isEnabled: false },
    include: { chain: true },
  });
}

export async function listAppChains(merchantId: string, appId: string) {
  await getApp(merchantId, appId);
  const db = getDatabaseClient();

  return db.appChain.findMany({
    where: { appId },
    include: { chain: true },
    orderBy: { chain: { name: 'asc' } },
  });
}

/** Per-chain settlement destination (EVM 0x or Solana base58). Cleared with null or "". */
export async function updateAppChainSettlementAddress(
  merchantId: string,
  appId: string,
  chainId: number,
  settlementAddress: string | null,
) {
  await getApp(merchantId, appId);
  const db = getDatabaseClient();

  const appChain = await db.appChain.findUnique({
    where: { appId_chainId: { appId, chainId } },
    include: { chain: true },
  });
  if (!appChain) {
    throw new NotFoundError('AppChain', `${appId}:${chainId}`);
  }
  if (!appChain.isEnabled) {
    throw new ValidationError('Enable this network before setting a settlement address');
  }

  const trimmed = settlementAddress?.trim() ?? '';
  if (trimmed === '') {
    return db.appChain.update({
      where: { appId_chainId: { appId, chainId } },
      data: { settlementAddress: null },
      include: { chain: true },
    });
  }

  if (appChain.chain.chainType === ChainType.SOLANA) {
    if (!isValidSolanaAddress(trimmed)) {
      throw new ValidationError('Invalid Solana settlement address');
    }
  } else if (appChain.chain.chainType === ChainType.SUI) {
    if (!isValidSuiAddress(trimmed)) {
      throw new ValidationError('Invalid Sui settlement address');
    }
  } else {
    if (!isValidAddress(trimmed)) {
      throw new ValidationError('Invalid EVM settlement address');
    }
  }

  return db.appChain.update({
    where: { appId_chainId: { appId, chainId } },
    data: { settlementAddress: trimmed },
    include: { chain: true },
  });
}

// ── App Token Management ──

export async function enableToken(merchantId: string, appId: string, supportedTokenId: string) {
  const app = await getApp(merchantId, appId);
  const db = getDatabaseClient();

  const token = await db.supportedToken.findUnique({
    where: { id: supportedTokenId },
    include: { chain: true },
  });
  if (!token || !token.isEnabled) throw new NotFoundError('SupportedToken', supportedTokenId);
  if (!token.chain.isEnabled) throw new ValidationError('Cannot enable token. Its chain is disabled by admin.');

  // Validate environment match: testnet tokens for TEST apps, mainnet tokens for PRODUCTION apps
  const expectTestnet = app.environment === 'TEST';
  if (token.chain.isTestnet !== expectTestnet) {
    const envLabel = app.environment === 'TEST' ? 'test' : 'production';
    const chainLabel = token.chain.isTestnet ? 'testnet' : 'mainnet';
    throw new ValidationError(
      `Cannot enable token on a ${chainLabel} chain for a ${envLabel} app. ` +
      `${app.environment === 'TEST' ? 'Test' : 'Production'} apps can only use ${envLabel} tokens.`
    );
  }

  return db.appToken.upsert({
    where: { appId_supportedTokenId: { appId, supportedTokenId } },
    create: { appId, supportedTokenId, isEnabled: true },
    update: { isEnabled: true },
    include: { supportedToken: { include: { chain: true } } },
  });
}

export async function disableToken(merchantId: string, appId: string, supportedTokenId: string) {
  await getApp(merchantId, appId);
  const db = getDatabaseClient();

  return db.appToken.update({
    where: { appId_supportedTokenId: { appId, supportedTokenId } },
    data: { isEnabled: false },
    include: { supportedToken: { include: { chain: true } } },
  });
}

export async function listAppTokens(merchantId: string, appId: string) {
  await getApp(merchantId, appId);
  const db = getDatabaseClient();

  return db.appToken.findMany({
    where: { appId },
    include: { supportedToken: { include: { chain: true } } },
    orderBy: { supportedToken: { symbol: 'asc' } },
  });
}

// ── Available Chains & Tokens (for merchant selection) ──

export async function listAvailableChains(environment?: 'TEST' | 'PRODUCTION') {
  const db = getDatabaseClient();

  const where: Record<string, unknown> = { isEnabled: true };
  if (environment) {
    where.isTestnet = environment === 'TEST';
  }

  return db.supportedChain.findMany({
    where,
    orderBy: { name: 'asc' },
  });
}

export async function listAvailableTokens(environment?: 'TEST' | 'PRODUCTION') {
  const db = getDatabaseClient();

  const chainFilter: Record<string, unknown> = { isEnabled: true };
  if (environment) {
    chainFilter.isTestnet = environment === 'TEST';
  }

  return db.supportedToken.findMany({
    where: { isEnabled: true, chain: chainFilter },
    include: { chain: true },
    orderBy: { symbol: 'asc' },
  });
}

export async function listAvailableCurrencies() {
  const db = getDatabaseClient();
  return db.supportedCurrency.findMany({
    where: { isEnabled: true },
    orderBy: { code: 'asc' },
  });
}
