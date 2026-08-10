import { getDatabaseClient, ChainType } from '@noderails/database';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getLeanRpcUrl,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  SOLANA_NATIVE_TOKEN_SENTINEL,
  SUI_NATIVE_COIN_TYPE,
} from '@noderails/common';

// ============================================================================
// SUPPORTED CHAINS
// ============================================================================

function validateEscrowPair(chainType: ChainType, escrowAddress: string, merchantManagerAddress: string) {
  if (chainType === ChainType.SOLANA) {
    if (!isValidSolanaAddress(escrowAddress)) {
      throw new ValidationError('Invalid Solana escrow program id');
    }
    if (!isValidSolanaAddress(merchantManagerAddress)) {
      throw new ValidationError('Invalid Solana merchant manager program id');
    }
  } else if (chainType === ChainType.SUI) {
    if (!isValidSuiAddress(escrowAddress)) {
      throw new ValidationError('Invalid Sui escrow package id');
    }
    if (!isValidSuiAddress(merchantManagerAddress)) {
      throw new ValidationError('Invalid Sui merchant manager package id');
    }
  } else {
    if (!isValidAddress(escrowAddress)) {
      throw new ValidationError('Invalid EVM escrow address');
    }
    if (!isValidAddress(merchantManagerAddress)) {
      throw new ValidationError('Invalid EVM merchant manager address');
    }
  }
}

/**
 * EVM native tokens use 0x000…000 in admin; Solana native SOL uses the default-pubkey
 * base58 sentinel (same value `isNativeToken` recognizes). Accept `native` as a synonym in admin.
 */
function normalizeAdminTokenContractAddress(chainType: ChainType, contractAddress: string): string {
  const trimmed = contractAddress.trim();
  if (chainType === ChainType.SOLANA) {
    if (trimmed.toLowerCase() === 'native') {
      return SOLANA_NATIVE_TOKEN_SENTINEL;
    }
    return trimmed;
  }
  if (chainType === ChainType.SUI && trimmed.toLowerCase() === 'native') {
    return SUI_NATIVE_COIN_TYPE;
  }
  return trimmed;
}

function validateTokenContract(chainType: ChainType, contractAddress: string) {
  if (chainType === ChainType.SOLANA) {
    if (!isValidSolanaAddress(contractAddress)) {
      throw new ValidationError(
        `Invalid Solana mint address. For native SOL, use ${SOLANA_NATIVE_TOKEN_SENTINEL} or enter native.`,
      );
    }
  } else if (chainType === ChainType.SUI) {
    if (contractAddress !== SUI_NATIVE_COIN_TYPE && !contractAddress.includes('::')) {
      throw new ValidationError(
        `Invalid Sui coin type. For native SUI, use ${SUI_NATIVE_COIN_TYPE} or enter native.`,
      );
    }
  } else if (!isValidAddress(contractAddress)) {
    throw new ValidationError('Invalid EVM token contract address');
  }
}

interface CreateChainInput {
  chainId: number;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  mtxmChainDbId?: string | null;
  name: string;
  displayName?: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals?: number;
  escrowAddress: string;
  merchantManagerAddress: string;
  escrowConfigObjectId?: string | null;
  paymentRegistryObjectId?: string | null;
  walletRegistryObjectId?: string | null;
  merchantManagerConfigObjectId?: string | null;
  rpcUrl?: string;
  explorerUrl?: string;
  isTestnet?: boolean;
  supports7702?: boolean;
  iconUrl?: string;
}

