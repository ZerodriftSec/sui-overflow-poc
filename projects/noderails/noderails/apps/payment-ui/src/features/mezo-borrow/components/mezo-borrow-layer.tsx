'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { blockExplorerTxUrl } from '@noderails/common';
import { track } from '@/lib/analytics';
import { useChainSwitch } from '@/lib/checkout-hooks';
import {
  MEZO_BORROW_CHAIN_ID,
  MEZO_BORROW_EXPLORER_URL,
} from '../config';
import { fetchMezoBorrowSession } from '../lib/borrow-quote';
import { useOpenTrove } from '../lib/open-trove';
import { MezoBorrowQuotePanel } from './mezo-borrow-quote-panel';
import type { MezoBorrowLayerProps } from '../hooks/use-mezo-borrow-proceed';
import type { MezoBorrowModalStep, MezoBorrowQuote, MezoBorrowSession } from '../types';

export function MezoBorrowLayer(props: MezoBorrowLayerProps | null) {
  if (!props?.open) {
    return null;
  }
  return <MezoBorrowModal {...props} />;
}

function MezoBorrowModal({
  amountUsd,
  selectedChain,
  musdTokenKey,
  onClose,
  onBorrowSuccess,
  onDecline,
}: MezoBorrowLayerProps) {
  const { switchToTarget, isPending: isSwitching } = useChainSwitch(MEZO_BORROW_CHAIN_ID);

  const { address, isConnected } = useAccount();

  const { data: nativeBalance } = useBalance({
    address,
    chainId: MEZO_BORROW_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const [step, setStep] = useState<MezoBorrowModalStep>('offer');
  const [session, setSession] = useState<MezoBorrowSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const {
    openTrove,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError,
  } = useOpenTrove();

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const result = await fetchMezoBorrowSession({
        amountUsd,
        nativeBalanceWei: nativeBalance?.value,
      });
      setSession(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load borrow quote';
      setSessionError(message);
    } finally {
      setSessionLoading(false);
    }
  }, [amountUsd, nativeBalance?.value]);

  useEffect(() => {
    if (step !== 'quote' || session || sessionLoading || sessionError) {
      return;
    }
    void loadSession();
  }, [step, session, sessionLoading, sessionError, loadSession]);

  useEffect(() => {
    if (isPending || isConfirming) {
      setStep('confirming');
    }
  }, [isPending, isConfirming]);

  useEffect(() => {
    if (isSuccess && musdTokenKey) {
      setStep('success');
      const timer = window.setTimeout(() => {
        onBorrowSuccess(musdTokenKey);
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [isSuccess, musdTokenKey, onBorrowSuccess]);

  useEffect(() => {
    if (writeError) {
      setTxError(writeError.message);
    }
  }, [writeError]);

  const handleAcceptOffer = () => {
    track('mezo_borrow_accepted', { amount_usd: amountUsd });
    setStep('quote');
  };

  const handleConfirmBorrow = async (quote: MezoBorrowQuote) => {
    if (!quote.canBorrow) {
      return;
    }
    if (!isConnected) {
      setTxError('Connect your wallet to continue.');
      return;
    }

    setTxError(null);
    try {
      switchToTarget();
      await openTrove(quote.borrowAmountMusd, quote.collateralBtc);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setTxError(message);
      setStep('quote');
    }
  };

  const explorerUrl =
    txHash != null
      ? blockExplorerTxUrl(MEZO_BORROW_CHAIN_ID, txHash, {
          [MEZO_BORROW_CHAIN_ID]: {
            chainId: MEZO_BORROW_CHAIN_ID,
            name: 'mezo-testnet',
            displayName: 'Mezo Testnet',
            nativeCurrencySymbol: selectedChain.nativeCurrencySymbol,
            explorerUrl: MEZO_BORROW_EXPLORER_URL,
            isTestnet: true,
            chainType: 'EVM',
            sources: ['static'],
          },
        })
      : null;

  const borrowDisabled = !musdTokenKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 z-10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {step === 'offer' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#e84142]">
                Mezo Borrow &amp; Pay
              </p>
              <h2 className="mt-2 text-xl font-bold text-gray-900">
                Keep your Bitcoin, borrow MUSD to pay
              </h2>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Open a Mezo trove with native BTC as collateral and mint MUSD for this checkout.
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
              Powered by{' '}
              <a
                href="https://testnet.mezo.org/borrow"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline inline-flex items-center gap-1 text-gray-900"
              >
                Mezo
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {borrowDisabled && (
              <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                MUSD is not enabled on this payment link.
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={borrowDisabled}
                onClick={handleAcceptOffer}
                className="w-full rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Check borrowing power
              </button>
              <button
                type="button"
                onClick={onDecline}
                className="w-full rounded-full border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Pay with {selectedChain.nativeCurrencySymbol} instead
              </button>
            </div>
          </div>
        )}

        {step === 'quote' && sessionLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading borrow details…
          </div>
        )}

        {step === 'quote' && sessionError && (
          <div className="space-y-3 py-8">
            <p className="text-sm text-red-600">{sessionError}</p>
            <button
              type="button"
              onClick={() => void loadSession()}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {step === 'quote' && session && !sessionLoading && (
          <MezoBorrowQuotePanel
            session={session}
            nativeSymbol={selectedChain.nativeCurrencySymbol}
            txError={txError}
            isSwitching={isSwitching}
            onConfirm={(quote) => void handleConfirmBorrow(quote)}
            onDecline={onDecline}
          />
        )}

        {step === 'confirming' && (
          <div className="space-y-4 py-4 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-gray-900" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Opening trove…</h2>
              <p className="mt-1 text-sm text-gray-500">Confirm the transaction in your wallet.</p>
            </div>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
              >
                View on explorer
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-3 py-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <span className="text-2xl">✓</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">MUSD borrowed</h2>
            <p className="text-sm text-gray-500">Continuing to payment review with MUSD…</p>
          </div>
        )}
      </div>
    </div>
  );
}
