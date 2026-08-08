'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, Button, Label, Tabs } from '@heroui/react';
import {
  Shield,
  ExternalLink,
  XCircle,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  CreditCard,
} from 'lucide-react';
import { useAccount, useBalance, useSendTransaction } from 'wagmi';
import { formatUnits } from 'viem';
import {
  useTokenBalance,
  useTokenAllowance,
  useTokenApproval,
  usePermitSign,
  usePriceConversion,
  useChainSwitch,
  useIntentStatusPolling,
} from '../lib/checkout-hooks';
import { useCheckoutWallet, useSatelliteSolanaSend, useSatelliteSuiSignAndExecute } from '../lib/satellite-wallet';
import { CheckoutSuiWalletGrid } from './checkout/checkout-sui-wallet-grid';
import { executeSuiCapture, type SuiServerCaptureData } from '../lib/sui-capture';
import { useSuiTokenBalance } from '../lib/sui-balance';
import {
  executeSuiWalletSetup,
  fetchSuiWalletSubscriptionState,
  describeSuiSubscriptionWalletBlocker,
  isSuiSubscriptionWalletReadyForCharge,
  waitForSuiSubscriptionWallet,
} from '../lib/sui-wallet';
import { CheckoutAmountHero } from './checkout/checkout-amount-hero';
import { CheckoutOrderSummary } from './checkout/checkout-order-summary';
import { NodeRailsLogo } from './noderails-logo';
import { CheckoutChainFrame } from './checkout/checkout-chain-frame';
import { CheckoutWalletGrid } from './checkout/checkout-wallet-grid';
import { ConnectedWalletPill } from './checkout/connected-wallet-pill';
import { CheckoutPrimaryButton } from './checkout/checkout-primary-button';
import { CheckoutTrustFooter } from './checkout/checkout-trust-footer';
import { SwitchNetworkBanner } from './checkout/switch-network-banner';
import type { AuthorizePaymentInput } from '../lib/api';
import { authorizePayment, reportNativeCapture } from '../lib/api';
import { getSolanaPublicRpcUrl, isNativeToken, shortenAddress, blockExplorerTxUrl } from '@noderails/common';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  createApproveInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { CheckoutHeroSelect } from './checkout/checkout-heroui-select';
import { getDodoPaymentsDemoConfig } from '@/lib/dodo-payments-demo';
import { track } from '../lib/analytics';
import { MezoBorrowLayer, useMezoBorrowProceed } from '@/features/mezo-borrow';

/** Wallet pre-instruction budget for capture txs; Solana max per tx is 1.4M CUs. */
const SOLANA_NATIVE_CAPTURE_CU_LIMIT = 1_400_000;

// ── Iframe parent-frame messaging ──
// When the hosted checkout is embedded as an iframe (e.g. by the
// pretix-noderails plugin), the merchant integration listens for these
// events to react instantly without waiting for a server-side poll.
function notifyParentFrame(
  type: 'noderails:checkout-complete' | 'noderails:checkout-failed' | 'noderails:checkout-cancelled',
  data: Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage({ type, ...data }, '*');
  } catch {
    // Embedding origin disallowed message — silent no-op.
  }
}

// ── Types ──

interface ChainInfo {
  chainId: number;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  name: string;
  displayName: string;
  nativeCurrencySymbol: string;
  iconUrl: string | null;
  isTestnet: boolean;
  escrowAddress?: string;
  rpcUrl?: string | null;
  settlementAddress?: string | null;
  escrowConfigObjectId?: string | null;
  paymentRegistryObjectId?: string | null;
  walletRegistryObjectId?: string | null;
}

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  tokenKey: string;
  contractAddress: string;
  chainId: number;
  iconUrl: string | null;
  isStablecoin: boolean;
  supportsPermit?: boolean;
  permitVersion?: string | null;
}

interface PaymentLinkData {
  id: string;
  checkoutSessionId: string;
  name: string;
  description?: string | null;
  slug: string;
  amount?: number | null;
  subtotal?: number | null;
  taxAmount?: number | null;
  taxDescription?: string | null;
  currency: string;
  isActive: boolean;
  successUrl?: string | null;
  cancelUrl?: string | null;
  collectCustomerInfo?: boolean;
  requireBillingDetails?: boolean;
  app?: { name: string; orgName?: string | null; environment?: string; logoUrl?: string | null } | null;
  acceptedChains?: ChainInfo[];
  acceptedTokens?: TokenInfo[];
  productPlan?: {
    name: string;
    description?: string | null;
    imageUrl?: string | null;
  } | null;
  productPlanPrice?: {
    id: string;
    amount: number;
    currency: string;
    billingInterval?: string | null;
    billingIntervalCount?: number | null;
    nickname?: string | null;
  } | null;
  items?: {
    description?: string;
    name?: string;
    amount: number | string;
    currency: string;
    quantity: number;
  }[];
}

// ── Checkout Steps ──

type CheckoutStep = 'select' | 'customer-info' | 'review' | 'approve' | 'processing' | 'success' | 'error';

function ceilToSixDecimals(rawAmount: bigint, tokenDecimals: number): bigint {
  if (tokenDecimals <= 6) return rawAmount;
  const scale = 10n ** BigInt(tokenDecimals - 6);
  return ((rawAmount + scale - 1n) / scale) * scale;
}

/** Matches on-chain `escrow_auth` PDA from `noderails_escrow` — used as SPL delegate. */
function escrowAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('escrow_auth', 'utf8')], programId);
  return pda;
}

function normalizeSolanaMintString(contractAddress: string): string {
  const s = contractAddress.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    return s.slice(2).trim();
  }
  return s;
}

async function resolveSplMintTokenProgram(conn: Connection, mint: PublicKey): Promise<PublicKey | null> {
  const info = await conn.getAccountInfo(mint, 'confirmed');
  if (!info) {
    return null;
  }
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  if (info.owner.equals(TOKEN_PROGRAM_ID)) {
    return TOKEN_PROGRAM_ID;
  }
  return null;
}

function payerAssociatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgramId: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** SPL balance at the owner's ATA (0n if no token account). `null` if mint/RPC is unusable. */
async function fetchSplPayerTokenRawBalance(
  conn: Connection,
  mintAddressStr: string,
  ownerBase58: string,
): Promise<bigint | null> {
  try {
    const mint = new PublicKey(normalizeSolanaMintString(mintAddressStr));
    const owner = new PublicKey(ownerBase58);
    const tokenProgramId = await resolveSplMintTokenProgram(conn, mint);
    if (!tokenProgramId) {
      return null;
    }
    const ata = payerAssociatedTokenAddress(mint, owner, tokenProgramId);
    try {
      const acc = await getAccount(conn, ata, 'confirmed', tokenProgramId);
      return acc.amount;
    } catch (e: unknown) {
      if (e instanceof TokenAccountNotFoundError) {
        return 0n;
      }
      throw e;
    }
  } catch {
    return null;
  }
}

// ── Main Component ──