export async function createChain(input: CreateChainInput) {
  const db = getDatabaseClient();

  const existing = await db.supportedChain.findUnique({ where: { chainId: input.chainId } });
  if (existing) {
    throw new ConflictError(`Chain ${input.chainId} already exists`);
  }

  const chainType =
    input.chainType === 'SOLANA'
      ? ChainType.SOLANA
      : input.chainType === 'SUI'
        ? ChainType.SUI
        : ChainType.EVM;
  validateEscrowPair(chainType, input.escrowAddress, input.merchantManagerAddress);
  if (chainType === ChainType.SUI) {
    for (const [label, val] of [
      ['escrowConfigObjectId', input.escrowConfigObjectId],
      ['paymentRegistryObjectId', input.paymentRegistryObjectId],
      ['walletRegistryObjectId', input.walletRegistryObjectId],
      ['merchantManagerConfigObjectId', input.merchantManagerConfigObjectId],
    ] as const) {
      if (!val?.trim() || !isValidSuiAddress(val)) {
        throw new ValidationError(`Invalid or missing Sui ${label}`);
      }
    }
  }

  return db.supportedChain.create({
    data: {
      chainId: input.chainId,
      chainType,
      name: input.name,
      displayName: input.displayName ?? input.name,
      nativeCurrencySymbol: input.nativeCurrencySymbol,
      nativeCurrencyDecimals: input.nativeCurrencyDecimals ?? (chainType === ChainType.SUI ? 9 : 18),
      escrowAddress: input.escrowAddress,
      merchantManagerAddress: input.merchantManagerAddress,
      escrowConfigObjectId: input.escrowConfigObjectId ?? undefined,
      paymentRegistryObjectId: input.paymentRegistryObjectId ?? undefined,
      walletRegistryObjectId: input.walletRegistryObjectId ?? undefined,
      merchantManagerConfigObjectId: input.merchantManagerConfigObjectId ?? undefined,
      mtxmChainDbId: input.mtxmChainDbId ?? undefined,
      rpcUrl:
        input.rpcUrl ??
        (chainType === ChainType.SOLANA || chainType === ChainType.SUI ? null : getLeanRpcUrl(input.chainId)),
      explorerUrl: input.explorerUrl,
      isTestnet: input.isTestnet ?? false,
      supports7702: chainType === ChainType.SOLANA || chainType === ChainType.SUI ? false : (input.supports7702 ?? false),
      iconUrl: input.iconUrl,
    },
    include: { tokens: true },
  });
}

export async function listChains() {
  const db = getDatabaseClient();
  return db.supportedChain.findMany({
    orderBy: { chainId: 'asc' },
    include: { tokens: { where: { isEnabled: true } } },
  });
}

export async function getChain(chainId: number) {
  const db = getDatabaseClient();
  const chain = await db.supportedChain.findUnique({
    where: { chainId },
    include: { tokens: true },
  });
  if (!chain) throw new NotFoundError('SupportedChain', String(chainId));
  return chain;
}

export async function updateChain(
  chainId: number,
  data: Partial<CreateChainInput> & { isEnabled?: boolean },
) {
  const db = getDatabaseClient();
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain) throw new NotFoundError('SupportedChain', String(chainId));

  const nextType: ChainType =
    data.chainType === 'SOLANA'
      ? ChainType.SOLANA
      : data.chainType === 'SUI'
        ? ChainType.SUI
        : data.chainType === 'EVM'
          ? ChainType.EVM
          : chain.chainType;

  const escrow = data.escrowAddress ?? chain.escrowAddress;
  const mm = data.merchantManagerAddress ?? chain.merchantManagerAddress;
  if (
    data.escrowAddress !== undefined ||
    data.merchantManagerAddress !== undefined ||
    data.chainType !== undefined
  ) {
    validateEscrowPair(nextType, escrow, mm);
  }

  const { chainId: _ignore, chainType: ct, ...rest } = data as Partial<CreateChainInput> & {
    isEnabled?: boolean;
    chainId?: number;
  };
  const updatePayload = { ...rest } as Record<string, unknown>;
  if (ct === 'SOLANA') updatePayload.chainType = ChainType.SOLANA;
  else if (ct === 'SUI') updatePayload.chainType = ChainType.SUI;
  else if (ct === 'EVM') updatePayload.chainType = ChainType.EVM;
  delete updatePayload.chainId;

  // When disabling a chain, cascade: disable all tokens on this chain,
  // all AppChain entries, and all AppToken entries for tokens on this chain
  if (data.isEnabled === false && chain.isEnabled === true) {
    await db.$transaction([
      // Disable all SupportedTokens on this chain
      db.supportedToken.updateMany({
        where: { chainId },
        data: { isEnabled: false },
      }),
      // Disable all AppChain entries referencing this chain
      db.appChain.updateMany({
        where: { chainId },
        data: { isEnabled: false },
      }),
      // Disable all AppToken entries whose underlying token is on this chain
      db.appToken.updateMany({
        where: { supportedToken: { chainId } },
        data: { isEnabled: false },
      }),
    ]);
  }

  return db.supportedChain.update({
    where: { chainId },
    data: updatePayload as any,
    include: { tokens: true },
  });
}

export async function deleteChain(chainId: number) {
  const db = getDatabaseClient();
  const chain = await db.supportedChain.findUnique({ where: { chainId } });
  if (!chain) throw new NotFoundError('SupportedChain', String(chainId));

  await db.supportedChain.delete({ where: { chainId } });
}

// ============================================================================
// SUPPORTED TOKENS
// ============================================================================

interface CreateTokenInput {
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  supportsNativeTransfer?: boolean;
  supportsPermit?: boolean;
  permitVersion?: string;
  permitType?: string;
  isStablecoin?: boolean;
  iconUrl?: string;
}

