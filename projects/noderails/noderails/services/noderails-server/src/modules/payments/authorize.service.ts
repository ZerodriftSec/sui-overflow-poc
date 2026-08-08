import { getDatabaseClient, ChainType } from '@noderails/database';
import { MtxmClient } from '@noderails/mtxm-client';
import {
  encodeCaptureNative,
  encodeCaptureERC20,
  buildCaptureNativeTypedData,
  buildCaptureERC20TypedData,
  packTimelocks,
  timelocksToHex,
  type PermitData,
} from '@noderails/web3';
import {
  NotFoundError,
  PaymentError,
  ValidationError,
  PAYMENT_CONFIG,
  isNativeToken,
  getLeanRpcUrl,
  WEBHOOK_EVENTS,
  isValidSolanaAddress,
  isValidSuiAddress,
  resolveChainTypeFromId,
} from '@noderails/common';
import {
  buildCaptureNativeAuthMessage,
  ed25519VerifyInstruction,
  encodeCaptureNativeInstructionData,
  captureNativeInstruction,
  PublicKey,
} from '@noderails/solana';
import bs58 from 'bs58';
import {
  keccak256,
  encodePacked,
  parseUnits,
  createPublicClient,
  http,
  erc20Abi,
  parseAbi,
  type Hex,
  type Address,
} from 'viem';
import { env } from '../../config.js';
import type { Logger } from '@noderails/service-base';
import * as priceService from '../prices/price.service.js';
import * as checkoutSessionService from '../checkout-sessions/checkout-session.service.js';
import { getEffectiveTimelockConfig } from './timelock-config.service.js';
import { getEffectiveFeeBps } from './fee-config.service.js';
import { enqueueAppWebhook } from '../webhooks/webhook.service.js';
import { mtxmSolanaAuthority, solanaRpcForChain } from './solana-escrow-tx.js';
import { submitSolanaSplCaptureMtxm } from './solana-spl-capture.js';
import { executeSuiSponsoredCaptureMtxm, prepareSuiSponsoredCaptureForUserWallet } from './sui-sponsored-capture.js';
import { submitSuiSubscriptionCaptureMtxm } from './sui-subscription-capture.js';
import { suiRpcForChain } from './sui-escrow-tx.js';

const mtxm = new MtxmClient({
  baseUrl: env.MTXM_BASE_URL,
  projectId: env.MTXM_PROJECT_ID,
  apiKey: env.MTXM_API_KEY,
});

const permitAbi = parseAbi([
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
]);

// ── Types ──

interface AuthorizeFromCheckoutSessionInput {
  checkoutSessionId: string;
  walletAddress: string;
  chainId: number;
  tokenKey: string;
  authorizationMethod: 'NATIVE' | 'PERMIT';
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  approvalTxHash?: string;
  cryptoAmount: string;
  exchangeRate: string;
  /** Customer email — required for all checkout sessions */
  customerEmail: string;
  /** Customer name — optional unless billing details required */
  customerName?: string;
  /** Billing address fields — optional unless session has requireBillingDetails */
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
}

/**
 * Authorize a payment from a checkout session.
 *
 * This is the universal authorization entry point. All payment sources
 * (payment links, invoices, subscriptions, API) create a CheckoutSession
 * first, then authorize through this function.
 *
 * Flow:
 * 1. Load checkout session, validate it's OPEN and not expired
 * 2. Validate chain, token, authorization method, price
 * 3. Validate billing details if session requires them
 * 4. Find or create CustomerAccount from email (always required)
 * 5. Create a PaymentIntent linked to the session
 * 6. Mark session as COMPLETE
 * 7. Auto-capture: submit capture transaction to MTXM
 */
