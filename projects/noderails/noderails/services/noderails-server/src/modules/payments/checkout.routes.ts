import express, { Router } from 'express';
import { z } from 'zod';
import { isValidMerchantWalletAddress } from '@noderails/common';
import { asyncHandler, validate, success, createLogger } from '@noderails/service-base';
import * as authorizeService from './authorize.service.js';
import * as intentService from './intent.service.js';

const router: express.Router = Router();
const logger = createLogger('checkout');

// ── Schemas ──

const permitSignatureSchema = z.object({
  amount: z.string().min(1),
  deadline: z.string(),
  v: z.number(),
  r: z.string(),
  s: z.string(),
});

/** EVM payer (0x…) or Solana base58 public key. */
const checkoutWalletAddressSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((s) => isValidMerchantWalletAddress(s), { message: 'Invalid wallet address' });

const commonAuthFields = {
  walletAddress: checkoutWalletAddressSchema,
  chainId: z.number().int().positive(),
  tokenKey: z.string().min(1),
  authorizationMethod: z.enum(['NATIVE', 'PERMIT']),
  permitSignature: permitSignatureSchema.optional(),
  approvalTxHash: z
    .string()
    .trim()
    .min(16)
    .max(128)
    .optional(),
  cryptoAmount: z.string().min(1),
  exchangeRate: z.string().min(1),
  customerEmail: z.string().email().max(255),
  customerName: z.string().max(255).optional(),
  billingAddress: z.string().max(500).optional(),
  billingCity: z.string().max(255).optional(),
  billingState: z.string().max(255).optional(),
  billingCountry: z.string().max(255).optional(),
  billingPostalCode: z.string().max(50).optional(),
};

// Primary: authorize from a checkout session (universal path)
const authorizeFromSessionSchema = z.object({
  checkoutSessionId: z.string().uuid(),
  ...commonAuthFields,
});

// Legacy: authorize from a payment link (backward compat — creates session internally)
const authorizeFromLinkSchema = z.object({
  paymentLinkId: z.string().uuid(),
  ...commonAuthFields,
});

// Combined schema: accepts either checkoutSessionId or paymentLinkId
const authorizeSchema = z.union([authorizeFromSessionSchema, authorizeFromLinkSchema]);

// ── POST /checkout/authorize ──
// Universal authorization endpoint.
// Accepts either { checkoutSessionId, ... } (preferred) or { paymentLinkId, ... } (legacy).

router.post(
  '/authorize',
  validate(authorizeSchema),
  asyncHandler(async (req, res) => {
    let result;
    if ('checkoutSessionId' in req.body) {
      result = await authorizeService.authorizeFromCheckoutSession(req.body, logger);
    } else {
      result = await authorizeService.authorizeFromLink(req.body, logger);
    }
    success(res, result);
  }),
);

// ── POST /checkout/report-native-capture ──
// Called by the frontend after the user sends a native token capture tx.
// Creates a Transaction record and marks the intent as CAPTURING.

/** EVM tx hash (0x + 64 hex) or Solana transaction signature (base58). */
const captureTxHashSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (h) => /^0x[a-fA-F0-9]{64}$/.test(h) || /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(h),
    { message: 'Invalid transaction hash' },
  );

const reportNativeCaptureSchema = z.object({
  intentId: z.string().uuid(),
  txHash: captureTxHashSchema.optional(),
  suiSponsored: z
    .object({
      userSignature: z.string().min(1).optional(),
      transactionBlockBase64: z.string().min(1),
      sponsorSignature: z.string().min(1),
      mtxmChainId: z.string().min(1),
      packageId: z.string().min(1),
      dualSignRequired: z.boolean().optional(),
    })
    .optional(),
}).refine((v) => !!v.txHash || !!v.suiSponsored, {
  message: 'Either txHash or suiSponsored is required',
}).refine(
  (v) =>
    !v.suiSponsored ||
    v.suiSponsored.dualSignRequired === false ||
    !!v.suiSponsored.userSignature?.trim(),
  { message: 'userSignature is required when dualSignRequired is true' },
);