export async function createToken(input: CreateTokenInput) {
  const db = getDatabaseClient();

  // Validate chain exists
  const chain = await db.supportedChain.findUnique({ where: { chainId: input.chainId } });
  if (!chain) throw new NotFoundError('SupportedChain', String(input.chainId));

  const contractAddress = normalizeAdminTokenContractAddress(chain.chainType, input.contractAddress);
  validateTokenContract(chain.chainType, contractAddress);

  const tokenKey = `${input.symbol}-${input.chainId}`;

  const existing = await db.supportedToken.findUnique({
    where: { chainId_contractAddress: { chainId: input.chainId, contractAddress } },
  });
  if (existing) {
    throw new ConflictError(`Token ${contractAddress} already exists on chain ${input.chainId}`);
  }

  return db.supportedToken.create({
    data: {
      chainId: input.chainId,
      contractAddress,
      symbol: input.symbol,
      name: input.name,
      decimals: input.decimals,
      tokenKey,
      supportsNativeTransfer: input.supportsNativeTransfer ?? true,
      supportsPermit: input.supportsPermit ?? false,
      permitVersion: input.permitVersion,
      permitType: input.permitType,
      isStablecoin: input.isStablecoin ?? false,
      iconUrl: input.iconUrl,
    },
    include: { chain: true },
  });
}

export async function listTokens(chainId?: number) {
  const db = getDatabaseClient();

  const where: Record<string, unknown> = {};
  if (chainId) where.chainId = chainId;

  return db.supportedToken.findMany({
    where,
    orderBy: [{ chainId: 'asc' }, { symbol: 'asc' }],
    include: { chain: { select: { chainId: true, name: true, isEnabled: true } } },
  });
}

export async function getToken(tokenId: string) {
  const db = getDatabaseClient();
  const token = await db.supportedToken.findUnique({
    where: { id: tokenId },
    include: { chain: true },
  });
  if (!token) throw new NotFoundError('SupportedToken', tokenId);
  return token;
}

export async function updateToken(tokenId: string, data: Partial<Omit<CreateTokenInput, 'chainId' | 'contractAddress'>> & { isEnabled?: boolean }) {
  const db = getDatabaseClient();
  const token = await db.supportedToken.findUnique({ where: { id: tokenId } });
  if (!token) throw new NotFoundError('SupportedToken', tokenId);

  // If symbol changed, update tokenKey
  const updateData: Record<string, unknown> = { ...data };
  if (data.symbol && data.symbol !== token.symbol) {
    updateData.tokenKey = `${data.symbol}-${token.chainId}`;
  }

  // When disabling a token, cascade: disable all AppToken entries for this token
  if (data.isEnabled === false && token.isEnabled === true) {
    await db.appToken.updateMany({
      where: { supportedTokenId: tokenId },
      data: { isEnabled: false },
    });
  }

  return db.supportedToken.update({
    where: { id: tokenId },
    data: updateData,
    include: { chain: true },
  });
}

export async function deleteToken(tokenId: string) {
  const db = getDatabaseClient();
  const token = await db.supportedToken.findUnique({ where: { id: tokenId } });
  if (!token) throw new NotFoundError('SupportedToken', tokenId);

  await db.supportedToken.delete({ where: { id: tokenId } });
}

// ============================================================================
// SUPPORTED CURRENCIES
// ============================================================================

interface CreateCurrencyInput {
  code: string;
  name: string;
  symbol: string;
}

export async function createCurrency(input: CreateCurrencyInput) {
  const db = getDatabaseClient();
  const code = input.code.toUpperCase();

  const existing = await db.supportedCurrency.findUnique({ where: { code } });
  if (existing) {
    throw new ConflictError(`Currency ${code} already exists`);
  }

  return db.supportedCurrency.create({
    data: {
      code,
      name: input.name,
      symbol: input.symbol,
    },
  });
}

export async function listCurrencies() {
  const db = getDatabaseClient();
  return db.supportedCurrency.findMany({
    orderBy: { code: 'asc' },
  });
}

export async function getCurrency(currencyId: string) {
  const db = getDatabaseClient();
  const currency = await db.supportedCurrency.findUnique({ where: { id: currencyId } });
  if (!currency) throw new NotFoundError('SupportedCurrency', currencyId);
  return currency;
}

export async function updateCurrency(currencyId: string, data: Partial<CreateCurrencyInput> & { isEnabled?: boolean }) {
  const db = getDatabaseClient();
  const currency = await db.supportedCurrency.findUnique({ where: { id: currencyId } });
  if (!currency) throw new NotFoundError('SupportedCurrency', currencyId);

  const updateData: Record<string, unknown> = { ...data };
  if (data.code) updateData.code = data.code.toUpperCase();

  return db.supportedCurrency.update({
    where: { id: currencyId },
    data: updateData,
  });
}