export async function authorizeFromCheckoutSession(
  input: AuthorizeFromCheckoutSessionInput,
  logger: Logger,
) {
  const db = getDatabaseClient();

  // ── 1. Load and validate checkout session ──
  const session = await db.checkoutSession.findUnique({
    where: { id: input.checkoutSessionId },
    include: {
      app: {
        include: {
          appChains: {
            where: { chainId: input.chainId, isEnabled: true },
            include: { chain: true },
          },
        },
      },
    },
  });

  if (!session) throw new NotFoundError('CheckoutSession', input.checkoutSessionId);

  if (session.status !== 'OPEN') {
    throw new ValidationError(`Checkout session is ${session.status}, cannot authorize`);
  }

  if (session.expiresAt < new Date()) {
    await db.checkoutSession.update({
      where: { id: session.id },
      data: { status: 'EXPIRED' },
    });
    throw new ValidationError('Checkout session has expired');
  }

  // ── 2. Validate chain is accepted ──
  const appChain = session.app.appChains[0];
  if (!appChain) {
    throw new ValidationError(`Chain ${input.chainId} is not enabled for this app`);
  }

  const chain = appChain.chain;
  const escrowAddress = chain.escrowAddress;
  if (!escrowAddress) {
    throw new ValidationError(`No escrow contract deployed on chain ${input.chainId}`);
  }

  // ── 3. Validate token ──
  const token = await db.supportedToken.findFirst({
    where: {
      tokenKey: input.tokenKey,
      chainId: input.chainId,
      isEnabled: true,
    },
  });
  if (!token) {
    throw new ValidationError(
      `Token ${input.tokenKey} is not supported on chain ${input.chainId}`,
    );
  }

  // ── 4. Validate authorization method ──
  const nativeToken = isNativeToken(token.contractAddress);

  if (input.authorizationMethod === 'PERMIT') {
    if (chain.chainType === ChainType.SUI) {
      throw new ValidationError('Sui payments do not support ERC-20 permit; use NATIVE authorization');
    }
    if (!token.supportsPermit) {
      throw new ValidationError(
        `Token ${token.symbol} does not support permit on chain ${input.chainId}`,
      );
    }
    if (!input.permitSignature) {
      throw new ValidationError('Permit signature is required for PERMIT authorization');
    }
  } else if (input.authorizationMethod === 'NATIVE') {
    // Native tokens (ETH, MATIC, etc.) are sent via msg.value — no ERC20 approval needed.
    // For ERC20 tokens in non-permit flow, approvalTxHash is optional (UI may reload and lose it).
    // Actual allowance sufficiency is validated against chain state in submitAutoCapture.
  }

  // ── 5. Validate crypto amount against server-side price ──
  const fiatAmount = session.amount ? Number(session.amount) : 0;
  if (fiatAmount <= 0) {
    throw new ValidationError('Checkout session must have a fixed amount');
  }

  const fiatCurrency = session.currency || 'USD';
  const currentPrice = await priceService.getPrice(token.symbol, logger, fiatCurrency);
  const expectedTokenAmount = priceService.convertFiatToToken(fiatAmount, currentPrice.priceFiat);
  const expectedRaw = parseUnits(expectedTokenAmount, token.decimals);
  const submittedRaw = BigInt(input.cryptoAmount);

  // For permit flow, the signed permit amount must cover the submitted capture amount.
  if (input.authorizationMethod === 'PERMIT' && input.permitSignature) {
    const permitSignedRaw = BigInt(input.permitSignature.amount);
    if (permitSignedRaw < submittedRaw) {
      throw new ValidationError(
        `Permit amount too low: signed ${permitSignedRaw.toString()} but required ${submittedRaw.toString()}`,
      );
    }
  }

  // Allow up to 2% slippage
  const SLIPPAGE_BPS = 200n;
  const minAcceptable = (expectedRaw * (10000n - SLIPPAGE_BPS)) / 10000n;
  if (submittedRaw < minAcceptable) {
    throw new ValidationError(
      `Crypto amount too low: submitted ${input.cryptoAmount} but minimum acceptable is ${minAcceptable.toString()}`,
    );
  }

  // ── 6. Validate billing details if required ──
  if (session.requireBillingDetails) {
    const missingBilling: string[] = [];
    if (!input.customerName) missingBilling.push('customerName');
    if (!input.billingAddress) missingBilling.push('billingAddress');
    if (!input.billingCity) missingBilling.push('billingCity');
    if (!input.billingState) missingBilling.push('billingState');
    if (!input.billingCountry) missingBilling.push('billingCountry');
    if (!input.billingPostalCode) missingBilling.push('billingPostalCode');
    if (missingBilling.length > 0) {
      throw new ValidationError(
        `Billing details required: ${missingBilling.join(', ')}`,
      );
    }
  }

  // ── 7. Find or create customer from email (always required) ──
  let customerAccountId: string | null = session.customerAccountId ?? null;

  if (!customerAccountId) {
    // Look for existing customer by email within this app
    const existing = await db.customerAccount.findFirst({
      where: { appId: session.appId, email: input.customerEmail },
    });

    if (existing) {
      customerAccountId = existing.id;
      // Update billing info if provided
      const billingUpdate: Record<string, unknown> = {};
      if (input.customerName) billingUpdate.name = input.customerName;
      if (input.billingAddress) billingUpdate.address = input.billingAddress;
      if (input.billingCity) billingUpdate.city = input.billingCity;
      if (input.billingState) billingUpdate.state = input.billingState;
      if (input.billingCountry) billingUpdate.country = input.billingCountry;
      if (input.billingPostalCode) billingUpdate.postalCode = input.billingPostalCode;
      if (Object.keys(billingUpdate).length > 0) {
        await db.customerAccount.update({
          where: { id: existing.id },
          data: billingUpdate,
        });
      }
    } else {
      const newCustomer = await db.customerAccount.create({
        data: {
          appId: session.appId,
          email: input.customerEmail,
          name: input.customerName ?? null,
          address: input.billingAddress ?? null,
          city: input.billingCity ?? null,
          state: input.billingState ?? null,
          country: input.billingCountry ?? null,
          postalCode: input.billingPostalCode ?? null,
        },
      });
      customerAccountId = newCustomer.id;
      logger.info('Created customer account from checkout', {
        customerId: newCustomer.id,
        email: input.customerEmail,
        sessionId: session.id,
      });
    }

    // Link customer to checkout session
    await db.checkoutSession.update({
      where: { id: session.id },
      data: { customerAccountId },
    });
  } else {
    // Session already has a customer (e.g. invoice) — still update billing info if provided
    const billingUpdate: Record<string, unknown> = {};
    if (input.customerName) billingUpdate.name = input.customerName;
    if (input.billingAddress) billingUpdate.address = input.billingAddress;
    if (input.billingCity) billingUpdate.city = input.billingCity;
    if (input.billingState) billingUpdate.state = input.billingState;
    if (input.billingCountry) billingUpdate.country = input.billingCountry;
    if (input.billingPostalCode) billingUpdate.postalCode = input.billingPostalCode;
    if (Object.keys(billingUpdate).length > 0) {
      await db.customerAccount.update({
        where: { id: customerAccountId },
        data: billingUpdate,
      });
    }
  }

  // ── 8. Create payment intent ──
  const timelockConfig = await getEffectiveTimelockConfig(session.app.merchantId);
  const feeBps = await getEffectiveFeeBps(session.app.merchantId);
  const expiresAt = new Date(Date.now() + PAYMENT_CONFIG.INTENT_EXPIRY_SEC * 1000);

  const intent = await db.paymentIntent.create({
    data: {
      appId: session.appId,
      customerAccountId,
      amount: fiatAmount,
      currency: session.currency,
      allowedChains: [input.chainId],
      allowedTokens: [input.tokenKey],
      captureMode: 'AUTOMATIC',
      timelockDuration: timelockConfig.settlementSeconds,
      disputeStartDuration: timelockConfig.disputeStartSeconds,
      sourceType: 'CHECKOUT_SESSION',
      sourceId: session.id,
      successUrl: session.successUrl,
      cancelUrl: session.cancelUrl,
      expiresAt,
      authorizationMethod: input.authorizationMethod,
      authorizationChainId: input.chainId,
      authorizationTokenKey: input.tokenKey,
      authorizationWalletAddress: input.walletAddress,
      authorizationTxHash: input.approvalTxHash ?? null,
      authorizationSignature: input.permitSignature
        ? JSON.stringify(input.permitSignature)
        : null,
      authorizedAt: new Date(),
      cryptoAmount: input.cryptoAmount,
      cryptoTokenKey: input.tokenKey,
      cryptoTokenDecimals: token.decimals,
      exchangeRate: input.exchangeRate,
      platformFeeBps: feeBps,
      status: 'AUTHORIZED',
    },
  });

  logger.info('Payment intent created & authorized from checkout session', {
    intentId: intent.id,
    sessionId: session.id,
    sourceType: session.sourceType,
    sourceId: session.sourceId,
    chain: input.chainId,
    token: input.tokenKey,
    method: input.authorizationMethod,
  });

  // ── Fire payment.authorized webhook ──
  await enqueueAppWebhook(session.appId, WEBHOOK_EVENTS.PAYMENT_AUTHORIZED, {
    paymentIntentId: intent.id,
    checkoutSessionId: session.id,
    externalId: intent.externalId ?? null,
    appId: session.appId,
    status: 'AUTHORIZED',
    amount: fiatAmount.toString(),
    currency: session.currency,
    chainId: input.chainId,
    tokenKey: input.tokenKey,
    walletAddress: input.walletAddress,
    metadata: session.metadata ?? {},
    createdAt: intent.createdAt.toISOString(),
  });

  // ── 9. Mark checkout session as COMPLETE ──
  await checkoutSessionService.completeCheckoutSession(session.id, intent.id);

  // ── 10. Auto-capture: submit capture transaction to MTXM ──
  try {
    const captureResult = await submitAutoCapture({
      intent,
      escrowAddress,
      chainId: input.chainId,
      chainType: resolveChainTypeFromId(input.chainId, chain.chainType as 'EVM' | 'SOLANA' | 'SUI'),
      mtxmChainDbId: chain.mtxmChainDbId,
      solanaRpcUrl: chain.chainType === 'SOLANA' ? solanaRpcForChain(chain) : undefined,
      suiRpcUrl: chain.chainType === ChainType.SUI ? suiRpcForChain(chain) : undefined,
      suiEscrowConfigObjectId: chain.escrowConfigObjectId,
      suiPaymentRegistryObjectId: chain.paymentRegistryObjectId,
      suiWalletRegistryObjectId: chain.walletRegistryObjectId,
      token,
      walletAddress: input.walletAddress,
      permitSignature: input.permitSignature,
      cryptoAmount: input.cryptoAmount,
      disputeStartSeconds: timelockConfig.disputeStartSeconds,
      settlementSeconds: timelockConfig.settlementSeconds,
      feeBps,
      logger,
      isSubscription: session.mode === 'SUBSCRIPTION',
    });

    // Native tokens: user must send the tx themselves — return calldata
    if ('captureData' in captureResult) {
      return {
        intentId: intent.id,
        status: 'AWAITING_USER_TX',
        captureData: captureResult.captureData,
      };
    }

    return {
      intentId: intent.id,
      status: 'CAPTURING',
      transactionId: captureResult.transactionId,
    };
  } catch (err) {
    await db.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'CAPTURE_FAILED' },
    });
    logger.error('Auto-capture failed', { intentId: intent.id, error: String(err) });
    throw new PaymentError(`Capture submission failed: ${String(err)}`, intent.id);
  }
}

