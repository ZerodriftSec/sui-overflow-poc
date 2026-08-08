import { getDatabaseClient, ChainType } from '@noderails/database';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isValidAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  normalizeSuiAddress,
} from '@noderails/common';

// ── Types ──

interface CreateCustomerInput {
  appId: string;
  merchantId: string;
  externalId?: string;
  email?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: Record<string, unknown>;
}

interface UpdateCustomerInput {
  externalId?: string;
  email?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: Record<string, unknown>;
}

interface AddWalletInput {
  chainId: number;
  walletAddress: string;
}

// ── Create Customer Account ──

export async function createCustomer(input: CreateCustomerInput) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: input.appId } });
  if (!app) throw new NotFoundError('App', input.appId);
  if (app.merchantId !== input.merchantId) throw new AuthorizationError('Access denied');

  return db.customerAccount.create({
    data: {
      appId: input.appId,
      externalId: input.externalId,
      email: input.email,
      name: input.name,
      address: input.address,
      city: input.city,
      state: input.state,
      country: input.country,
      postalCode: input.postalCode,
      metadata: (input.metadata ?? undefined) as any,
    },
    include: { wallets: true },
  });
}

// ── Get Customer Account ──

export async function getCustomer(merchantId: string, customerId: string) {
  const db = getDatabaseClient();

  const customer = await db.customerAccount.findUnique({
    where: { id: customerId },
    include: {
      app: true,
      wallets: { include: { chain: { select: { chainId: true, name: true } } } },
      paymentIntents: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          cryptoAmount: true,
          cryptoTokenKey: true,
          cryptoTokenDecimals: true,
          authorizationChainId: true,
          createdAt: true,
          capturedAt: true,
          checkoutSessions: { select: { sourceType: true, sourceId: true }, take: 1 },
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          currency: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) throw new NotFoundError('CustomerAccount', customerId);
  if (customer.app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  return customer;
}

// ── List Customer Accounts ──

interface ListCustomersInput {
  merchantId: string;
  appId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

export async function listCustomers(input: ListCustomersInput) {
  const db = getDatabaseClient();

  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  const apps = await db.app.findMany({
    where: { merchantId: input.merchantId },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  const where: Record<string, unknown> = { appId: { in: appIds } };
  if (input.appId) where.appId = input.appId;
  if (input.search) {
    where.OR = [
      { email: { contains: input.search, mode: 'insensitive' } },
      { name: { contains: input.search, mode: 'insensitive' } },
      { externalId: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [customers, total] = await Promise.all([
    db.customerAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        wallets: true,
        _count: { select: { paymentIntents: true, subscriptions: true, invoices: true } },
      },
    }),
    db.customerAccount.count({ where }),
  ]);

  return { customers, total, page, pageSize };
}

// ── Update Customer Account ──

export async function updateCustomer(merchantId: string, customerId: string, input: UpdateCustomerInput) {
  await getCustomer(merchantId, customerId);
  const db = getDatabaseClient();

  return db.customerAccount.update({
    where: { id: customerId },
    data: input as any,
    include: { wallets: true },
  });
}

// ── Add Wallet to Customer ──

export async function addWallet(merchantId: string, customerId: string, input: AddWalletInput) {
  const customer = await getCustomer(merchantId, customerId);

  const db = getDatabaseClient();

  // Verify chain is supported
  const chain = await db.supportedChain.findUnique({ where: { chainId: input.chainId } });
  if (!chain || !chain.isEnabled) {
    throw new ValidationError(`Chain ${input.chainId} is not supported`);
  }

  const raw = input.walletAddress.trim();
  let stored: string;
  if (chain.chainType === ChainType.SOLANA) {
    if (!isValidSolanaAddress(raw)) {
      throw new ValidationError('Invalid Solana wallet address');
    }
    stored = raw;
  } else if (chain.chainType === ChainType.SUI) {
    if (!isValidSuiAddress(raw)) {
      throw new ValidationError('Invalid Sui wallet address');
    }
    stored = normalizeSuiAddress(raw);
  } else {
    const lower = raw.toLowerCase();
    if (!isValidAddress(lower)) {
      throw new ValidationError('Invalid EVM wallet address');
    }
    stored = lower;
  }

  return db.customerWallet.create({
    data: {
      customerAccountId: customerId,
      chainId: input.chainId,
      walletAddress: stored,
    },
    include: { chain: { select: { chainId: true, name: true } } },
  });
}

// ── Remove Wallet ──

export async function removeWallet(merchantId: string, customerId: string, walletId: string) {
  await getCustomer(merchantId, customerId);
  const db = getDatabaseClient();

  const wallet = await db.customerWallet.findUnique({ where: { id: walletId } });
  if (!wallet || wallet.customerAccountId !== customerId) {
    throw new NotFoundError('CustomerWallet', walletId);
  }

  await db.customerWallet.delete({ where: { id: walletId } });
}

// ── Lookup by External ID ──

export async function getCustomerByExternalId(merchantId: string, appId: string, externalId: string) {
  const db = getDatabaseClient();

  const app = await db.app.findUnique({ where: { id: appId } });
  if (!app) throw new NotFoundError('App', appId);
  if (app.merchantId !== merchantId) throw new AuthorizationError('Access denied');

  const customer = await db.customerAccount.findUnique({
    where: { appId_externalId: { appId, externalId } },
    include: { wallets: true },
  });

  if (!customer) throw new NotFoundError('CustomerAccount', `externalId:${externalId}`);
  return customer;
}