export async function deleteCurrency(currencyId: string) {
  const db = getDatabaseClient();
  const currency = await db.supportedCurrency.findUnique({ where: { id: currencyId } });
  if (!currency) throw new NotFoundError('SupportedCurrency', currencyId);

  await db.supportedCurrency.delete({ where: { id: currencyId } });
}

// ============================================================================
// ADMIN OVERVIEW
// ============================================================================

export async function getOverview() {
  const db = getDatabaseClient();

  const [
    merchantCount,
    appCount,
    paymentCount,
    chainCount,
    tokenCount,
    subscriptionCount,
    invoiceCount,
  ] = await Promise.all([
    db.merchant.count(),
    db.app.count(),
    db.paymentIntent.count(),
    db.supportedChain.count({ where: { isEnabled: true } }),
    db.supportedToken.count({ where: { isEnabled: true } }),
    db.subscription.count(),
    db.invoice.count(),
  ]);

  return {
    merchants: merchantCount,
    apps: appCount,
    payments: paymentCount,
    chains: chainCount,
    tokens: tokenCount,
    subscriptions: subscriptionCount,
    invoices: invoiceCount,
  };
}

// ============================================================================
// LIST ALL MERCHANTS (admin)
// ============================================================================

interface ListMerchantsInput {
  page?: number;
  pageSize?: number;
}

export async function listMerchants(input: ListMerchantsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const [merchants, total] = await Promise.all([
    db.merchant.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        role: true,
        merchantType: true,
        businessName: true,
        individualName: true,
        orgName: true,
        isSuspended: true,
        suspendedReason: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { apps: true } },
      },
    }),
    db.merchant.count(),
  ]);

  return { merchants, total, page, pageSize };
}

// ============================================================================
// GET SINGLE MERCHANT DETAIL (admin)
// ============================================================================

export async function getMerchantDetail(merchantId: string) {
  const db = getDatabaseClient();

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      email: true,
      role: true,
      merchantType: true,
      businessName: true,
      individualName: true,
      orgName: true,
      isSuspended: true,
      suspendedReason: true,
      emailVerified: true,
      disputeStartSeconds: true,
      settlementSeconds: true,
      createdAt: true,
      updatedAt: true,
      apps: {
        select: {
          id: true,
          name: true,
          environment: true,
          receivingWallet: true,
          createdAt: true,
          _count: {
            select: {
              paymentIntents: true,
              subscriptions: true,
              invoices: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  // Gather app IDs for this merchant
  const appIds = merchant.apps.map((a) => a.id);

  // Aggregate payment stats across all merchant apps
  const [
    totalPayments,
    capturedPayments,
    settledPayments,
    disputedPayments,
    refundedPayments,
    totalSubscriptions,
    activeSubscriptions,
    totalInvoices,
    paidInvoices,
    capturedVolume,
    settledVolume,
  ] = await Promise.all([
    db.paymentIntent.count({ where: { appId: { in: appIds } } }),
    db.paymentIntent.count({ where: { appId: { in: appIds }, status: 'CAPTURED' } }),
    db.paymentIntent.count({ where: { appId: { in: appIds }, status: 'SETTLED' } }),
    db.paymentIntent.count({
      where: { appId: { in: appIds }, status: { in: ['DISPUTED', 'DISPUTE_RESOLVED', 'DISPUTE_LOST'] } },
    }),
    db.paymentIntent.count({ where: { appId: { in: appIds }, status: 'REFUNDED' } }),
    db.subscription.count({ where: { appId: { in: appIds } } }),
    db.subscription.count({ where: { appId: { in: appIds }, status: 'ACTIVE' } }),
    db.invoice.count({ where: { appId: { in: appIds } } }),
    db.invoice.count({ where: { appId: { in: appIds }, status: 'PAID' } }),
    db.paymentIntent.aggregate({
      where: { appId: { in: appIds }, status: { in: ['CAPTURED', 'SETTLED'] } },
      _sum: { amount: true },
    }),
    db.paymentIntent.aggregate({
      where: { appId: { in: appIds }, status: 'SETTLED' },
      _sum: { amount: true },
    }),
  ]);

  return {
    ...merchant,
    stats: {
      totalPayments,
      capturedPayments,
      settledPayments,
      disputedPayments,
      refundedPayments,
      totalSubscriptions,
      activeSubscriptions,
      totalInvoices,
      paidInvoices,
      capturedVolume: capturedVolume._sum.amount?.toString() ?? '0',
      settledVolume: settledVolume._sum.amount?.toString() ?? '0',
    },
  };
}

// ============================================================================
// MERCHANT REFUNDS (admin)
// ============================================================================

export async function getMerchantRefunds(merchantId: string, page = 1, pageSize = 20) {
  const db = getDatabaseClient();

  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { apps: { select: { id: true } } },
  });

  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  const appIds = merchant.apps.map((a) => a.id);
  const skip = (page - 1) * pageSize;

  const where = {
    appId: { in: appIds },
    status: 'REFUNDED' as const,
  };

  const [refunds, total] = await Promise.all([
    db.paymentIntent.findMany({
      where,
      orderBy: { refundedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        refundedAt: true,
        refundTxHash: true,
        refundReason: true,
        capturedAt: true,
        authorizationChainId: true,
        cryptoAmount: true,
        cryptoTokenKey: true,
        cryptoTokenDecimals: true,
        createdAt: true,
        app: { select: { id: true, name: true } },
        customerAccount: { select: { email: true, name: true } },
        transactions: {
          where: { type: 'REFUND' },
          select: { id: true, txHash: true, status: true, createdAt: true, confirmedAt: true },
          take: 1,
        },
      },
    }),
    db.paymentIntent.count({ where }),
  ]);

  return { refunds, total, page, pageSize };
}

// ============================================================================
// LIST ALL APPS (admin)
// ============================================================================

interface ListAllAppsInput {
  page?: number;
  pageSize?: number;
  merchantId?: string;
}

export async function listAllApps(input: ListAllAppsInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (input.merchantId) where.merchantId = input.merchantId;

  const [apps, total] = await Promise.all([
    db.app.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        merchant: { select: { id: true, email: true } },
        _count: { select: { paymentIntents: true, subscriptions: true, invoices: true } },
      },
    }),
    db.app.count({ where }),
  ]);

  return { apps, total, page, pageSize };
}