// ── Legacy: Authorize from Payment Link (deprecated) ──
// Internally creates a checkout session and delegates to authorizeFromCheckoutSession.
// Kept for backward compatibility during frontend migration.

interface AuthorizeFromLinkInput {
  paymentLinkId: string;
  walletAddress: string;
  chainId: number;
  tokenKey: string;
  authorizationMethod: 'NATIVE' | 'PERMIT';
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  approvalTxHash?: string;
  cryptoAmount: string;
  exchangeRate: string;
  customerEmail: string;
  customerName?: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
}

/**
 * Authorize a payment from a payment link (legacy path).
 * Creates a checkout session from the link and delegates to authorizeFromCheckoutSession.
 */
export async function authorizeFromLink(input: AuthorizeFromLinkInput, logger: Logger) {
  const db = getDatabaseClient();

  // Load the payment link to get its slug
  const link = await db.paymentLink.findUnique({
    where: { id: input.paymentLinkId },
  });

  if (!link || !link.isActive) {
    throw new NotFoundError('PaymentLink', input.paymentLinkId);
  }

  // Create a checkout session from the link
  const sessionData = await checkoutSessionService.createCheckoutSessionFromLink(link.slug);

  // Delegate to the universal authorize function
  return authorizeFromCheckoutSession(
    {
      checkoutSessionId: sessionData.checkoutSessionId,
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      tokenKey: input.tokenKey,
      authorizationMethod: input.authorizationMethod,
      permitSignature: input.permitSignature,
      approvalTxHash: input.approvalTxHash,
      cryptoAmount: input.cryptoAmount,
      exchangeRate: input.exchangeRate,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      billingAddress: input.billingAddress,
      billingCity: input.billingCity,
      billingState: input.billingState,
      billingCountry: input.billingCountry,
      billingPostalCode: input.billingPostalCode,
    },
    logger,
  );
}