router.post(
  '/report-native-capture',
  validate(reportNativeCaptureSchema),
  asyncHandler(async (req, res) => {
    const result = await authorizeService.reportNativeCapture(
      req.body.intentId,
      req.body.suiSponsored ?? req.body.txHash,
      logger,
    );
    success(res, result);
  }),
);

const suiSponsorSignSchema = z.object({
  checkoutSessionId: z.string().uuid(),
  chainId: z.number().int().positive(),
  senderAddress: checkoutWalletAddressSchema,
  transactionKindBase64: z.string().min(1).optional(),
  transactionBase64: z.string().min(1).optional(),
  walletSetup: z
    .object({
      tokenContractAddress: z.string().min(1),
      merchantAddress: checkoutWalletAddressSchema,
      remainingBudget: z.string().min(1),
      maxPerCharge: z.string().min(1),
      expiresAtMs: z.string().min(1),
    })
    .optional(),
  gasBudget: z.string().optional(),
});

router.post(
  '/sui/sponsor-sign',
  validate(suiSponsorSignSchema),
  asyncHandler(async (req, res) => {
    const { sponsorSuiCheckoutTransaction, buildWalletSetupKindForCheckout } = await import(
      './sui-checkout-sponsor.service.js'
    );
    let transactionBase64 = req.body.transactionBase64 as string | undefined;
    let transactionKindBase64 = req.body.transactionKindBase64 as string | undefined;
    if (!transactionBase64 && !transactionKindBase64 && req.body.walletSetup) {
      const built = await buildWalletSetupKindForCheckout({
        checkoutSessionId: req.body.checkoutSessionId,
        chainId: req.body.chainId,
        tokenContractAddress: req.body.walletSetup.tokenContractAddress,
        senderAddress: req.body.senderAddress,
        merchantAddress: req.body.walletSetup.merchantAddress,
        remainingBudget: BigInt(req.body.walletSetup.remainingBudget),
        maxPerCharge: BigInt(req.body.walletSetup.maxPerCharge),
        expiresAtMs: BigInt(req.body.walletSetup.expiresAtMs),
      });
      transactionBase64 = built.transactionBase64;
    }
    if (!transactionBase64 && !transactionKindBase64) {
      throw new Error('transactionBase64, transactionKindBase64, or walletSetup is required');
    }
    const { SUI_SPONSOR_GAS_BUDGET_WALLET_SETUP } = await import('./sui-escrow-tx.js');
    const result = await sponsorSuiCheckoutTransaction(
      {
        checkoutSessionId: req.body.checkoutSessionId,
        chainId: req.body.chainId,
        senderAddress: req.body.senderAddress,
        transactionBase64,
        transactionKindBase64,
        gasBudget:
          req.body.gasBudget ??
          (req.body.walletSetup ? SUI_SPONSOR_GAS_BUDGET_WALLET_SETUP : undefined),
      },
      logger,
    );
    success(res, result);
  }),
);

const suiExecuteSponsoredSchema = z
  .object({
    checkoutSessionId: z.string().uuid(),
    chainId: z.number().int().positive(),
    packageId: z.string().min(1),
    transactionBlockBase64: z.string().min(1),
    userSignature: z.string().min(1).optional(),
    sponsorSignature: z.string().min(1),
    dualSignRequired: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(
    (v) => v.dualSignRequired === false || !!v.userSignature?.trim(),
    { message: 'userSignature is required when dualSignRequired is true' },
  );

router.post(
  '/sui/execute-sponsored',
  validate(suiExecuteSponsoredSchema),
  asyncHandler(async (req, res) => {
    const { executeSuiCheckoutSponsored } = await import('./sui-checkout-sponsor.service.js');
    const result = await executeSuiCheckoutSponsored(req.body, logger);
    success(res, result);
  }),
);

// ── GET /checkout/intent/:id ──
// Public intent status polling for the payment UI

router.get(
  '/intent/:id',
  asyncHandler(async (req, res) => {
    const intent = await intentService.getIntentPublic(req.params.id);
    success(res, intent);
  }),
);

export default router;