// ============================================================================
// SUSPEND / UNSUSPEND MERCHANT
// ============================================================================

export async function suspendMerchant(merchantId: string, reason?: string) {
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  return db.merchant.update({
    where: { id: merchantId },
    data: { isSuspended: true, suspendedReason: reason ?? null },
    select: { id: true, email: true, role: true, isSuspended: true, suspendedReason: true },
  });
}

export async function unsuspendMerchant(merchantId: string) {
  const db = getDatabaseClient();
  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new NotFoundError('Merchant', merchantId);

  return db.merchant.update({
    where: { id: merchantId },
    data: { isSuspended: false, suspendedReason: null },
    select: { id: true, email: true, role: true, isSuspended: true, suspendedReason: true },
  });
}

// ============================================================================
// CONTRACT DEPLOYMENTS
// ============================================================================

interface CreateContractDeploymentInput {
  chain: string;
  chainId: number;
  escrowAddress: string;
  merchantManagerAddress: string;
  deployTxHash?: string;
  deployedAt?: string;
}

export async function createContractDeployment(input: CreateContractDeploymentInput) {
  const db = getDatabaseClient();

  const existing = await db.contractDeployment.findUnique({ where: { chain: input.chain } });
  if (existing) {
    throw new ConflictError(`Contract deployment for chain "${input.chain}" already exists`);
  }

  return db.contractDeployment.create({
    data: {
      chain: input.chain,
      chainId: input.chainId,
      escrowAddress: input.escrowAddress,
      merchantManagerAddress: input.merchantManagerAddress,
      deployTxHash: input.deployTxHash ?? null,
      deployedAt: input.deployedAt ? new Date(input.deployedAt) : new Date(),
    },
  });
}

export async function listContractDeployments() {
  const db = getDatabaseClient();
  return db.contractDeployment.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function updateContractDeployment(
  id: string,
  data: Partial<Omit<CreateContractDeploymentInput, 'chain' | 'chainId'>>,
) {
  const db = getDatabaseClient();
  const deployment = await db.contractDeployment.findUnique({ where: { id } });
  if (!deployment) throw new NotFoundError('ContractDeployment', id);

  const updateData: Record<string, unknown> = { ...data };
  if (data.deployedAt) updateData.deployedAt = new Date(data.deployedAt as string);

  return db.contractDeployment.update({ where: { id }, data: updateData });
}

export async function deleteContractDeployment(id: string) {
  const db = getDatabaseClient();
  const deployment = await db.contractDeployment.findUnique({ where: { id } });
  if (!deployment) throw new NotFoundError('ContractDeployment', id);

  await db.contractDeployment.delete({ where: { id } });
}