// ── Auto Capture ──

interface AutoCaptureInput {
  intent: { id: string; appId: string };
  escrowAddress: string;
  chainId: number;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  mtxmChainDbId?: string | null;
  /** Required for Solana SPL server-side capture (delegate + MTXM). */
  solanaRpcUrl?: string;
  /** Sui JSON-RPC for pool preflight reads. */
  suiRpcUrl?: string;
  /** Sui shared object ids from SupportedChain (required for SUI capture). */
  suiEscrowConfigObjectId?: string | null;
  suiPaymentRegistryObjectId?: string | null;
  suiWalletRegistryObjectId?: string | null;
  token: {
    contractAddress: string;
    symbol: string;
  };
  walletAddress: string;
  permitSignature?: {
    amount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  };
  cryptoAmount: string;
  disputeStartSeconds: number;
  settlementSeconds: number;
  feeBps: number;
  logger: Logger;
  /** Subscription checkout: Sui pool pull / EVM allowance / Solana delegate renewals. */
  isSubscription?: boolean;
}

async function submitAutoCapture(input: AutoCaptureInput) {
  const db = getDatabaseClient();

  // Load merchant's receiving wallet for this app
  const app = await db.app.findUnique({
    where: { id: input.intent.appId },
    include: {
      appChains: {
        where: { chainId: input.chainId },
      },
    },
  });

  if (!app) throw new PaymentError('App not found', input.intent.id);

  // Use settlement address on this chain, or the app's receiving wallet
  const merchantAddress = app.appChains[0]?.settlementAddress ?? app.receivingWallet;
  if (!merchantAddress) {
    throw new PaymentError('No receiving wallet configured for this app', input.intent.id);
  }

  const chainType = input.chainType ?? 'EVM';

  // Pack timelocks with the current timestamp as capturedAt.
  // The contract stores timelocks as-is (it does NOT override capturedAt),
  // so we must supply a real timestamp for settlement/dispute windows to work.
  const capturedAt = Math.floor(Date.now() / 1000);
  const timelocks = packTimelocks(capturedAt, input.disputeStartSeconds, input.settlementSeconds);

  // Convert intent UUID to bytes32
  const paymentIntentId = uuidToBytes32(input.intent.id);
  const escrow = input.escrowAddress as Address;
  const merchant = merchantAddress as Address;
  const chainIdStr = String(input.chainId);

  const isNative = isNativeToken(input.token.contractAddress);

  if (chainType === 'SUI') {
    const mtxmChainId = input.mtxmChainDbId?.trim() || chainIdStr;
    if (input.isSubscription) {
      const txResult = await submitSuiSubscriptionCaptureMtxm(mtxm, {
        intentId: input.intent.id,
        chain: {
          rpcUrl: input.suiRpcUrl ?? null,
          chainId: input.chainId,
          escrowAddress: input.escrowAddress,
          escrowConfigObjectId: input.suiEscrowConfigObjectId ?? null,
          paymentRegistryObjectId: input.suiPaymentRegistryObjectId ?? null,
          walletRegistryObjectId: input.suiWalletRegistryObjectId ?? null,
          mtxmChainDbId: mtxmChainId,
        },
        payerWallet: input.walletAddress,
        merchantWallet: merchantAddress,
        tokenContractAddress: input.token.contractAddress,
        amountRaw: BigInt(input.cryptoAmount),
        feeBps: input.feeBps,
        disputeStartSeconds: input.disputeStartSeconds,
        settlementSeconds: input.settlementSeconds,
        logger: input.logger,
      });

      const transaction = await db.transaction.create({
        data: {
          paymentIntentId: input.intent.id,
          mtxmTxId: txResult.id,
          txHash: txResult.txHash ?? null,
          chain: chainIdStr,
          type: 'CAPTURE',
          status: 'PENDING',
        },
      });

      await db.paymentIntent.update({
        where: { id: input.intent.id },
        data: {
          status: 'CAPTURING',
          capturedAt: new Date(),
          captureTxHash: txResult.txHash ?? null,
        },
      });

      input.logger.info('Sui wallet subscription capture submitted', {
        intentId: input.intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash,
        token: input.token.symbol,
      });

      return { transactionId: transaction.id };
    }

    return prepareSuiSponsoredCaptureForUserWallet(mtxm, {
      intentId: input.intent.id,
      chainId: input.chainId,
      mtxmChainDbId: mtxmChainId,
      rpcUrl: input.suiRpcUrl ?? null,
      escrowAddress: input.escrowAddress,
      escrowConfigObjectId: input.suiEscrowConfigObjectId ?? null,
      paymentRegistryObjectId: input.suiPaymentRegistryObjectId ?? null,
      walletRegistryObjectId: input.suiWalletRegistryObjectId ?? null,
      tokenContractAddress: input.token.contractAddress,
      walletAddress: input.walletAddress,
      merchantWallet: merchantAddress,
      cryptoAmount: input.cryptoAmount,
      feeBps: input.feeBps,
      disputeStartSeconds: input.disputeStartSeconds,
      settlementSeconds: input.settlementSeconds,
      logger: input.logger,
    });
  }

  if (chainType === 'SOLANA') {
    if (!isNative) {
      if (!input.solanaRpcUrl?.trim()) {
        throw new PaymentError('Solana RPC URL is required for SPL capture', input.intent.id);
      }
      const mtxmChainId = input.mtxmChainDbId?.trim() || chainIdStr;
      const txResult = await submitSolanaSplCaptureMtxm(mtxm, {
        intentId: input.intent.id,
        escrowProgramId: input.escrowAddress,
        payerWallet: input.walletAddress,
        merchantWallet: merchantAddress,
        mint: input.token.contractAddress,
        amountRaw: BigInt(input.cryptoAmount),
        feeBps: input.feeBps,
        disputeStartSeconds: input.disputeStartSeconds,
        settlementSeconds: input.settlementSeconds,
        mtxmChainId,
        solanaChainId: input.chainId,
        rpcUrl: input.solanaRpcUrl.trim(),
        logger: input.logger,
      });

      const transaction = await db.transaction.create({
        data: {
          paymentIntentId: input.intent.id,
          mtxmTxId: txResult.id,
          txHash: txResult.txHash ?? null,
          chain: chainIdStr,
          type: 'CAPTURE',
          status: 'PENDING',
        },
      });

      await db.paymentIntent.update({
        where: { id: input.intent.id },
        data: {
          status: 'CAPTURING',
          capturedAt: new Date(),
          captureTxHash: txResult.txHash ?? null,
        },
      });

      input.logger.info('Solana SPL capture submitted', {
        intentId: input.intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash,
        token: input.token.symbol,
      });

      return { transactionId: transaction.id };
    }
    if (!isValidSolanaAddress(merchantAddress)) {
      throw new PaymentError('Invalid Solana merchant settlement address', input.intent.id);
    }
    if (!isValidSolanaAddress(input.walletAddress)) {
      throw new ValidationError('Invalid Solana payer wallet address');
    }

    const programId = new PublicKey(input.escrowAddress);
    const payer = new PublicKey(input.walletAddress);
    const merchantPk = new PublicKey(merchantAddress);
    const piBytes = Uint8Array.from(Buffer.from(paymentIntentId.slice(2), 'hex'));
    const timelocksHex = timelocksToHex(timelocks).replace(/^0x/, '');
    const timelocksBytes = Uint8Array.from(Buffer.from(timelocksHex, 'hex'));
    const amount = BigInt(input.cryptoAmount);

    const authMessage = buildCaptureNativeAuthMessage({
      paymentIntentId: piBytes,
      merchant: merchantPk,
      amount,
      feeBps: input.feeBps,
      timelocks: timelocksBytes,
    });

    const signRes = await mtxm.signTypedData({
      chainId: input.mtxmChainDbId ?? chainIdStr,
      chainType: 'SOLANA',
      solana: {
        domain: {
          name: 'NodeRailsEscrow',
          version: '1',
          chainId: input.chainId,
          verifyingProgramId: input.escrowAddress,
          authority: mtxmSolanaAuthority().toBase58(),
        },
        rawPreimageBase64: authMessage.toString('base64'),
        payload: { intentId: input.intent.id, kind: 'capture_native' },
      },
    });

    const sigB58 = signRes.signatureBase58;
    if (!sigB58) {
      throw new PaymentError('MTXM Solana sign-typed missing signatureBase58', input.intent.id);
    }
    const sigBytes = new Uint8Array(bs58.decode(sigB58));
    if (sigBytes.length !== 64) {
      throw new PaymentError('Invalid Solana signature length from MTXM', input.intent.id);
    }

    const edIx = ed25519VerifyInstruction({
      publicKey: mtxmSolanaAuthority(),
      message: authMessage,
      signature: Buffer.from(sigBytes),
    });

    const ixData = encodeCaptureNativeInstructionData({
      paymentIntentId: piBytes,
      amount,
      feeBps: input.feeBps,
      timelocks: timelocksBytes,
    });

    const ix = captureNativeInstruction({
      programId,
      payer,
      merchant: merchantPk,
      paymentIntentId: piBytes,
      data: ixData,
    });

    const solanaIxToApi = (i: typeof ix) => ({
      programId: i.programId.toBase58(),
      keys: i.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(i.data as Uint8Array).toString('base64'),
    });

    input.logger.info('Solana native capture prepared for user wallet', {
      intentId: input.intent.id,
      escrow: input.escrowAddress,
    });

    return {
      captureData: {
        chainType: 'SOLANA' as const,
        chainId: input.chainId,
        preInstructions: [solanaIxToApi(edIx)],
        instruction: solanaIxToApi(ix),
      },
    };
  }

  if (isNative) {
    // ── Native token: user must send the tx themselves ──
    // The contract's captureNativePayment() requires msg.value (ETH sent by
    // the caller). Since the user is the payer, they must call the contract
    // directly from their wallet. We sign the EIP-712 data and return the
    // calldata so the frontend can use sendTransaction.

    const nonce = keccak256(encodePacked(['bytes32', 'string'], [paymentIntentId, 'native']));
    const amount = BigInt(input.cryptoAmount);

    // Build EIP-712 typed data for the NoderRails backend signature
    const typedData = buildCaptureNativeTypedData(
      { paymentIntentId, merchant, amount, feeBps: input.feeBps, timelocks, nonce },
      input.chainId,
      escrow,
    );

    // Sign via MTXM (our backend authorizes the payment)
    const sigResult = await mtxm.signTypedData({
      chainId: chainIdStr,
      domain: typedData.domain,
      types: typedData.types,
      value: serializeBigInts(typedData.message),
    });

    // Build calldata for captureNativePayment
    const calldata = encodeCaptureNative({
      paymentIntentId,
      merchant,
      feeBps: input.feeBps,
      timelocks,
      noderailsSignature: sigResult.signature as Hex,
    });

    input.logger.info('Native capture prepared for user submission', {
      intentId: input.intent.id,
      escrow: input.escrowAddress,
    });

    // Return calldata for the frontend instead of sending via MTXM.
    // The intent stays in AUTHORIZED status until the user submits and
    // reports the tx hash (or the indexer picks up the PaymentCaptured event).
    return {
      captureData: {
        to: input.escrowAddress,
        data: calldata,
        value: input.cryptoAmount,
        chainId: input.chainId,
      },
    };
  } else {
    // ERC20 capture (with permit or native approval)
    const amount = BigInt(input.cryptoAmount);
    const payer = input.walletAddress as Address;
    const tokenAddr = input.token.contractAddress as Address;

    const rpcUrl = getLeanRpcUrl(input.chainId);
    const client = createPublicClient({ transport: http(rpcUrl) });
    const currentAllowance = await client.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [payer, escrow],
    });

    // For non-permit ERC20 flow, ensure allowance is already sufficient
    // before sending capture tx to avoid on-chain revert.
    if (!input.permitSignature) {
      if (currentAllowance < amount) {
        throw new ValidationError(
          `Insufficient ERC20 allowance: allowance ${currentAllowance.toString()} is below required ${amount.toString()}`,
        );
      }
    } else if (currentAllowance < amount) {
      // Permit flow: if current allowance is insufficient, validate the provided
      // permit via simulation so we fail early with a clear error instead of
      // bubbling up a later transferFrom allowance revert from escrow.
      try {
        await client.simulateContract({
          address: tokenAddr,
          abi: permitAbi,
          functionName: 'permit',
          args: [
            payer,
            escrow,
            BigInt(input.permitSignature.amount),
            BigInt(input.permitSignature.deadline),
            input.permitSignature.v,
            input.permitSignature.r as Hex,
            input.permitSignature.s as Hex,
          ],
          account: payer,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new ValidationError(`Invalid permit signature for ${input.token.symbol}: ${reason}`);
      }
    }

    // Contract computes nonce as: keccak256(abi.encodePacked(paymentIntentId, "erc20"))
    const nonce = keccak256(encodePacked(['bytes32', 'string'], [paymentIntentId, 'erc20']));

    const permitData: PermitData = input.permitSignature
      ? {
          amount: BigInt(input.permitSignature.amount),
          deadline: BigInt(input.permitSignature.deadline),
          v: input.permitSignature.v,
          r: input.permitSignature.r as Hex,
          s: input.permitSignature.s as Hex,
        }
      : {
          // No permit — use zero permit (contract uses transferFrom with prior approval)
          amount: 0n,
          deadline: 0n,
          v: 0,
          r: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          s: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        };

    // Build EIP-712 typed data for the NoderRails backend signature
    const typedData = buildCaptureERC20TypedData(
      { paymentIntentId, merchant, token: tokenAddr, amount, payer, feeBps: input.feeBps, timelocks, nonce },
      input.chainId,
      escrow,
    );

    const sigResult = await mtxm.signTypedData({
      chainId: chainIdStr,
      domain: typedData.domain,
      types: typedData.types,
      value: serializeBigInts(typedData.message),
    });

    const calldata = encodeCaptureERC20({
      paymentIntentId,
      merchant,
      token: tokenAddr,
      amount,
      payer,
      feeBps: input.feeBps,
      timelocks,
      permitData,
      noderailsSignature: sigResult.signature as Hex,
    });

    const txResult = await mtxm.sendTransaction({
      chainId: chainIdStr,
      to: input.escrowAddress,
      data: calldata,
    });

    const transaction = await db.transaction.create({
      data: {
        paymentIntentId: input.intent.id,
        mtxmTxId: txResult.id,
        txHash: txResult.txHash ?? null,
        chain: chainIdStr,
        type: 'CAPTURE',
        status: 'PENDING',
      },
    });

    await db.paymentIntent.update({
      where: { id: input.intent.id },
      data: {
        status: 'CAPTURING',
        capturedAt: new Date(),
        captureTxHash: txResult.txHash ?? null,
      },
    });

    input.logger.info('ERC20 capture submitted', {
      intentId: input.intent.id,
      mtxmTxId: txResult.id,
      txHash: txResult.txHash,
      token: input.token.symbol,
    });

    return { transactionId: transaction.id };
  }
}

