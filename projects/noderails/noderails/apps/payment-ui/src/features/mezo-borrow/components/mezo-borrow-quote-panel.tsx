'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { formatUnits } from 'viem';
import {
  buildQuoteFromCollateral,
  MEZO_MAX_CR_PERCENT,
} from '../lib/calc-collateral';
import { readBorrowingFee } from '../lib/mezo-public-client';
import type { MezoBorrowDisplayUnit, MezoBorrowQuote, MezoBorrowSession } from '../types';

function formatMusd(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBtcHuman(amount: bigint): string {
  return Number(formatUnits(amount, 18)).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function btcToNumber(wei: bigint): number {
  return Number(formatUnits(wei, 18));
}

function numberToBtcWei(value: number): bigint {
  return BigInt(Math.round(Math.max(value, 0) * 1e18));
}

interface MezoBorrowQuotePanelProps {
  session: MezoBorrowSession;
  nativeSymbol: string;
  txError: string | null;
  isSwitching: boolean;
  onConfirm: (quote: MezoBorrowQuote) => void;
  onDecline: () => void;
}

export function MezoBorrowQuotePanel({
  session,
  nativeSymbol,
  txError,
  isSwitching,
  onConfirm,
  onDecline,
}: MezoBorrowQuotePanelProps) {
  const [displayUnit, setDisplayUnit] = useState<MezoBorrowDisplayUnit>('BTC');
  const [collateralBtc, setCollateralBtc] = useState(session.initialCollateralBtc);
  const [collateralRatioPercent, setCollateralRatioPercent] = useState(
    session.initialCollateralRatioPercent,
  );
  const [referenceBorrow, setReferenceBorrow] = useState(
    session.paymentAmountMusd > session.minNetDebt
      ? session.paymentAmountMusd
      : session.minNetDebt,
  );
  const [referenceFee, setReferenceFee] = useState<bigint | null>(null);
  const [feeLoading, setFeeLoading] = useState(true);

  const maxCollateralWei = session.nativeBalanceWei ?? session.initialCollateralBtc * 2n;
  const minCollateralWei = useMemo(
    () => numberToBtcWei(Math.max(btcToNumber(session.initialCollateralBtc) * 0.4, 0.001)),
    [session.initialCollateralBtc],
  );

  const collateralMin = Math.max(btcToNumber(minCollateralWei), 0.001);
  const collateralMax = Math.max(btcToNumber(maxCollateralWei), collateralMin + 0.001);

  useEffect(() => {
    let cancelled = false;
    setFeeLoading(true);
    readBorrowingFee(referenceBorrow)
      .then((fee) => {
        if (!cancelled) {
          setReferenceFee(fee);
          setFeeLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReferenceFee(0n);
          setFeeLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [referenceBorrow]);

  const quote = useMemo(() => {
    if (referenceFee == null) {
      return null;
    }
    return buildQuoteFromCollateral({
      collateralBtc,
      collateralRatioPercent,
      btcPriceUsd: session.btcPriceUsd,
      minNetDebt: session.minNetDebt,
      gasCompensation: session.gasCompensation,
      referenceBorrow,
      referenceFee,
      mcrPercent: session.mcrPercent,
      paymentAmountMusd: session.paymentAmountMusd,
      nativeBalanceWei: session.nativeBalanceWei,
      warnings: session.warnings,
    });
  }, [
    collateralBtc,
    collateralRatioPercent,
    referenceBorrow,
    referenceFee,
    session,
  ]);

  useEffect(() => {
    if (!quote || feeLoading) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (quote.borrowAmountMusd > 0n && quote.borrowAmountMusd !== referenceBorrow) {
        setReferenceBorrow(quote.borrowAmountMusd);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [quote, referenceBorrow, feeLoading]);

  const onCollateralSlider = useCallback(
    (value: number) => {
      setCollateralBtc(numberToBtcWei(value));
    },
    [],
  );

  const onCrSlider = useCallback((value: number) => {
    setCollateralRatioPercent(Math.round(value));
  }, []);

  const collateralDisplay =
    displayUnit === 'BTC'
      ? `${formatBtcHuman(collateralBtc)} ${nativeSymbol}`
      : `$${formatUsd(btcToNumber(collateralBtc) * session.btcPriceUsd)}`;

  const minDebtFormatted = formatMusd(session.minNetDebt);

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#e84142]">
          Mezo Borrow &amp; Pay
        </p>
        <h2 className="text-xl font-bold text-gray-900 leading-snug">
          Check your <span className="text-[#e84142]">borrowing</span> power
        </h2>
        <p className="text-sm text-gray-500">
          Payment due: {formatMusd(session.paymentAmountMusd)} MUSD
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setDisplayUnit('BTC')}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              displayUnit === 'BTC' ? 'bg-gray-900 text-white' : 'text-gray-600'
            }`}
          >
            BTC
          </button>
          <button
            type="button"
            onClick={() => setDisplayUnit('USD')}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              displayUnit === 'USD' ? 'bg-gray-900 text-white' : 'text-gray-600'
            }`}
          >
            USD
          </button>
        </div>
      </div>

      <SliderField
        label={`${nativeSymbol} to borrow against`}
        value={btcToNumber(collateralBtc)}
        min={collateralMin}
        max={collateralMax}
        step={0.001}
        displayValue={collateralDisplay}
        onChange={onCollateralSlider}
      />

      <SliderField
        label="Collateralization"
        value={collateralRatioPercent}
        min={session.mcrPercent}
        max={MEZO_MAX_CR_PERCENT}
        step={1}
        displayValue={`${collateralRatioPercent}%`}
        onChange={onCrSlider}
      />

      <div className="text-center space-y-1 pt-1">
        <p className="text-sm font-medium text-gray-500">Borrow amount</p>
        {feeLoading || !quote ? (
          <div className="flex items-center justify-center gap-2 py-2 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Calculating…</span>
          </div>
        ) : (
          <>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {formatMusd(quote.borrowAmountMusd)}{' '}
              <span className="text-lg font-semibold text-gray-400">MUSD</span>
            </p>
            {quote.belowMinDebt && (
              <p className="text-sm font-medium text-[#e84142]">
                Minimum loan amount is {minDebtFormatted} MUSD
              </p>
            )}
            {!quote.belowMinDebt && quote.belowPayment && (
              <p className="text-sm font-medium text-[#e84142]">
                Borrow amount must cover your payment of {formatMusd(session.paymentAmountMusd)} MUSD
              </p>
            )}
          </>
        )}
      </div>

      {quote && !feeLoading && (
        <div className="rounded-2xl bg-gray-100/80 px-4 py-4 space-y-4 text-sm">
          <div>
            <p className="font-semibold text-gray-900 mb-2">Liquidation risk</p>
            <DetailRow
              label={`${nativeSymbol} liquidation price`}
              value={`$ ${formatUsd(quote.liquidationPriceUsd)}`}
              hint="BTC price at which your trove may be liquidated (at minimum collateral ratio)."
            />
          </div>

          <div className="border-t border-gray-200/80 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">Fees</p>
              <p className="font-semibold text-gray-900 tabular-nums">
                $ {formatUsd(quote.totalFeesUsd)}
              </p>
            </div>
            <DetailRow
              label="Liquidation fee deposit"
              value={`$ ${formatMusd(quote.gasCompensationMusd)}`}
              hint="Refunded when you close your trove (200 MUSD on testnet)."
            />
            <DetailRow
              label="Issuance fee"
              value={`$ ${formatMusd(quote.borrowFeeMusd)}`}
              hint="One-time fee to mint MUSD for this borrow."
            />
          </div>
        </div>
      )}

      {quote?.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          {warning}
        </p>
      ))}

      {txError && <p className="text-sm text-red-600">{txError}</p>}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={!quote?.canBorrow || feeLoading || isSwitching}
          onClick={() => quote && onConfirm(quote)}
          className="w-full rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSwitching && <Loader2 className="h-4 w-4 animate-spin" />}
          Borrow now
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="w-full rounded-full border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Pay with {nativeSymbol} instead
        </button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-sm font-bold text-gray-900 tabular-nums">{displayValue}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-gray-900 cursor-pointer"
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex items-center gap-1.5 text-gray-600">
        <span>{label}</span>
        {hint && (
          <span title={hint} className="text-gray-400 cursor-help">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <span className="font-medium text-gray-900 tabular-nums text-right">{value}</span>
    </div>
  );
}
