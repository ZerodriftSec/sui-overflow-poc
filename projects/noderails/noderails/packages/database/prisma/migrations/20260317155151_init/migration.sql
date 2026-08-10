-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "MerchantRole" AS ENUM ('MERCHANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('TEST', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ApiKeyType" AS ENUM ('PUBLIC', 'SECRET');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MINUTE', 'DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURING', 'CAPTURED', 'SETTLED', 'DISPUTED', 'DISPUTE_RESOLVED', 'DISPUTE_LOST', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'CAPTURE_FAILED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "CaptureMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "AuthorizationMethod" AS ENUM ('NATIVE', 'PERMIT', 'EIP7702');

-- CreateEnum
CREATE TYPE "CheckoutMode" AS ENUM ('PAYMENT', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('OPEN', 'COMPLETE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('CHECKOUT_SESSION', 'PAYMENT_LINK', 'INVOICE', 'SUBSCRIPTION', 'API');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('AUTHORIZE', 'CAPTURE', 'SETTLE', 'DISPUTE_INITIATE', 'DISPUTE', 'REFUND', 'PAYOUT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVING', 'RESOLVED_MERCHANT', 'RESOLVED_PAYER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('CREATED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'PAST_DUE', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('RECEIVING', 'PAYOUT');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('PERMANENT_BOUNCE', 'COMPLAINT');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "role" "MerchantRole" NOT NULL DEFAULT 'MERCHANT',
    "orgName" VARCHAR(200),
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" VARCHAR(500),
    "disputeStartSeconds" INTEGER,
    "settlementSeconds" INTEGER,
    "platformFeeBps" INTEGER,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" VARCHAR(200),
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allAppsAccess" BOOLEAN NOT NULL DEFAULT false,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "passwordHash" TEXT,
    "inviteToken" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member_apps" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "inclusive" BOOLEAN NOT NULL DEFAULT false,
    "jurisdiction" VARCHAR(50),
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "disputeStartSeconds" INTEGER NOT NULL DEFAULT 86400,
    "settlementSeconds" INTEGER NOT NULL DEFAULT 604800,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 200,
    "webhookRedundantSends" INTEGER NOT NULL DEFAULT 3,
    "webhookRedundantDelays" JSONB NOT NULL DEFAULT '[0, 60000, 300000]',
    "webhookBaseDelayMs" INTEGER NOT NULL DEFAULT 5000,
    "webhookBackoffMultiplier" INTEGER NOT NULL DEFAULT 130,
    "webhookMaxDelayMs" INTEGER NOT NULL DEFAULT 3600000,
    "webhookMaxRetries" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'TEST',
    "receivingWallet" TEXT,
    "receivingWalletSignature" TEXT,
    "payoutWallet" TEXT,
    "payoutApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "type" "ApiKeyType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_chains" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "rpcUrl" TEXT,
    "explorerUrl" TEXT,
    "nativeCurrencySymbol" VARCHAR(10) NOT NULL,
    "nativeCurrencyDecimals" INTEGER NOT NULL DEFAULT 18,
    "escrowAddress" VARCHAR(42) NOT NULL,
    "merchantManagerAddress" VARCHAR(42) NOT NULL,
    "supports7702" BOOLEAN NOT NULL DEFAULT false,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "iconUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supported_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_tokens" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" VARCHAR(42) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "decimals" INTEGER NOT NULL,
    "tokenKey" VARCHAR(50) NOT NULL,
    "supportsNativeTransfer" BOOLEAN NOT NULL DEFAULT true,
    "supportsPermit" BOOLEAN NOT NULL DEFAULT false,
    "permitVersion" VARCHAR(10),
    "permitType" VARCHAR(20),
    "isStablecoin" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "iconUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supported_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_currencies" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(5) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supported_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_chains" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "settlementAddress" VARCHAR(42),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_tokens" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "supportedTokenId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_accounts" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "externalId" VARCHAR(255),
    "email" VARCHAR(255),
    "name" VARCHAR(255),
    "address" TEXT,
    "city" VARCHAR(255),
    "state" VARCHAR(255),
    "country" VARCHAR(255),
    "postalCode" VARCHAR(50),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_wallets" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "hasActiveAuthorization" BOOLEAN NOT NULL DEFAULT false,
    "authorizationType" VARCHAR(20),
    "authorizationTxHash" VARCHAR(66),
    "authorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_plans" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "planType" "PlanType" NOT NULL DEFAULT 'ONE_TIME',
    "taxRateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_plan_prices" (
    "id" TEXT NOT NULL,
    "productPlanId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "billingInterval" "BillingInterval",
    "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
    "trialPeriodDays" INTEGER NOT NULL DEFAULT 0,
    "nickname" VARCHAR(100),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "externalId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "allowedChains" JSONB NOT NULL DEFAULT '"ALL"',
    "allowedTokens" JSONB NOT NULL DEFAULT '"ALL"',
    "captureMode" "CaptureMode" NOT NULL DEFAULT 'AUTOMATIC',
    "timelockDuration" INTEGER NOT NULL DEFAULT 604800,
    "disputeStartDuration" INTEGER NOT NULL DEFAULT 86400,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "authorizationMethod" "AuthorizationMethod",
    "authorizationChainId" INTEGER,
    "authorizationTokenKey" TEXT,
    "authorizationWalletAddress" TEXT,
    "authorizationTxHash" VARCHAR(66),
    "authorizationSignature" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "cryptoAmount" TEXT,
    "cryptoTokenKey" VARCHAR(50),
    "cryptoTokenDecimals" INTEGER,
    "exchangeRate" DECIMAL(30,18),
    "captureTxHash" VARCHAR(66),
    "capturedAt" TIMESTAMP(3),
    "captureAttempts" INTEGER NOT NULL DEFAULT 0,
    "timelockEndsAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundTxHash" VARCHAR(66),
    "refundReason" VARCHAR(500),
    "platformFeeBps" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "sourceType" "PaymentSourceType",
    "sourceId" TEXT,
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "payoutIntentId" TEXT,
    "mtxmTxId" TEXT,
    "txHash" TEXT,
    "chain" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "blockNumber" INTEGER,
    "gasUsed" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "paymentIntentId" TEXT,
    "mode" "CheckoutMode" NOT NULL DEFAULT 'PAYMENT',
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'OPEN',
    "sourceType" "PaymentSourceType",
    "sourceId" TEXT,
    "amount" DECIMAL(18,2),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(18,2),
    "taxAmount" DECIMAL(18,2),
    "taxDescription" VARCHAR(200),
    "allowedChains" JSONB NOT NULL DEFAULT '"ALL"',
    "allowedTokens" JSONB NOT NULL DEFAULT '"ALL"',
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedPriceId" TEXT,
    "requireBillingDetails" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_session_items" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "productPlanId" TEXT,
    "productPlanPriceId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "amount" DECIMAL(18,2),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isPriceOption" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "customerProofKey" TEXT,
    "merchantResponse" TEXT,
    "merchantProofKey" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_intents" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "recipientWallet" TEXT NOT NULL,
    "merchantWallet" VARCHAR(42) NOT NULL,
    "amountUsd" DECIMAL(18,8) NOT NULL,
    "tokenAmount" DECIMAL(36,18) NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "sessionSignature" TEXT,
    "sessionExpiry" TIMESTAMP(3),
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "payout_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_change_logs" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "walletType" "WalletType" NOT NULL,
    "previousAddress" VARCHAR(42),
    "newAddress" VARCHAR(42) NOT NULL,
    "signature" TEXT,
    "changedBy" TEXT NOT NULL,
    "inFlightPayments" INTEGER NOT NULL DEFAULT 0,
    "pendingPayouts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "paymentIntentId" TEXT,
    "invoiceNumber" VARCHAR(50) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "taxRateId" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "allowedChains" JSONB NOT NULL DEFAULT '"ALL"',
    "allowedTokens" JSONB NOT NULL DEFAULT '"ALL"',
    "memo" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productPlanId" TEXT,
    "productPlanPriceId" TEXT,
    "taxRateId" TEXT,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "productPlanId" TEXT NOT NULL,
    "productPlanPriceId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'CREATED',
    "customerWalletId" TEXT,
    "authorizationMethod" "AuthorizationMethod",
    "authorizationChainId" INTEGER,
    "authorizationTokenKey" TEXT,
    "permitSignature" TEXT,
    "permitDeadline" TIMESTAMP(3),
    "permitNonce" TEXT,
    "approvedAllowance" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "billingCycleAnchor" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "captureRetryCount" INTEGER NOT NULL DEFAULT 0,
    "maxCaptureRetries" INTEGER NOT NULL DEFAULT 3,
    "pendingJobId" TEXT,
    "allowedChains" JSONB NOT NULL DEFAULT '"ALL"',
    "allowedTokens" JSONB NOT NULL DEFAULT '"ALL"',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_configs" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "preferredTokenKey" VARCHAR(50),
    "preferredChainId" INTEGER,
    "settlementAddress" VARCHAR(42),
    "autoSettle" BOOLEAN NOT NULL DEFAULT false,
    "minSettlementAmount" DECIMAL(18,2),
    "settlementCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "paymentIntentIds" JSONB NOT NULL DEFAULT '[]',
    "sourceTotalFiat" DECIMAL(18,2) NOT NULL,
    "sourceCurrency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "settlementTokenKey" VARCHAR(50),
    "settlementChainId" INTEGER,
    "settlementAmount" TEXT,
    "settlementAddress" VARCHAR(42) NOT NULL,
    "settlementTxHash" VARCHAR(66),
    "settledAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_links" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "slug" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "productPlanId" TEXT,
    "productPlanPriceId" TEXT,
    "taxRateId" TEXT,
    "allowedChains" JSONB NOT NULL DEFAULT '"ALL"',
    "allowedTokens" JSONB NOT NULL DEFAULT '"ALL"',
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "requireBillingDetails" BOOLEAN NOT NULL DEFAULT false,
    "imageKey" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_deployments" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "escrowAddress" TEXT NOT NULL,
    "merchantManagerAddress" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deployTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "invoiceId" TEXT,
    "templateId" VARCHAR(100) NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "messageId" TEXT,
    "bounceType" VARCHAR(50),
    "bounceSubType" VARCHAR(50),
    "complaintType" VARCHAR(100),
    "diagnosticCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_googleId_key" ON "merchants"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_inviteToken_key" ON "team_members"("inviteToken");

-- CreateIndex
CREATE INDEX "team_members_merchantId_idx" ON "team_members"("merchantId");

-- CreateIndex
CREATE INDEX "team_members_email_idx" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "team_members_inviteToken_idx" ON "team_members"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_merchantId_email_key" ON "team_members"("merchantId", "email");

-- CreateIndex
CREATE INDEX "team_member_apps_teamMemberId_idx" ON "team_member_apps"("teamMemberId");

-- CreateIndex
CREATE INDEX "team_member_apps_appId_idx" ON "team_member_apps"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_apps_teamMemberId_appId_key" ON "team_member_apps"("teamMemberId", "appId");

-- CreateIndex
CREATE INDEX "tax_rates_merchantId_idx" ON "tax_rates"("merchantId");

-- CreateIndex
CREATE INDEX "apps_merchantId_idx" ON "apps"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_appId_idx" ON "api_keys"("appId");

-- CreateIndex
CREATE INDEX "api_keys_keyHash_idx" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "supported_chains_chainId_key" ON "supported_chains"("chainId");

-- CreateIndex
CREATE INDEX "supported_tokens_tokenKey_idx" ON "supported_tokens"("tokenKey");

-- CreateIndex
CREATE INDEX "supported_tokens_chainId_idx" ON "supported_tokens"("chainId");

-- CreateIndex
CREATE INDEX "supported_tokens_symbol_idx" ON "supported_tokens"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "supported_tokens_chainId_contractAddress_key" ON "supported_tokens"("chainId", "contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "supported_currencies_code_key" ON "supported_currencies"("code");

-- CreateIndex
CREATE INDEX "app_chains_appId_idx" ON "app_chains"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "app_chains_appId_chainId_key" ON "app_chains"("appId", "chainId");

-- CreateIndex
CREATE INDEX "app_tokens_appId_idx" ON "app_tokens"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "app_tokens_appId_supportedTokenId_key" ON "app_tokens"("appId", "supportedTokenId");

-- CreateIndex
CREATE INDEX "customer_accounts_appId_idx" ON "customer_accounts"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_appId_externalId_key" ON "customer_accounts"("appId", "externalId");

-- CreateIndex
CREATE INDEX "customer_wallets_walletAddress_idx" ON "customer_wallets"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "customer_wallets_customerAccountId_chainId_walletAddress_key" ON "customer_wallets"("customerAccountId", "chainId", "walletAddress");

-- CreateIndex
CREATE INDEX "product_plans_appId_idx" ON "product_plans"("appId");

-- CreateIndex
CREATE INDEX "product_plans_planType_idx" ON "product_plans"("planType");

-- CreateIndex
CREATE INDEX "product_plan_prices_productPlanId_idx" ON "product_plan_prices"("productPlanId");

-- CreateIndex
CREATE INDEX "product_plan_prices_appId_idx" ON "product_plan_prices"("appId");

-- CreateIndex
CREATE INDEX "payment_intents_appId_idx" ON "payment_intents"("appId");

-- CreateIndex
CREATE INDEX "payment_intents_customerAccountId_idx" ON "payment_intents"("customerAccountId");

-- CreateIndex
CREATE INDEX "payment_intents_externalId_idx" ON "payment_intents"("externalId");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE INDEX "payment_intents_sourceType_sourceId_idx" ON "payment_intents"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "payment_intents_createdAt_idx" ON "payment_intents"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_appId_idempotencyKey_key" ON "payment_intents"("appId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_mtxmTxId_key" ON "transactions"("mtxmTxId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_txHash_key" ON "transactions"("txHash");

-- CreateIndex
CREATE INDEX "transactions_paymentIntentId_idx" ON "transactions"("paymentIntentId");

-- CreateIndex
CREATE INDEX "transactions_payoutIntentId_idx" ON "transactions"("payoutIntentId");

-- CreateIndex
CREATE INDEX "transactions_txHash_idx" ON "transactions"("txHash");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "checkout_sessions_appId_idx" ON "checkout_sessions"("appId");

-- CreateIndex
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions"("status");

-- CreateIndex
CREATE INDEX "checkout_sessions_sourceType_sourceId_idx" ON "checkout_sessions"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "checkout_session_items_checkoutSessionId_idx" ON "checkout_session_items"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_paymentIntentId_key" ON "disputes"("paymentIntentId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payout_intents_nonce_key" ON "payout_intents"("nonce");

-- CreateIndex
CREATE INDEX "payout_intents_merchantId_idx" ON "payout_intents"("merchantId");

-- CreateIndex
CREATE INDEX "payout_intents_appId_idx" ON "payout_intents"("appId");

-- CreateIndex
CREATE INDEX "payout_intents_status_idx" ON "payout_intents"("status");

-- CreateIndex
CREATE INDEX "wallet_change_logs_appId_idx" ON "wallet_change_logs"("appId");

-- CreateIndex
CREATE INDEX "wallet_change_logs_walletType_idx" ON "wallet_change_logs"("walletType");

-- CreateIndex
CREATE INDEX "wallet_change_logs_createdAt_idx" ON "wallet_change_logs"("createdAt");

-- CreateIndex
CREATE INDEX "webhooks_appId_idx" ON "webhooks"("appId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_nextRetryAt_idx" ON "webhook_deliveries"("nextRetryAt");

-- CreateIndex
CREATE INDEX "invoices_appId_idx" ON "invoices"("appId");

-- CreateIndex
CREATE INDEX "invoices_customerAccountId_idx" ON "invoices"("customerAccountId");

-- CreateIndex
CREATE INDEX "invoices_subscriptionId_idx" ON "invoices"("subscriptionId");

-- CreateIndex
CREATE INDEX "invoices_taxRateId_idx" ON "invoices"("taxRateId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_appId_invoiceNumber_key" ON "invoices"("appId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");

-- CreateIndex
CREATE INDEX "subscriptions_appId_idx" ON "subscriptions"("appId");

-- CreateIndex
CREATE INDEX "subscriptions_customerAccountId_idx" ON "subscriptions"("customerAccountId");

-- CreateIndex
CREATE INDEX "subscriptions_productPlanId_idx" ON "subscriptions"("productPlanId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_configs_appId_key" ON "settlement_configs"("appId");

-- CreateIndex
CREATE INDEX "settlements_appId_idx" ON "settlements"("appId");

-- CreateIndex
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_slug_key" ON "payment_links"("slug");

-- CreateIndex
CREATE INDEX "payment_links_appId_idx" ON "payment_links"("appId");

-- CreateIndex
CREATE INDEX "payment_links_slug_idx" ON "payment_links"("slug");

-- CreateIndex
CREATE INDEX "payment_links_productPlanId_idx" ON "payment_links"("productPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_deployments_chain_key" ON "contract_deployments"("chain");

-- CreateIndex
CREATE INDEX "email_deliveries_paymentIntentId_idx" ON "email_deliveries"("paymentIntentId");

-- CreateIndex
CREATE INDEX "email_deliveries_invoiceId_idx" ON "email_deliveries"("invoiceId");

-- CreateIndex
CREATE INDEX "email_deliveries_status_idx" ON "email_deliveries"("status");

-- CreateIndex
CREATE INDEX "email_deliveries_messageId_idx" ON "email_deliveries"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_email_key" ON "email_suppressions"("email");

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_apps" ADD CONSTRAINT "team_member_apps_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_apps" ADD CONSTRAINT "team_member_apps_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supported_tokens" ADD CONSTRAINT "supported_tokens_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "supported_chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_chains" ADD CONSTRAINT "app_chains_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_chains" ADD CONSTRAINT "app_chains_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "supported_chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_supportedTokenId_fkey" FOREIGN KEY ("supportedTokenId") REFERENCES "supported_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "supported_chains"("chainId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_plans" ADD CONSTRAINT "product_plans_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_plans" ADD CONSTRAINT "product_plans_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_plan_prices" ADD CONSTRAINT "product_plan_prices_productPlanId_fkey" FOREIGN KEY ("productPlanId") REFERENCES "product_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payoutIntentId_fkey" FOREIGN KEY ("payoutIntentId") REFERENCES "payout_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "checkout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_productPlanId_fkey" FOREIGN KEY ("productPlanId") REFERENCES "product_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session_items" ADD CONSTRAINT "checkout_session_items_productPlanPriceId_fkey" FOREIGN KEY ("productPlanPriceId") REFERENCES "product_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_change_logs" ADD CONSTRAINT "wallet_change_logs_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productPlanId_fkey" FOREIGN KEY ("productPlanId") REFERENCES "product_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productPlanPriceId_fkey" FOREIGN KEY ("productPlanPriceId") REFERENCES "product_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_productPlanId_fkey" FOREIGN KEY ("productPlanId") REFERENCES "product_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_productPlanPriceId_fkey" FOREIGN KEY ("productPlanPriceId") REFERENCES "product_plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerWalletId_fkey" FOREIGN KEY ("customerWalletId") REFERENCES "customer_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_configs" ADD CONSTRAINT "settlement_configs_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_productPlanId_fkey" FOREIGN KEY ("productPlanId") REFERENCES "product_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_productPlanPriceId_fkey" FOREIGN KEY ("productPlanPriceId") REFERENCES "product_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