// ── Report Native Capture ──

/**
 * Called by the frontend after the user sends a native token capture tx.
 * Creates a Transaction record and marks the intent as CAPTURING.
 * The indexer will pick up the PaymentCaptured event and mark it CAPTURED.
 */
export async function reportNativeCapture(
  intentId: string,
  txHashOrSponsored: string | {
    userSignature?: string;
    transactionBlockBase64: string;
    sponsorSignature: string;
    mtxmChainId: string;
    packageId: string;
    dualSignRequired?: boolean;
  },
  logger: Logger,
) {
  const db = getDatabaseClient();

  const intent = await db.paymentIntent.findUnique({
    where: { id: intentId },
  });

  if (!intent) {
    throw new NotFoundError('PaymentIntent', intentId);
  }

  if (intent.status !== 'AUTHORIZED') {
    throw new ValidationError(
      `Payment intent is in status ${intent.status}, expected AUTHORIZED`,
    );
  }

  let txHash: string;
  let mtxmTxId: string | undefined;
  if (typeof txHashOrSponsored === 'string') {
    txHash = txHashOrSponsored;
  } else {
    const exec = await executeSuiSponsoredCaptureMtxm(mtxm, {
      mtxmChainId: txHashOrSponsored.mtxmChainId,
      packageId: txHashOrSponsored.packageId,
      intentId,
      transactionBlockBase64: txHashOrSponsored.transactionBlockBase64,
      sponsorSignature: txHashOrSponsored.sponsorSignature,
      userSignature: txHashOrSponsored.userSignature,
      dualSignRequired: txHashOrSponsored.dualSignRequired,
      logger,
    });
    txHash = exec.digest;
    mtxmTxId = exec.transactionId;
  }

  // Create transaction record for tracking
  const transaction = await db.transaction.create({
    data: {
      paymentIntentId: intentId,
      mtxmTxId: mtxmTxId ?? null,
      txHash,
      chain: String(intent.authorizationChainId),
      type: 'CAPTURE',
      status: 'PENDING',
    },
  });

  // Mark intent as CAPTURING
  await db.paymentIntent.update({
    where: { id: intentId },
    data: {
      status: 'CAPTURING',
      capturedAt: new Date(),
      captureTxHash: txHash,
    },
  });

  logger.info('Native capture tx reported by user', {
    intentId,
    txHash,
    mtxmTxId,
    transactionId: transaction.id,
  });

  return { transactionId: transaction.id, txHash };
}

// ── Helpers ──

// Re-export from shared utility (used inline below)
import { uuidToBytes32 } from './crypto-utils.js';

/**
 * Serialize an object's bigint values to strings for JSON transport to MTXM.
 */
function serializeBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
  }
  return result;
}