export function PaymentLinkCheckout({ link }: { link: PaymentLinkData }) {
  const { address } = useAccount();
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string | null>(null);
  const [pendingCaptureTx, setPendingCaptureTx] = useState<{
    hash: string;
    chainType: 'EVM' | 'SOLANA' | 'SUI';
    chainId: number;
  } | null>(null);
  const [step, setStep] = useState<CheckoutStep>('select');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingCountry, setBillingCountry] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');

  useEffect(() => {
    track('checkout_viewed', {
      payment_link_id: link.id,
      checkout_session_id: link.checkoutSessionId,
      is_subscription: Boolean(link.productPlanPrice?.billingInterval),
    });
  }, [link.id, link.checkoutSessionId, link.productPlanPrice?.billingInterval]);

  useEffect(() => {
    track('checkout_step_changed', {
      step,
      payment_link_id: link.id,
    });
  }, [step, link.id]);

  const merchantName = link.app?.orgName?.trim() || link.app?.name || 'Merchant';
  const merchantLogoUrl = link.app?.logoUrl?.trim() || null;
  const numericAmount = link.amount != null ? Number(link.amount) : null;
  const hasFixedAmount = numericAmount != null && !Number.isNaN(numericAmount) && numericAmount > 0;
  const linkedPrice = link.productPlanPrice ?? null;
  const chains = link.acceptedChains ?? [];
  const tokens = link.acceptedTokens ?? [];
  const isTestnet = link.app?.environment === 'TEST' || chains.some((c) => c.isTestnet);

  // Selected chain (needed before token list filtering)
  const selectedChain = chains.find((c) => c.chainId === selectedChainId);

  // Tokens filtered for the selected chain
  const tokensForChain = selectedChainId
    ? tokens.filter((t) => t.chainId === selectedChainId)
    : tokens;

  const selectedToken = tokens.find((t) => t.tokenKey === selectedTokenKey);

  const { connected: walletConnected, solanaPublicKey } = useCheckoutWallet(selectedChain?.chainType);

  useEffect(() => {
    if (chains.length === 1 && selectedChainId == null) {
      setSelectedChainId(chains[0].chainId);
    }
  }, [chains, selectedChainId]);

  useEffect(() => {
    if (selectedChainId != null && tokensForChain.length === 1 && selectedTokenKey == null) {
      setSelectedTokenKey(tokensForChain[0].tokenKey);
    }
  }, [selectedChainId, tokensForChain, selectedTokenKey]);

  const walletOkForReview = walletConnected && Boolean(selectedChain);
  const canProceedToReview = Boolean(
    walletOkForReview && selectedChain && selectedToken && hasFixedAmount,
  );
  const continueDisabledReason = !selectedChain
    ? 'Select a network to continue'
    : !selectedToken
      ? 'Select a token to continue'
      : !hasFixedAmount
        ? 'Payment amount is invalid'
        : !walletOkForReview
          ? 'Connect your wallet to continue'
          : null;
  const requireBilling = link.requireBillingDetails === true;
  // Always go to customer-info after select (email always required)
  const nextAfterSelect = 'customer-info';

  const mezoBorrow = useMezoBorrowProceed({
    isTestnet,
    amountUsd: numericAmount ?? undefined,
    selectedChain,
    selectedToken,
    acceptedTokens: tokens,
    onContinueReview: (nextTokenKey) => {
      if (nextTokenKey) setSelectedTokenKey(nextTokenKey);
      setStep('review');
    },
  });

  // ── Inactive link ──

  if (!link.isActive) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-lg font-semibold text-gray-900">Link Inactive</p>
          <p className="mt-2 text-sm text-gray-500">
            This payment link is no longer active.
          </p>
        </div>
      </div>
    );
  }

  if (!hasFixedAmount) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-lg font-semibold text-gray-900">Checkout Unavailable</p>
          <p className="mt-2 text-sm text-gray-500">
            This checkout session does not have a valid payment amount. Contact the merchant or
            request a new checkout link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ═══════════ LEFT PANEL — Order summary ═══════════ */}
      <div className="checkout-panel-left hidden md:flex md:w-[42%] lg:w-[40%] xl:w-[38%] flex-col min-h-0 p-8 lg:p-10 xl:p-12">
        {/* Merchant brand */}
        <div className="relative z-10 shrink-0 max-w-md mx-auto w-full">
          <div className="checkout-panel-left__merchant-brand">
            {merchantLogoUrl ? (
              <img
                src={merchantLogoUrl}
                alt=""
                className="checkout-panel-left__merchant-logo"
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className="checkout-panel-left__merchant-logo-fallback">
                <Shield className="h-4 w-4" strokeWidth={2} />
              </div>
            )}
            <span className="checkout-panel-left__merchant-name">{merchantName}</span>
          </div>
        </div>

        {/* Order summary */}
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10 mt-8 lg:mt-10">
          <div className="checkout-order-summary-shell max-w-md mx-auto w-full">
            <CheckoutOrderSummary
              title={link.name}
              description={link.description}
              currency={link.currency || 'USD'}
              totalAmount={numericAmount!}
              subtotal={link.subtotal}
              taxAmount={link.taxAmount}
              taxDescription={link.taxDescription}
              items={link.items}
              productPlan={link.productPlan}
              linkedPrice={linkedPrice}
              hasFixedAmount={hasFixedAmount}
            />
          </div>
        </div>

        {/* Trust card */}
        <div className="relative z-10 shrink-0 pt-8 max-w-md mx-auto w-full">
          <div className="checkout-panel-left__trust-card">
            <NodeRailsLogo className="checkout-panel-left__trust-logo" animate={false} />
            <div className="checkout-panel-left__trust-copy">
              <p className="checkout-panel-left__trust-title">Secured by NodeRails</p>
              <p className="checkout-panel-left__trust-subtitle">
                Your payment is encrypted and processed securely
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ RIGHT PANEL — Payment flow ═══════════ */}
      <div className="checkout-right-bg flex-1 flex flex-col items-center justify-center px-4 py-6 sm:px-6 md:px-8 lg:px-12 xl:px-16 overflow-y-auto">
        <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl my-auto">
          {/* Mobile-only header */}
          <div className="md:hidden mb-5">
            <p className="text-[13px] font-medium text-slate-500">{merchantName}</p>
            <p className="mt-1 text-[13px] font-medium text-slate-500">
              {linkedPrice?.billingInterval ? 'Subscribe to' : 'Pay for'}
            </p>
            <h1 className="mt-0.5 text-[17px] font-medium leading-snug text-slate-900">
              {link.name}
            </h1>
            {hasFixedAmount && (
              <p className="mt-2 text-[32px] font-semibold tracking-tight text-slate-900 tabular-nums">
                ${numericAmount!.toFixed(2)}
                <span className="ml-2 text-[15px] font-normal text-slate-500">{link.currency}</span>
                {linkedPrice?.billingInterval && (
                  <span className="ml-1 text-[15px] font-normal text-slate-500">
                    /{linkedPrice.billingInterval.toLowerCase()}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Testnet Banner */}
          {isTestnet && (
            <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700 font-medium">Test Mode</p>
            </div>
          )}

          {/* Step Progress */}
          {step !== 'select' && step !== 'customer-info' && (
            <div className="mb-3">
              <StepIndicator currentStep={step} />
            </div>
          )}

          {/* ── Main content ── */}
          <CheckoutChainFrame>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            {step === 'select' && (
              <SelectStep
                chains={chains}
                tokensForChain={tokensForChain}
                selectedChainId={selectedChainId}
                selectedTokenKey={selectedTokenKey}
                selectedChain={selectedChain}
                selectedToken={selectedToken}
                amountUsd={hasFixedAmount ? numericAmount! : null}
                currency={link.currency || 'USD'}
                walletConnected={walletConnected}
                canContinue={canProceedToReview}
                continueDisabledReason={continueDisabledReason}
                onContinue={() => setStep(nextAfterSelect as CheckoutStep)}
                tokenEmptyHint={
                  selectedChain?.chainType === 'SOLANA' &&
                  selectedChainId != null &&
                  tokensForChain.length === 0
                    ? 'No tokens are configured for Solana on this link. Ask the merchant to add accepted tokens.'
                    : undefined
                }
                onSelectChain={(chainId) => {
                  setSelectedChainId(chainId);
                  setSelectedTokenKey(null);
                  track('checkout_chain_selected', { chain_id: chainId, payment_link_id: link.id });
                }}
                onSelectToken={(tokenKey) => {
                  setSelectedTokenKey(tokenKey);
                  track('checkout_token_selected', { token_key: tokenKey, payment_link_id: link.id });
                }}
              />
            )}

            {step === 'customer-info' && (
              <CustomerInfoStep
                email={customerEmail}
                name={customerName}
                billingAddress={billingAddress}
                billingCity={billingCity}
                billingState={billingState}
                billingCountry={billingCountry}
                billingPostalCode={billingPostalCode}
                requireBillingDetails={requireBilling}
                onEmailChange={setCustomerEmail}
                onNameChange={setCustomerName}
                onBillingAddressChange={setBillingAddress}
                onBillingCityChange={setBillingCity}
                onBillingStateChange={setBillingState}
                onBillingCountryChange={setBillingCountry}
                onBillingPostalCodeChange={setBillingPostalCode}
                onBack={() => setStep('select')}
                onProceed={mezoBorrow.proceed}
              />
            )}

            {step === 'review' && selectedChain && selectedToken && hasFixedAmount && (
              <ReviewStep
                link={link}
                chain={selectedChain}
                token={selectedToken}
                amountUsd={numericAmount!}
                currency={link.currency || 'USD'}
                solanaPublicKey={solanaPublicKey}
                onBack={() => setStep('customer-info')}
                onProceed={() => setStep('approve')}
              />
            )}

            {step === 'approve' && selectedChain && selectedToken && hasFixedAmount && (
              <ApproveStep
                link={link}
                chain={selectedChain}
                token={selectedToken}
                amountUsd={numericAmount!}
                currency={link.currency || 'USD'}
                solanaPublicKey={solanaPublicKey}
                customerEmail={customerEmail}
                customerName={customerName || undefined}
                billingAddress={billingAddress || undefined}
                billingCity={billingCity || undefined}
                billingState={billingState || undefined}
                billingCountry={billingCountry || undefined}
                billingPostalCode={billingPostalCode || undefined}
                onBack={() => setStep('review')}
                onSubmitted={(id, opts) => {
                  setIntentId(id);
                  if (opts?.captureTxHash && opts.chainType && opts.chainId != null) {
                    setPendingCaptureTx({
                      hash: opts.captureTxHash,
                      chainType: opts.chainType,
                      chainId: opts.chainId,
                    });
                  } else {
                    setPendingCaptureTx(null);
                  }
                  setStep('processing');
                  track('checkout_authorization_succeeded', {
                    intent_id: id,
                    payment_link_id: link.id,
                    chain_id: selectedChain?.chainId,
                    token_key: selectedToken?.tokenKey,
                  });
                }}
                onError={(msg) => {
                  setErrorMessage(msg);
                  setStep('error');
                  track('checkout_authorization_failed', {
                    payment_link_id: link.id,
                    chain_id: selectedChain?.chainId,
                    token_key: selectedToken?.tokenKey,
                    error_message: msg,
                  });
                }}
                isSubmitting={isSubmitting}
                setIsSubmitting={setIsSubmitting}
              />
            )}

            {step === 'processing' && intentId && (
              <ProcessingStep
                intentId={intentId}
                sessionId={link.checkoutSessionId}
                successUrl={link.successUrl}
                pendingTx={pendingCaptureTx}
                onSuccess={() => setStep('success')}
                onError={(msg) => {
                  setErrorMessage(msg);
                  setStep('error');
                }}
              />
            )}

            {step === 'success' && (
              <SuccessStep successUrl={link.successUrl} merchantName={merchantName} />
            )}

            {step === 'error' && (
              <ErrorStep
                message={errorMessage}
                onRetry={() => window.location.reload()}
              />
            )}
          </motion.div>
          </CheckoutChainFrame>

          {/* Cancel link */}
          {link.cancelUrl && (
            <div className="mt-4 text-[11px]">
              <a
                href={link.cancelUrl}
                className="text-slate-400 hover:text-slate-600"
              >
                Cancel
              </a>
            </div>
          )}
        </div>
      </div>
      {mezoBorrow.layerProps && <MezoBorrowLayer {...mezoBorrow.layerProps} />}
    </div>
  );
}

// ── Step Indicator ──

function StepIndicator({ currentStep }: { currentStep: CheckoutStep }) {
  const steps = [
    { key: 'review', label: 'Review' },
    { key: 'approve', label: 'Authorize' },
    { key: 'processing', label: 'Processing' },
    { key: 'success', label: 'Done' },
  ];
  const stepOrder = ['review', 'approve', 'processing', 'success'];
  const currentIdx = stepOrder.indexOf(currentStep);

  return (
    <div className="flex items-center justify-between gap-1">
      {steps.map((s, i) => {
        const isDone = currentIdx > i;
        const isCurrent = currentStep === s.key;
        return (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-[#635bff] text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {isDone ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={`text-[11px] font-medium truncate ${
                isCurrent
                  ? 'text-gray-900'
                  : isDone
                    ? 'text-emerald-600'
                    : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`h-px flex-1 mx-1 ${
                  isDone ? 'bg-emerald-500' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Select Step (Chain / Token selection) ──

function SelectStep({
  chains,
  tokensForChain,
  selectedChainId,
  selectedTokenKey,
  selectedChain,
  selectedToken,
  amountUsd,
  currency,
  walletConnected,
  canContinue,
  continueDisabledReason,
  onContinue,
  tokenEmptyHint,
  onSelectChain,
  onSelectToken,
}: {
  chains: ChainInfo[];
  tokensForChain: TokenInfo[];
  selectedChainId: number | null;
  selectedTokenKey: string | null;
  selectedChain?: ChainInfo;
  selectedToken?: TokenInfo;
  amountUsd: number | null;
  currency: string;
  walletConnected: boolean;
  canContinue: boolean;
  continueDisabledReason: string | null;
  onContinue: () => void;
  tokenEmptyHint?: string;
  onSelectChain: (chainId: number) => void;
  onSelectToken: (tokenKey: string) => void;
}) {
  const [payMethod, setPayMethod] = useState<'crypto' | 'card'>('crypto');
  const dodoConfig = getDodoPaymentsDemoConfig();
  const cardEnabled = !!dodoConfig;

  const chainOptions = chains.map((chain) => ({
    id: String(chain.chainId),
    label: chain.displayName,
    sublabel: chain.nativeCurrencySymbol,
    icon: <ChainIcon chain={chain} />,
  }));

  const tokenOptions = tokensForChain.map((token) => ({
    id: token.tokenKey,
    label: token.symbol,
    sublabel: token.name,
    icon: <TokenIcon token={token} />,
  }));

  const price = usePriceConversion(
    selectedToken?.symbol,
    amountUsd ?? undefined,
    selectedToken?.decimals,
    currency,
  );

  const tokenAmountLabel = price.data
    ? `${Number(price.data.tokenAmount) >= 1 ? Number(price.data.tokenAmount).toFixed(2) : Number(price.data.tokenAmount).toFixed(4)} ${selectedToken?.symbol ?? ''}`
    : amountUsd != null
      ? `$${amountUsd.toFixed(2)}`
      : '';

  const ctaLabel = walletConnected
    ? `Continue${tokenAmountLabel ? ` · ${tokenAmountLabel}` : ''}`
    : `Connect & Pay${tokenAmountLabel ? ` · ${tokenAmountLabel}` : ''}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Tabs
        selectedKey={payMethod}
        onSelectionChange={(key) => setPayMethod(String(key) as 'crypto' | 'card')}
        variant="primary"
        className="checkout-pay-tabs w-full"
      >
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-indigo-600">Pay with</p>

        <Tabs.ListContainer>
          <Tabs.List aria-label="Pay with" className="w-full">
            <Tabs.Tab id="crypto" className="flex-1 text-sm font-semibold text-slate-600">
              Crypto
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab
              id="card"
              isDisabled={!cardEnabled}
              className="flex-1 text-sm font-semibold text-slate-600"
            >
              <span className="inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Card
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="crypto" className="space-y-6 pt-6">
          {chains.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <CheckoutHeroSelect
                label="Network"
                options={chainOptions}
                value={selectedChainId != null ? String(selectedChainId) : null}
                onChange={(v) => onSelectChain(Number(v))}
                placeholder="Select network"
              />
              {tokensForChain.length > 0 ? (
                <CheckoutHeroSelect
                  label="Token"
                  options={tokenOptions}
                  value={selectedTokenKey}
                  onChange={onSelectToken}
                  placeholder="Select token"
                />
              ) : (
                <div className="flex flex-col justify-end">
                  <span className="checkout-field-label">Token</span>
                  <div className="flex h-[3.25rem] items-center rounded-[14px] border border-dashed border-indigo-200 bg-indigo-50/50 px-4 text-sm font-medium text-slate-500">
                    Select network first
                  </div>
                </div>
              )}
            </div>
          )}

          {tokenEmptyHint && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{tokenEmptyHint}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {amountUsd != null && selectedChain && selectedToken && (
            <CheckoutAmountHero
              tokenSymbol={selectedToken.symbol}
              amountUsd={amountUsd}
              decimals={selectedToken.decimals}
              currency={currency}
              chainName={selectedChain.displayName}
              chainIcon={<ChainIcon chain={selectedChain} />}
              tokenIcon={<TokenIcon token={selectedToken} />}
            />
          )}

          {walletConnected && selectedChain && selectedToken && <ConnectedWalletPill />}

          {!walletConnected && selectedChain && selectedToken && (
            selectedChain.chainType === 'SUI' ? (
              <CheckoutSuiWalletGrid />
            ) : (
              <CheckoutWalletGrid
                chainType={selectedChain.chainType === 'SOLANA' ? 'SOLANA' : 'EVM'}
                chainId={selectedChain.chainId}
              />
            )
          )}

          <div className="space-y-2 pt-1">
            <CheckoutPrimaryButton
              onClick={onContinue}
              disabled={!canContinue}
              size="lg"
            >
              {ctaLabel}
            </CheckoutPrimaryButton>
            {!canContinue && continueDisabledReason && (
              <p className="text-center text-xs text-slate-500">{continueDisabledReason}</p>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="card" className="space-y-4 pt-6">
          {dodoConfig ? (
            <>
              <p className="text-sm text-slate-600">
                Pay securely with your credit or debit card via Dodo Payments.
              </p>
              <Button
                fullWidth
                size="lg"
                variant="primary"
                onPress={() => window.open(dodoConfig.checkoutUrl, '_blank', 'noopener,noreferrer')}
              >
                Continue with Card
                <ExternalLink className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">Card payments are coming soon.</p>
          )}
        </Tabs.Panel>
      </Tabs>

      <CheckoutTrustFooter />
    </motion.div>
  );
}

// ── Customer Info Step ──

function CustomerInfoStep({
  email,
  name,
  billingAddress,
  billingCity,
  billingState,
  billingCountry,
  billingPostalCode,
  requireBillingDetails,
  onEmailChange,
  onNameChange,
  onBillingAddressChange,
  onBillingCityChange,
  onBillingStateChange,
  onBillingCountryChange,
  onBillingPostalCodeChange,
  onBack,
  onProceed,
}: {
  email: string;
  name: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingCountry: string;
  billingPostalCode: string;
  requireBillingDetails: boolean;
  onEmailChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onBillingAddressChange: (v: string) => void;
  onBillingCityChange: (v: string) => void;
  onBillingStateChange: (v: string) => void;
  onBillingCountryChange: (v: string) => void;
  onBillingPostalCodeChange: (v: string) => void;
  onBack: () => void;
  onProceed: () => void;
}) {
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const billingValid = !requireBillingDetails || (
    name.trim().length > 0 &&
    billingAddress.trim().length > 0 &&
    billingCity.trim().length > 0 &&
    billingState.trim().length > 0 &&
    billingCountry.trim().length > 0 &&
    billingPostalCode.trim().length > 0
  );
  const canContinue = isValidEmail && billingValid;

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 transition-all';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Your information</h3>
        <p className="text-xs text-gray-500">Required for your receipt.</p>
      </div>

      <div className="space-y-2.5">
        {/* Email — always required */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
            required
          />
        </div>

        {/* Name — required when billing required, optional otherwise */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Name {requireBillingDetails
              ? <span className="text-red-500">*</span>
              : <span className="text-gray-400 font-normal">(optional)</span>
            }
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name"
            className={inputClass}
          />
        </div>

        {/* Billing details section */}
        {requireBillingDetails && (
          <div className="pt-1.5 space-y-2.5">
            <h4 className="text-xs font-medium text-gray-600">Billing</h4>
            <input
              type="text"
              value={billingAddress}
              onChange={(e) => onBillingAddressChange(e.target.value)}
              placeholder="Address"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={billingCity}
                onChange={(e) => onBillingCityChange(e.target.value)}
                placeholder="City"
                className={inputClass}
              />
              <input
                type="text"
                value={billingState}
                onChange={(e) => onBillingStateChange(e.target.value)}
                placeholder="State"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={billingCountry}
                onChange={(e) => onBillingCountryChange(e.target.value)}
                placeholder="Country"
                className={inputClass}
              />
              <input
                type="text"
                value={billingPostalCode}
                onChange={(e) => onBillingPostalCodeChange(e.target.value)}
                placeholder="ZIP"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
        <div className="flex-[1.5]">
          <CheckoutPrimaryButton onClick={onProceed} disabled={!canContinue}>
            Continue
          </CheckoutPrimaryButton>
        </div>
      </div>

      <CheckoutTrustFooter />
    </div>
  );
}

// ── Review Step (price conversion, balance check, chain switch) ──

function ReviewStep({
  link,
  chain,
  token,
  amountUsd,
  currency,
  solanaPublicKey,
  onBack,
  onProceed,
}: {
  link: PaymentLinkData;
  chain: ChainInfo;
  token: TokenInfo;
  amountUsd: number;
  currency: string;
  solanaPublicKey: string | null;
  onBack: () => void;
  onProceed: () => void;
}) {
  const { address } = useAccount();
  const native = isNativeToken(token.contractAddress);
  const isSolana = chain.chainType === 'SOLANA';
  const isSui = chain.chainType === 'SUI';
  const isSolanaSpl = isSolana && !native;

  // Price conversion: fiat → token amount
  const price = usePriceConversion(token.symbol, amountUsd, token.decimals, currency);

  // Chain switch (before balance hooks that gate on needsSwitch)
  const { needsSwitch } = useChainSwitch(isSolana || isSui ? undefined : chain.chainId);

  const suiBalance = useSuiTokenBalance(token.contractAddress, isSui);

  // Balance checks
  const { balance: erc20Balance, refetch: refetchErc20 } = useTokenBalance(
    !isSolana && !isSui && !native ? token.contractAddress : undefined,
    chain.chainId,
    token.decimals,
  );
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address,
    chainId: chain.chainId,
    query: { enabled: !!address && native && !isSolana && !isSui && !needsSwitch },
  });

  const [solanaLamports, setSolanaLamports] = useState<number | null>(null);
  const [solanaBalanceLoading, setSolanaBalanceLoading] = useState(false);

  const solanaRpc =
    chain.rpcUrl ?? getSolanaPublicRpcUrl(chain.chainId) ?? 'https://api.devnet.solana.com';

  const [splTokenRawReview, setSplTokenRawReview] = useState<bigint | null>(null);
  const [splBalanceLoadingReview, setSplBalanceLoadingReview] = useState(false);

  const fetchSplBalanceReview = useCallback(async () => {
    if (!isSolanaSpl || !solanaPublicKey) {
      setSplTokenRawReview(null);
      return;
    }
    setSplBalanceLoadingReview(true);
    try {
      const conn = new Connection(solanaRpc, 'confirmed');
      const raw = await fetchSplPayerTokenRawBalance(conn, token.contractAddress, solanaPublicKey);
      setSplTokenRawReview(raw);
    } catch {
      setSplTokenRawReview(null);
    } finally {
      setSplBalanceLoadingReview(false);
    }
  }, [isSolanaSpl, solanaPublicKey, token.contractAddress, solanaRpc]);

  useEffect(() => {
    void fetchSplBalanceReview();
  }, [fetchSplBalanceReview]);

  const refetchSolanaBalance = useCallback(async () => {
    if (!isSolana || !native || !solanaPublicKey) return;
    setSolanaBalanceLoading(true);
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const conn = new Connection(solanaRpc, 'confirmed');
      const lamports = await conn.getBalance(new PublicKey(solanaPublicKey));
      setSolanaLamports(lamports);
    } finally {
      setSolanaBalanceLoading(false);
    }
  }, [isSolana, native, solanaPublicKey, solanaRpc]);

  useEffect(() => {
    void refetchSolanaBalance();
  }, [refetchSolanaBalance]);

  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  const handleRefreshBalance = useCallback(async () => {
    setIsRefreshingBalance(true);
    try {
      if (isSolanaSpl) {
        await fetchSplBalanceReview();
      } else if (isSolana && native) {
        await refetchSolanaBalance();
      } else if (isSui) {
        await suiBalance.refetch();
      } else if (native) {
        await refetchNative();
      } else {
        await refetchErc20();
      }
    } finally {
      setTimeout(() => setIsRefreshingBalance(false), 500);
    }
  }, [isSolanaSpl, isSolana, isSui, native, fetchSplBalanceReview, refetchSolanaBalance, suiBalance, refetchNative, refetchErc20]);

  const balanceLoading = isSui
    ? suiBalance.loading || (suiBalance.balance === null && !!suiBalance.suiAddress)
    : isSolanaSpl
    ? splBalanceLoadingReview
    : isSolana && native
      ? solanaBalanceLoading || (solanaLamports === null && !!solanaPublicKey)
      : native
        ? !nativeBalance && !!address
        : erc20Balance === undefined && !!address;

  const displayBalance =
    isSui
      ? suiBalance.balance != null
        ? Number(formatUnits(suiBalance.balance, token.decimals)).toFixed(6)
        : undefined
      : isSolanaSpl
      ? splTokenRawReview != null
        ? Number(formatUnits(splTokenRawReview, token.decimals)).toFixed(6)
        : undefined
      : isSolana && native
        ? solanaLamports != null
          ? Number(formatUnits(BigInt(solanaLamports), token.decimals)).toFixed(6)
          : undefined
        : native
          ? nativeBalance
            ? Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toFixed(6)
            : undefined
          : erc20Balance !== undefined
            ? Number(formatUnits(erc20Balance, token.decimals)).toFixed(6)
            : undefined;

  const rawBalance =
    isSui
      ? suiBalance.balance ?? 0n
      : isSolanaSpl
      ? splTokenRawReview ?? 0n
      : isSolana && native
        ? solanaLamports != null
          ? BigInt(solanaLamports)
          : 0n
        : native
          ? (nativeBalance?.value ?? 0n)
          : (erc20Balance ?? 0n);

  const hasSufficientBalance = price.data ? rawBalance >= price.data.rawAmount : false;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-900">Review payment</h3>

      {/* Payment method summary */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <ChainIcon chain={chain} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{chain.displayName}</p>
          <p className="text-xs text-gray-500">{token.symbol} &middot; {token.name}</p>
        </div>
        <p className="text-sm font-bold text-gray-900 tabular-nums">{amountUsd.toFixed(2)} {currency}</p>
      </div>

      {/* Crypto Conversion */}
      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">You pay</span>
          {price.isLoading ? (
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Fetching rate...
            </span>
          ) : price.data ? (
            <span className="text-xl font-bold text-gray-900 tabular-nums">
              {Number(price.data.tokenAmount).toFixed(6)} <span className="text-sm font-semibold text-gray-500">{token.symbol}</span>
            </span>
          ) : (
            <span className="text-sm text-red-500">Failed to fetch price</span>
          )}
        </div>

        {price.data && (
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Exchange rate</span>
            <span className="tabular-nums">1 {token.symbol} = {price.data.priceUsd.toFixed(2)} {currency}</span>
          </div>
        )}
      </div>

      {/* Wallet Balance */}
      <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Wallet balance</span>
          <div className="flex items-center gap-1.5">
            {balanceLoading ? (
              <span className="flex items-center gap-1.5 text-sm text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            ) : displayBalance != null ? (
              <span
                className={`text-sm font-semibold tabular-nums ${
                  hasSufficientBalance
                    ? 'text-emerald-600'
                    : price.data
                      ? 'text-red-500'
                      : 'text-gray-900'
                }`}
              >
                {displayBalance} {token.symbol}
              </span>
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
            <button
              onClick={handleRefreshBalance}
              disabled={isRefreshingBalance}
              className="p-1 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
              title="Refresh balance"
            >
              <RefreshCw className={`h-3 w-3 text-gray-400 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {hasSufficientBalance && price.data && (
          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Sufficient balance
          </p>
        )}
      </div>

      {/* Insufficient balance warning */}
      {price.data && !hasSufficientBalance && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-600">Insufficient balance</p>
            <p className="text-xs text-red-500 mt-0.5">
              You need {Number(price.data.tokenAmount).toFixed(6)} {token.symbol} but only have {displayBalance ?? '0'} {token.symbol}.
            </p>
          </div>
        </div>
      )}

      {/* Chain switch needed */}
      {!isSolana && !isSui ? (
        <SwitchNetworkBanner targetChainId={chain.chainId} targetChainName={chain.displayName} />
      ) : null}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onProceed}
          disabled={!hasSufficientBalance || needsSwitch || !price.data}
          className="flex-[1.4] rounded-xl bg-[#0a0a0a] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all hover:bg-[#171717] active:scale-[0.985] disabled:cursor-not-allowed disabled:bg-[#a3a3a3] disabled:shadow-none flex items-center justify-center gap-2"
        >
          Authorize Payment
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Approve Step (permit sign or ERC20 approve, then submit) ──

function ApproveStep({
  link,
  chain,
  token,
  amountUsd,
  currency,
  solanaPublicKey,
  customerEmail,
  customerName,
  billingAddress,
  billingCity,
  billingState,
  billingCountry,
  billingPostalCode,
  onBack,
  onSubmitted,
  onError,
  isSubmitting,
  setIsSubmitting,
}: {
  link: PaymentLinkData;
  chain: ChainInfo;
  token: TokenInfo;
  amountUsd: number;
  currency: string;
  solanaPublicKey: string | null;
  customerEmail: string;
  customerName?: string;
  billingAddress?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
  onBack: () => void;
  onSubmitted: (
    intentId: string,
    opts?: { captureTxHash?: string; chainType?: 'EVM' | 'SOLANA' | 'SUI'; chainId?: number },
  ) => void;
  onError: (msg: string) => void;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
}) {
  const { address } = useAccount();
  const { sendTransaction: solanaSendTransaction } = useSatelliteSolanaSend();
  const { signAndExecute: suiSignAndExecute, signTransactionBlock: suiSignTransactionBlock } =
    useSatelliteSuiSignAndExecute();
  const isSolana = chain.chainType === 'SOLANA';
  const isSui = chain.chainType === 'SUI';
  const native = isNativeToken(token.contractAddress);
  const escrowAddress = chain.escrowAddress;
  const supportsPermit = token.supportsPermit && !native && !isSolana && !isSui;

  // Subscription detection: if there's a billingInterval, this is a recurring charge.
  const isSubscription = !!link.productPlanPrice?.billingInterval;
  const isSolanaSpl = isSolana && !native;

  // Price conversion for the raw amount
  const price = usePriceConversion(token.symbol, amountUsd, token.decimals, currency);

  const suiBalance = useSuiTokenBalance(token.contractAddress, isSui);

  // Compute the approval/permit requested amount as a 6-decimal rounded-up value
  // while keeping the actual payment authorization amount exact.
  const authRequestAmount = useMemo(() => {
    if (!price.data?.rawAmount) return undefined;

    const roundedUpSixDecimals = ceilToSixDecimals(price.data.rawAmount, token.decimals);
    if (!isSubscription) return roundedUpSixDecimals;

    const interval = link.productPlanPrice!.billingInterval!;
    const intervalCount = link.productPlanPrice!.billingIntervalCount ?? 1;
    let cyclesPerYear: number;
    switch (interval.toUpperCase()) {
      case 'MINUTE': cyclesPerYear = Math.ceil(525_960 / intervalCount); break;   // ~365.25 days × 24 × 60
      case 'DAY':    cyclesPerYear = Math.ceil(365 / intervalCount); break;
      case 'WEEK':   cyclesPerYear = Math.ceil(52 / intervalCount); break;
      case 'MONTH':  cyclesPerYear = Math.ceil(12 / intervalCount); break;
      case 'YEAR':   cyclesPerYear = Math.ceil(1 / intervalCount); break;
      default:       cyclesPerYear = 12;
    }
    return roundedUpSixDecimals * BigInt(cyclesPerYear);
  }, [price.data?.rawAmount, token.decimals, isSubscription, link.productPlanPrice]);

  const splDelegationAmount = useMemo(() => {
    if (!isSolanaSpl || !price.data) return undefined;
    return isSubscription ? authRequestAmount ?? price.data.rawAmount : price.data.rawAmount;
  }, [isSolanaSpl, price.data, isSubscription, authRequestAmount]);

  const suiPoolRequiredAmount = useMemo(() => {
    if (!isSui || !price.data) return undefined;
    return isSubscription ? authRequestAmount ?? price.data.rawAmount : price.data.rawAmount;
  }, [isSui, price.data, isSubscription, authRequestAmount]);

  const suiMerchantAddress = chain.settlementAddress?.trim() || null;
  const suiEscrowObjects =
    chain.escrowAddress &&
    chain.escrowConfigObjectId &&
    chain.paymentRegistryObjectId &&
    chain.walletRegistryObjectId
      ? {
          packageId: chain.escrowAddress,
          configObjectId: chain.escrowConfigObjectId,
          registryObjectId: chain.paymentRegistryObjectId,
          walletRegistryObjectId: chain.walletRegistryObjectId,
        }
      : null;

  const [suiPoolBalance, setSuiPoolBalance] = useState<bigint | null>(null);
  const [suiPoolRemainingBudget, setSuiPoolRemainingBudget] = useState<bigint | null>(null);
  const [suiPoolMaxPerCharge, setSuiPoolMaxPerCharge] = useState<bigint | null>(null);
  const [suiWalletRuleStatus, setSuiWalletRuleStatus] = useState<number | null>(null);
  const [suiWalletFound, setSuiWalletFound] = useState(false);
  const [suiPoolRefreshing, setSuiPoolRefreshing] = useState(false);
  const [suiFundSending, setSuiFundSending] = useState(false);
  const [suiFundConfirming, setSuiFundConfirming] = useState(false);
  const [suiFundTxDigest, setSuiFundTxDigest] = useState<string | null>(null);

  const suiPeriodChargeAmount = price.data?.rawAmount;

  const suiSubscriptionWalletReady =
    isSubscription &&
    suiPeriodChargeAmount != null &&
    isSuiSubscriptionWalletReadyForCharge(
      {
        walletFound: suiWalletFound,
        ruleStatus: suiWalletRuleStatus ?? 0,
        balance: suiPoolBalance ?? 0n,
        remainingBudget: suiPoolRemainingBudget ?? 0n,
        maxPerCharge: suiPoolMaxPerCharge ?? 0n,
      },
      suiPeriodChargeAmount,
    );

  const refreshSuiPool = useCallback(async () => {
    if (
      !isSui ||
      !isSubscription ||
      !suiBalance.suiAddress ||
      !suiMerchantAddress ||
      !suiEscrowObjects
    ) {
      setSuiPoolBalance(null);
      setSuiPoolRemainingBudget(null);
      setSuiPoolMaxPerCharge(null);
      setSuiWalletRuleStatus(null);
      setSuiWalletFound(false);
      return null;
    }
    setSuiPoolRefreshing(true);
    try {
      const pool = await fetchSuiWalletSubscriptionState({
        objects: suiEscrowObjects,
        chainId: chain.chainId,
        tokenContractAddress: token.contractAddress,
        payer: suiBalance.suiAddress,
        merchant: suiMerchantAddress,
      });
      setSuiPoolBalance(pool.balance);
      setSuiPoolRemainingBudget(pool.remainingBudget);
      setSuiPoolMaxPerCharge(pool.maxPerCharge);
      setSuiWalletRuleStatus(pool.ruleStatus);
      setSuiWalletFound(pool.walletFound);
      return pool;
    } catch (err) {
      console.warn('Sui subscription wallet refresh failed', err);
      return null;
    } finally {
      setSuiPoolRefreshing(false);
    }
  }, [
    isSui,
    isSubscription,
    suiBalance.suiAddress,
    suiMerchantAddress,
    suiEscrowObjects,
    token.contractAddress,
    chain.chainId,
  ]);

  useEffect(() => {
    void refreshSuiPool();
  }, [refreshSuiPool]);

  useEffect(() => {
    if (!link.checkoutSessionId || !suiBalance.suiAddress || !suiMerchantAddress) return;
    const key = `noderails:sui-sub:${link.checkoutSessionId}:${suiBalance.suiAddress}:${suiMerchantAddress}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setSuiFundTxDigest(stored);
    }
  }, [link.checkoutSessionId, suiBalance.suiAddress, suiMerchantAddress]);

  // Native token: wagmi sendTransaction for user to send ETH to escrow
  const { sendTransactionAsync } = useSendTransaction();

  // State for native tx flow
  const [nativeTxStep, setNativeTxStep] = useState<'idle' | 'sending' | 'confirming' | 'reporting'>('idle');

  const [splAccountInfo, setSplAccountInfo] = useState<{
    delegated: bigint;
    balance: bigint;
    delegateOk: boolean;
  } | null>(null);
  const [splRefreshing, setSplRefreshing] = useState(false);
  const [splDelegateSending, setSplDelegateSending] = useState(false);
  const [splDelegateConfirming, setSplDelegateConfirming] = useState(false);

  const refreshSplDelegation = useCallback(async () => {
    if (!isSolanaSpl || !solanaPublicKey || !escrowAddress || splDelegationAmount == null) {
      setSplAccountInfo(null);
      return;
    }
    setSplRefreshing(true);
    try {
      const mint = new PublicKey(normalizeSolanaMintString(token.contractAddress));
      const owner = new PublicKey(solanaPublicKey);
      const programId = new PublicKey(escrowAddress);
      const rpc = chain.rpcUrl ?? getSolanaPublicRpcUrl(chain.chainId) ?? 'https://api.devnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const tokenProgramId = await resolveSplMintTokenProgram(conn, mint);
      if (!tokenProgramId) {
        setSplAccountInfo(null);
        return;
      }
      const ata = payerAssociatedTokenAddress(mint, owner, tokenProgramId);
      try {
        const acc = await getAccount(conn, ata, 'confirmed', tokenProgramId);
        const wantDel = escrowAuthorityPda(programId);
        const delegateOk = acc.delegate != null && acc.delegate.equals(wantDel);
        setSplAccountInfo({ delegated: acc.delegatedAmount, balance: acc.amount, delegateOk });
      } catch (e: unknown) {
        if (e instanceof TokenAccountNotFoundError) {
          setSplAccountInfo({ delegated: 0n, balance: 0n, delegateOk: false });
        } else {
          throw e;
        }
      }
    } catch {
      setSplAccountInfo(null);
    } finally {
      setSplRefreshing(false);
    }
  }, [
    isSolanaSpl,
    solanaPublicKey,
    escrowAddress,
    splDelegationAmount,
    token.contractAddress,
    chain.rpcUrl,
    chain.chainId,
  ]);

  useEffect(() => {
    void refreshSplDelegation();
  }, [refreshSplDelegation]);

  // Balance check — re-verify before submitting capture to avoid wasted gas
  const { balance: erc20Balance } = useTokenBalance(
    !isSolana && !isSui && !native ? token.contractAddress : undefined,
    chain.chainId,
    token.decimals,
  );
  const { data: nativeBalance } = useBalance({
    address,
    chainId: chain.chainId,
    query: { enabled: !!address && native && !isSolana && !isSui },
  });
  const rawBalance =
    isSui
      ? suiBalance.balance ?? 0n
      : isSolanaSpl
        ? splAccountInfo?.balance ?? 0n
        : native
          ? (nativeBalance?.value ?? 0n)
          : (erc20Balance ?? 0n);

  // Pinned amount: once a permit is signed or approval submitted, we lock
  // the rawAmount so the backend receives the exact amount the user approved.
  // This prevents a price refresh between signing and submission from causing
  // a mismatch (permit signed for amount X, but submit sends amount Y).
  const [pinnedAmount, setPinnedAmount] = useState<{
    rawAmount: bigint;
    priceUsd: number;
  } | null>(null);

  const erc20TokenAddr = !isSolana && !isSui && !native ? token.contractAddress : undefined;

  // ERC20 Allowance (for non-native, non-permit tokens)
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(erc20TokenAddr, escrowAddress, chain.chainId);

  // ERC20 Approve — for subscriptions, approve a 1-year cap so the escrow can
  // pull funds for all future billing cycles without re-approval.
  const approval = useTokenApproval(erc20TokenAddr, escrowAddress, authRequestAmount, chain.chainId);

  // Permit signing — for subscriptions, sign the 1-year capped amount so the
  // permit sets an allowance covering all charges within a year.
  const permit = usePermitSign(
    supportsPermit ? erc20TokenAddr : undefined,
    supportsPermit ? token.name : undefined,
    escrowAddress,
    authRequestAmount,
    chain.chainId,
    token.permitVersion ?? undefined,
  );

  // Pin the amount when permit is signed successfully
  useEffect(() => {
    if (permit.isReady && price.data && !pinnedAmount) {
      setPinnedAmount({
        rawAmount: price.data.rawAmount,
        priceUsd: price.data.priceUsd,
      });
    }
  }, [permit.isReady, price.data, pinnedAmount]);

  // Check if allowance is already sufficient
  const hasAllowance =
    native || (allowance !== undefined && price.data && allowance >= price.data.rawAmount);

  // Determine authorization method
  const authMethod: 'NATIVE' | 'PERMIT' = native
    ? 'NATIVE'
    : supportsPermit
      ? 'PERMIT'
      : 'NATIVE';

  // Is approved (allowance, permit, native wallet connect, or SPL delegate)
  // Note: splDelegateConfirming must be false - we wait for on-chain confirmation
  const isApprovedOrSigned =
    (isSui &&
      !!suiBalance.suiAddress &&
      !!price.data &&
      rawBalance >= price.data.rawAmount &&
      (!isSubscription ||
        (!suiFundConfirming &&
          !suiFundSending &&
          suiSubscriptionWalletReady &&
          !!suiEscrowObjects &&
          !!suiMerchantAddress))) ||
    (isSolana && native && !!solanaPublicKey) ||
    (isSolanaSpl &&
      !!solanaPublicKey &&
      !!splAccountInfo &&
      !splDelegateConfirming &&
      splAccountInfo.delegateOk &&
      splDelegationAmount != null &&
      splAccountInfo.delegated >= splDelegationAmount &&
      !!price.data &&
      splAccountInfo.balance >= price.data.rawAmount) ||
    (!isSolana && !isSui && (native || (authMethod === 'PERMIT' ? permit.isReady : hasAllowance)));

  const handleSplDelegate = useCallback(async () => {
    if (!isSolanaSpl || !solanaPublicKey || !escrowAddress || splDelegationAmount == null || !price.data) {
      return;
    }
    setSplDelegateSending(true);
    try {
      const mint = new PublicKey(normalizeSolanaMintString(token.contractAddress));
      const owner = new PublicKey(solanaPublicKey);
      const programId = new PublicKey(escrowAddress);
      const rpc = chain.rpcUrl ?? getSolanaPublicRpcUrl(chain.chainId) ?? 'https://api.devnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const tokenProgramId = await resolveSplMintTokenProgram(conn, mint);
      if (!tokenProgramId) {
        throw new Error('Unsupported or unknown SPL mint');
      }
      const ata = payerAssociatedTokenAddress(mint, owner, tokenProgramId);
      const delegate = escrowAuthorityPda(programId);
      const ix = createApproveInstruction(ata, delegate, owner, splDelegationAmount, [], tokenProgramId);
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
      tx.feePayer = owner;
      if (!solanaSendTransaction) {
        throw new Error('Connect a Solana wallet that can sign transactions');
      }
      const signature = await solanaSendTransaction(tx, conn, { skipPreflight: false });
      
      // Wait for transaction confirmation
      setSplDelegateSending(false);
      setSplDelegateConfirming(true);
      
      await conn.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      // Refresh delegation status after confirmation
      await refreshSplDelegation();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setSplDelegateSending(false);
      setSplDelegateConfirming(false);
    }
  }, [
    isSolanaSpl,
    solanaPublicKey,
    escrowAddress,
    splDelegationAmount,
    token.contractAddress,
    chain.rpcUrl,
    chain.chainId,
    price.data,
    refreshSplDelegation,
    onError,
    solanaSendTransaction,
  ]);

  const handleSuiFundPool = useCallback(async () => {
    if (
      !isSui ||
      !isSubscription ||
      !suiBalance.suiAddress ||
      !suiMerchantAddress ||
      !suiEscrowObjects ||
      suiPoolRequiredAmount == null ||
      !price.data
    ) {
      return;
    }
    if (rawBalance < suiPoolRequiredAmount) {
      onError(`Insufficient ${token.symbol} balance to fund NodeRailsWallet`);
      return;
    }
    setSuiFundSending(true);
    setSuiFundConfirming(false);
    try {
      const digest = await executeSuiWalletSetup({
        checkoutSessionId: link.checkoutSessionId,
        chainId: chain.chainId,
        objects: suiEscrowObjects,
        tokenContractAddress: token.contractAddress,
        merchantAddress: suiMerchantAddress,
        remainingBudget: suiPoolRequiredAmount,
        maxPerCharge: price.data.rawAmount,
        expiresAtMs: BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000),
        payerAddress: suiBalance.suiAddress,
        signTransactionBlock: suiSignTransactionBlock,
      });
      setSuiFundTxDigest(digest);
      setSuiFundSending(false);
      setSuiFundConfirming(true);
      const pool = await waitForSuiSubscriptionWallet({
        objects: suiEscrowObjects,
        chainId: chain.chainId,
        tokenContractAddress: token.contractAddress,
        payer: suiBalance.suiAddress,
        merchant: suiMerchantAddress,
        minRemainingBudget: suiPoolRequiredAmount,
        digest,
      });
      setSuiPoolBalance(pool.balance);
      setSuiPoolRemainingBudget(pool.remainingBudget);
      setSuiPoolMaxPerCharge(pool.maxPerCharge);
      setSuiWalletRuleStatus(pool.ruleStatus);
      setSuiWalletFound(true);
      if (link.checkoutSessionId && suiBalance.suiAddress && suiMerchantAddress) {
        sessionStorage.setItem(
          `noderails:sui-sub:${link.checkoutSessionId}:${suiBalance.suiAddress}:${suiMerchantAddress}`,
          digest,
        );
      }
    } catch (err) {
      const recovered = await refreshSuiPool();
      if (
        recovered &&
        suiPeriodChargeAmount != null &&
        isSuiSubscriptionWalletReadyForCharge(recovered, suiPeriodChargeAmount)
      ) {
        setSuiPoolBalance(recovered.balance);
        setSuiPoolRemainingBudget(recovered.remainingBudget);
        setSuiPoolMaxPerCharge(recovered.maxPerCharge);
        setSuiWalletRuleStatus(recovered.ruleStatus);
        setSuiWalletFound(recovered.walletFound);
        return;
      }
      setSuiFundTxDigest(null);
      onError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setSuiFundSending(false);
      setSuiFundConfirming(false);
    }
  }, [
    isSui,
    isSubscription,
    suiBalance.suiAddress,
    suiMerchantAddress,
    suiEscrowObjects,
    suiPoolRequiredAmount,
    price.data,
    rawBalance,
    token.symbol,
    token.contractAddress,
    link.checkoutSessionId,
    chain.chainId,
    suiSignTransactionBlock,
    onError,
    refreshSuiPool,
    suiPeriodChargeAmount,
    link.checkoutSessionId,
  ]);

  // Handler: submit authorization to server
  const handleSubmit = useCallback(async () => {
    const wallet = isSolana ? solanaPublicKey : isSui ? suiBalance.suiAddress : address;
    if (!wallet || !price.data || isSubmitting) return;

    // Use pinned amount for permit flow (matches the signed permit value),
    // or fall back to latest price for approval/native flows.
    const submitRawAmount = (authMethod === 'PERMIT' && pinnedAmount)
      ? pinnedAmount.rawAmount
      : price.data.rawAmount;

    // Re-check balance before submitting to avoid wasted gas on a revert
    if (isSolanaSpl && (!splAccountInfo || splAccountInfo.balance < submitRawAmount)) {
      onError(`Insufficient ${token.symbol} balance`);
      return;
    }
    if (
      isSolanaSpl &&
      (!splAccountInfo ||
        !splAccountInfo.delegateOk ||
        splDelegationAmount == null ||
        splAccountInfo.delegated < splDelegationAmount)
    ) {
      onError('Token delegation to NodeRails is incomplete. Approve delegation first.');
      return;
    }

    if (!isSolana && !isSui && rawBalance < submitRawAmount) {
      onError(`Insufficient ${token.symbol} balance`);
      return;
    }

    if (isSui && isSubscription) {
      if (!suiEscrowObjects || !suiMerchantAddress || !suiBalance.suiAddress) {
        onError('Sui subscription wallet is not configured for this checkout.');
        return;
      }
      let pool: Awaited<ReturnType<typeof fetchSuiWalletSubscriptionState>>;
      try {
        pool = await fetchSuiWalletSubscriptionState({
          objects: suiEscrowObjects,
          chainId: chain.chainId,
          tokenContractAddress: token.contractAddress,
          payer: suiBalance.suiAddress,
          merchant: suiMerchantAddress,
        });
      } catch (err) {
        onError(
          err instanceof Error
            ? `Could not read subscription wallet: ${err.message}`
            : 'Could not read subscription wallet state',
        );
        return;
      }
      setSuiPoolBalance(pool.balance);
      setSuiPoolRemainingBudget(pool.remainingBudget);
      setSuiPoolMaxPerCharge(pool.maxPerCharge);
      setSuiWalletRuleStatus(pool.ruleStatus);
      setSuiWalletFound(pool.walletFound);
      if (!isSuiSubscriptionWalletReadyForCharge(pool, submitRawAmount)) {
        onError(describeSuiSubscriptionWalletBlocker(pool, submitRawAmount));
        return;
      }
    }

    if (isSui && rawBalance < submitRawAmount) {
      onError(`Insufficient ${token.symbol} balance`);
      return;
    }

    const submitPriceUsd = (authMethod === 'PERMIT' && pinnedAmount)
      ? pinnedAmount.priceUsd
      : price.data.priceUsd;

    setIsSubmitting(true);
    track('checkout_authorization_submitted', {
      checkout_session_id: link.checkoutSessionId,
      chain_id: chain.chainId,
      token_key: token.tokenKey,
      auth_method: authMethod,
      is_subscription: isSubscription,
    });
    try {
      const input: AuthorizePaymentInput = {
        checkoutSessionId: link.checkoutSessionId,
        walletAddress: wallet,
        chainId: chain.chainId,
        tokenKey: token.tokenKey,
        authorizationMethod: authMethod,
        cryptoAmount: submitRawAmount.toString(),
        exchangeRate: submitPriceUsd.toString(),
        customerEmail,
      };

      if (customerName) input.customerName = customerName;
      if (billingAddress) input.billingAddress = billingAddress;
      if (billingCity) input.billingCity = billingCity;
      if (billingState) input.billingState = billingState;
      if (billingCountry) input.billingCountry = billingCountry;
      if (billingPostalCode) input.billingPostalCode = billingPostalCode;

      if (authMethod === 'PERMIT' && permit.signature) {
        input.permitSignature = {
          ...permit.signature,
          // The amount the user signed in the permit (1-year cap for subs, exact for one-time)
          amount: (authRequestAmount ?? submitRawAmount).toString(),
        };
      }

      if (!native && authMethod === 'NATIVE' && approval.txHash) {
        input.approvalTxHash = approval.txHash;
      }

      if (isSui && isSubscription && suiFundTxDigest) {
        input.approvalTxHash = suiFundTxDigest;
      }

      const result = await authorizePayment(input);

      if (
        result.captureData &&
        'chainType' in result.captureData &&
        result.captureData.chainType === 'SUI'
      ) {
        setNativeTxStep('sending');
        const captureData = result.captureData as SuiServerCaptureData;
        const digest = await executeSuiCapture({
          captureData,
          intentId: result.intentId,
          chainId: chain.chainId,
          payerAddress: wallet,
          signAndExecute: suiSignAndExecute,
          signTransactionBlock: suiSignTransactionBlock,
        });
        setNativeTxStep('reporting');
        if (!captureData.sponsored) {
          await reportNativeCapture(result.intentId, digest);
        }
        setNativeTxStep('idle');
        onSubmitted(result.intentId, {
          captureTxHash: digest,
          chainType: 'SUI',
          chainId: chain.chainId,
        });
        return;
      }

      if (
        result.captureData &&
        'instruction' in result.captureData &&
        result.captureData.chainType === 'SOLANA'
      ) {
        setNativeTxStep('sending');
        const { Connection, Transaction, TransactionInstruction, PublicKey } = await import(
          '@solana/web3.js'
        );
        const ins = result.captureData.instruction;
        const pre = result.captureData.preInstructions ?? [];
        const wireIxs = [...pre, ins];
        const ixs = wireIxs.map(
          (w) =>
            new TransactionInstruction({
              programId: new PublicKey(w.programId),
              keys: w.keys.map((k) => ({
                pubkey: new PublicKey(k.pubkey),
                isSigner: k.isSigner,
                isWritable: k.isWritable,
              })),
              data: Buffer.from(w.data, 'base64'),
            }),
        );
        const rpc = chain.rpcUrl ?? getSolanaPublicRpcUrl(chain.chainId) ?? 'https://api.devnet.solana.com';
        const conn = new Connection(rpc, 'confirmed');
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: SOLANA_NATIVE_CAPTURE_CU_LIMIT }),
          ...ixs,
        );
        const { blockhash } = await conn.getLatestBlockhash('finalized');
        tx.recentBlockhash = blockhash;
        tx.feePayer = new PublicKey(wallet);
        if (!solanaSendTransaction) {
          throw new Error('Connect a Solana wallet that can sign transactions');
        }
        const signature = await solanaSendTransaction(tx, conn, { skipPreflight: false });
        if (!signature) {
          throw new Error('Wallet did not return a transaction signature');
        }
        setNativeTxStep('reporting');
        await reportNativeCapture(result.intentId, signature);
        setNativeTxStep('idle');
        onSubmitted(result.intentId, {
          captureTxHash: signature,
          chainType: 'SOLANA',
          chainId: chain.chainId,
        });
        return;
      }

      if (result.captureData && 'to' in result.captureData) {
        // Step 1: Ask user to sign and send the transaction (EVM)
        setNativeTxStep('sending');
        track('checkout_native_capture_prompted', {
          chain_id: chain.chainId,
          token_key: token.tokenKey,
        });
        const txHash = await sendTransactionAsync({
          to: result.captureData.to as `0x${string}`,
          data: result.captureData.data as `0x${string}`,
          value: BigInt(result.captureData.value),
          chainId: result.captureData.chainId,
        });

        // Step 2: Report the tx hash to the server
        setNativeTxStep('reporting');
        await reportNativeCapture(result.intentId, txHash);
        track('checkout_native_capture_reported', {
          intent_id: result.intentId,
          chain_id: chain.chainId,
          token_key: token.tokenKey,
        });

        // Step 3: Done — start polling
        setNativeTxStep('idle');
        onSubmitted(result.intentId, {
          captureTxHash: txHash,
          chainType: 'EVM',
          chainId: result.captureData.chainId,
        });
        return;
      }

      if (result.captureData) {
        throw new Error('Unsupported capture payload');
      }

      // ERC20: server already submitted the tx via MTXM
      onSubmitted(result.intentId);
    } catch (err) {
      setNativeTxStep('idle');
      track('checkout_authorization_failed', {
        checkout_session_id: link.checkoutSessionId,
        chain_id: chain.chainId,
        token_key: token.tokenKey,
        auth_method: authMethod,
        error_message: err instanceof Error ? err.message : 'Authorization failed',
      });
      onError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    address,
    solanaPublicKey,
    isSolana,
    isSui,
    isSolanaSpl,
    splAccountInfo,
    splDelegationAmount,
    price.data,
    isSubmitting,
    link.checkoutSessionId,
    chain.chainId,
    chain.rpcUrl,
    token.tokenKey,
    token.symbol,
    authMethod,
    pinnedAmount,
    rawBalance,
    permit.signature,
    native,
    approval.txHash,
    authRequestAmount,
    sendTransactionAsync,
    suiBalance.suiAddress,
    suiSignAndExecute,
    onSubmitted,
    onError,
    setIsSubmitting,
    customerEmail,
    customerName,
    billingAddress,
    billingCity,
    billingState,
    billingCountry,
    billingPostalCode,
    isSubscription,
    solanaSendTransaction,
    suiFundTxDigest,
    suiEscrowObjects,
    suiMerchantAddress,
    token.contractAddress,
  ]);

  // Auto-submit when native token (no approval needed)
  // For ERC20: auto-submit once approved or permit signed
  const shouldAutoSubmit = isApprovedOrSigned && price.data && !isSubmitting;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-slate-900">Authorize payment</h3>

      {/* Price Info */}
      {price.data && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Amount</span>
            <span className="text-sm font-bold text-gray-900 tabular-nums">
              {Number(price.data.tokenAmount).toFixed(6)} {token.symbol}
            </span>
          </div>
        </div>
      )}

      {/* Step 1: Authorize payment (for ERC20 only) */}
      {!native && !isSolana && !isSui && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                (supportsPermit ? permit.isReady : hasAllowance)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-900 text-white'
              }`}
            >
              {(supportsPermit ? permit.isReady : hasAllowance) ? <Check className="h-3 w-3" /> : '1'}
            </div>
            <span className="text-sm font-medium text-gray-900">Authorize payment</span>
          </div>
          <p className="text-xs text-gray-500">
            Allow NodeRails to securely charge your wallet for this payment.
          </p>

          {supportsPermit ? (
            <>
              {!permit.isReady && (
                <button
                  onClick={permit.signPermit}
                  disabled={permit.isPending || !price.data}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {permit.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirm in wallet...
                    </>
                  ) : (
                    'Authorize'
                  )}
                </button>
              )}

              {permit.isReady && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Authorized
                </div>
              )}

              {permit.error && (
                <p className="text-xs text-red-500">{permit.error.message}</p>
              )}
            </>
          ) : (
            <>
              {!hasAllowance && (
                <button
                  onClick={() => approval.approve()}
                  disabled={approval.isPending || approval.isConfirming || !price.data}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {approval.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirm in wallet...
                    </>
                  ) : approval.isConfirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Authorize'
                  )}
                </button>
              )}

              {hasAllowance && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Authorized
                </div>
              )}

              {approval.isConfirmed && !hasAllowance && (
                <button
                  onClick={() => refetchAllowance()}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              )}

              {approval.error && (
                <p className="text-xs text-red-500">{approval.error.message}</p>
              )}
            </>
          )}
        </div>
      )}

      {isSolanaSpl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                splAccountInfo &&
                splDelegationAmount != null &&
                splAccountInfo.delegateOk &&
                splAccountInfo.delegated >= splDelegationAmount
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-900 text-white'
              }`}
            >
              {splAccountInfo &&
              splDelegationAmount != null &&
              splAccountInfo.delegateOk &&
              splAccountInfo.delegated >= splDelegationAmount ? (
                <Check className="h-3 w-3" />
              ) : (
                '1'
              )}
            </div>
            <span className="text-sm font-medium text-gray-900">Authorize payment</span>
          </div>
          <p className="text-xs text-gray-500">
            Allow NodeRails to securely charge your wallet for this payment.
          </p>
          {!splAccountInfo && !splRefreshing && (
            <p className="text-xs text-amber-600">
              No {token.symbol} found. Please fund your wallet first.
            </p>
          )}
          {splAccountInfo &&
            (splDelegationAmount == null ||
              !splAccountInfo.delegateOk ||
              splAccountInfo.delegated < splDelegationAmount) &&
            !splDelegateConfirming && (
              <button
                type="button"
                onClick={() => void handleSplDelegate()}
                disabled={splDelegateSending || splDelegationAmount == null || !price.data || splRefreshing}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {splDelegateSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm in wallet...
                  </>
                ) : (
                  'Authorize'
                )}
              </button>
            )}
          {splDelegateConfirming && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming on-chain...
            </div>
          )}
          {splAccountInfo &&
            splDelegationAmount != null &&
            splAccountInfo.delegateOk &&
            splAccountInfo.delegated >= splDelegationAmount &&
            !splDelegateConfirming && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Authorized
              </div>
            )}
          <button
            type="button"
            onClick={() => void refreshSplDelegation()}
            disabled={splRefreshing || splDelegateConfirming}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${splRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {isSui && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                isApprovedOrSigned && !!suiBalance.suiAddress
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-900 text-white'
              }`}
            >
              {isApprovedOrSigned && !!suiBalance.suiAddress ? (
                <Check className="h-3 w-3" />
              ) : (
                '1'
              )}
            </div>
            <span className="text-sm font-medium text-gray-900">Authorize payment</span>
          </div>
          <p className="text-xs text-gray-500">
            {isSubscription
              ? 'Fund your subscription wallet so we can charge for renewals.'
              : 'Connect your Sui wallet with enough balance. You will confirm the payment in your wallet on the next step.'}
          </p>
          {!suiBalance.suiAddress && (
            <p className="text-xs text-amber-600">Connect a Sui wallet to continue.</p>
          )}
          {isSubscription && !suiMerchantAddress && (
            <p className="text-xs text-amber-600">
              Merchant settlement address is not configured for Sui on this app.
            </p>
          )}
          {isSubscription && !suiEscrowObjects && (
            <p className="text-xs text-amber-600">
              Sui escrow registry is not configured on this chain. Contact the merchant.
            </p>
          )}
          {isSubscription &&
            suiWalletFound &&
            (suiPoolBalance ?? 0n) > 0n &&
            !suiSubscriptionWalletReady &&
            !suiFundConfirming &&
            !suiFundSending && (
              <p className="text-xs text-amber-600">
                NodeRailsWallet has funds but is not authorized for this charge. Click Authorize again,
                or Refresh wallet status if you already approved.
              </p>
            )}
          {isSubscription &&
            suiPoolRequiredAmount != null &&
            !suiSubscriptionWalletReady &&
            !suiFundConfirming &&
            !suiFundSending && (
              <button
                type="button"
                onClick={() => void handleSuiFundPool()}
                disabled={
                  suiFundSending ||
                  !suiBalance.suiAddress ||
                  !suiMerchantAddress ||
                  !suiEscrowObjects ||
                  !price.data ||
                  suiPoolRefreshing
                }
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {suiFundSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirm in wallet...
                  </>
                ) : (
                  'Authorize'
                )}
              </button>
            )}
          {isSubscription && suiFundConfirming && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Confirming on-chain...
            </div>
          )}
          {isSubscription && suiSubscriptionWalletReady && !suiFundConfirming && !suiFundSending && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Subscription wallet ready
              </div>
            )}
          {!isSubscription && suiBalance.suiAddress && price.data && rawBalance >= price.data.rawAmount && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Wallet ready. {Number(formatUnits(rawBalance, token.decimals)).toFixed(4)} {token.symbol} available
              </div>
              <p className="text-xs text-gray-500">
                Click Complete payment below. Your wallet will prompt you to confirm the transaction.
              </p>
            </div>
          )}
          {isSubscription && (
            <button
              type="button"
              onClick={() => void refreshSuiPool()}
              disabled={suiPoolRefreshing || suiFundConfirming}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${suiPoolRefreshing ? 'animate-spin' : ''}`} />
              Refresh wallet status
            </button>
          )}
        </div>
      )}

      {/* Step 2: Submit authorization */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              isSubmitting
                ? 'bg-[#635bff] text-white'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {native && !isSolanaSpl && !isSui ? '1' : '2'}
          </div>
          <span className="text-xs font-medium text-gray-900">
            {native && !isSolanaSpl && !isSui ? 'Submit payment' : 'Complete payment'}
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isApprovedOrSigned || isSubmitting || !price.data}
          className="w-full rounded-lg bg-[#635bff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5851ea] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {native && nativeTxStep === 'sending'
                ? 'Confirm in wallet...'
                : native && nativeTxStep === 'reporting'
                  ? 'Finalizing...'
                  : 'Submitting...'}
            </>
          ) : (
            <>
              Pay {price.data ? `${Number(price.data.tokenAmount).toFixed(6)} ${token.symbol}` : '...'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        disabled={isSubmitting}
        className="w-full rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Back to review
      </button>
    </div>
  );
}

// ── Processing Step (polling intent status) ──

function ProcessingStep({
  intentId,
  sessionId,
  successUrl,
  pendingTx,
  onSuccess,
  onError,
}: {
  intentId: string;
  sessionId: string;
  successUrl?: string | null;
  pendingTx: { hash: string; chainType: 'EVM' | 'SOLANA' | 'SUI'; chainId: number } | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const { status } = useIntentStatusPolling(intentId);

  useEffect(() => {
    if (!status) return;
    if (status === 'CAPTURED' || status === 'SETTLED') {
      track('checkout_capture_succeeded', { intent_id: intentId, status });
      notifyParentFrame('noderails:checkout-complete', { sessionId, intentId, status });
      return;
    }

    const failureStatuses = ['FAILED', 'EXPIRED', 'CANCELLED', 'CAPTURE_FAILED', 'PAST_DUE'];
    if (failureStatuses.includes(status)) {
      track('checkout_capture_failed', { intent_id: intentId, status });
      notifyParentFrame('noderails:checkout-failed', { sessionId, intentId, status });
    }
  }, [status, intentId, sessionId]);

  // Detect terminal states
  if (status === 'CAPTURED' || status === 'SETTLED') {
    // Redirect if successUrl is set, otherwise show success
    if (successUrl) {
      window.location.href = successUrl;
    } else {
      // Trigger success step
      setTimeout(onSuccess, 500);
    }
  }

  const failureStatuses = ['FAILED', 'EXPIRED', 'CANCELLED', 'CAPTURE_FAILED', 'PAST_DUE'];
  if (status && failureStatuses.includes(status)) {
    setTimeout(() => onError('Payment error. Please try again later.'), 500);
  }

  const explorerUrl =
    pendingTx?.hash != null && pendingTx.chainId != null
      ? blockExplorerTxUrl(pendingTx.chainId, pendingTx.hash) ?? undefined
      : undefined;

  return (
    <div className="text-center space-y-6 py-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-slate-900" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Processing payment</h3>
        <p className="mt-2 text-sm text-slate-500">
          Your payment is being captured on-chain. This may take a moment.
        </p>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:underline"
          >
            View transaction <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Success Step ──

function SuccessStep({
  successUrl,
  merchantName,
}: {
  successUrl?: string | null;
  merchantName: string;
}) {
  return (
    <div className="text-center space-y-6 py-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-900">Payment successful!</h3>
        <p className="mt-2 text-sm text-slate-500">
          Your payment to {merchantName} has been confirmed.
        </p>
      </div>
      {successUrl && (
        <a
          href={successUrl}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-all"
        >
          Continue <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// ── Error Step ──

function ErrorStep({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="text-center space-y-6 py-8">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <XCircle className="h-10 w-10 text-red-500" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-slate-900">Payment failed</h3>
        <p className="mt-2 text-sm text-slate-500">
          {message ?? 'An unexpected error occurred.'}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}

// ── Sub-components ──

/** Chain icon — renders iconUrl if available, otherwise a colored circle with initials */
function ChainIcon({ chain }: { chain: ChainInfo }) {
  if (chain.iconUrl) {
    return (
      <img
        src={chain.iconUrl}
        alt={chain.displayName}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  const colors = ['#635bff', '#0abf53', '#f2ae00', '#00d4ff', '#db2777', '#ea580c'];
  const colorIndex = chain.chainId % colors.length;

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold"
      style={{ backgroundColor: colors[colorIndex] }}
    >
      {chain.displayName.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Token icon — renders iconUrl if available, otherwise a pill with symbol */
function TokenIcon({ token }: { token: TokenInfo }) {
  if (token.iconUrl) {
    return (
      <img
        src={token.iconUrl}
        alt={token.symbol}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  const colors = ['#635bff', '#0abf53', '#f2ae00', '#00d4ff', '#db2777', '#ea580c'];
  const idx = token.symbol.charCodeAt(0) % colors.length;

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full text-white text-[10px] font-bold"
      style={{ backgroundColor: colors[idx] }}
    >
      {token.symbol.slice(0, 3)}
    </div>
  );
}
