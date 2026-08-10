import { getTokenPrice } from '@/lib/api';
import { parseUnits } from 'viem';
import {
  buildQuoteFromCollateral,
  initialBorrowSessionInputs,
  MEZO_DEFAULT_CR_PERCENT,
} from './calc-collateral';
import { readBorrowingFee, readProtocolParams } from './mezo-public-client';
import type { MezoBorrowSession } from '../types';

const PRICE_FETCH_TIMEOUT_MS = 10_000;
const BTC_PRICE_FALLBACK_USD = 84_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

async function fetchBtcPriceUsd(): Promise<{ priceUsd: number; usedFallback: boolean }> {
  try {
    const btcPrice = await withTimeout(getTokenPrice('BTC', 'USD'), PRICE_FETCH_TIMEOUT_MS, 'BTC price');
    const priceUsd = btcPrice.priceUsd ?? btcPrice.priceFiat;
    if (priceUsd > 0) {
      return { priceUsd, usedFallback: false };
    }
  } catch {
    // fall through
  }
  return { priceUsd: BTC_PRICE_FALLBACK_USD, usedFallback: true };
}

export async function fetchMezoBorrowSession(params: {
  amountUsd: number;
  nativeBalanceWei?: bigint;
}): Promise<MezoBorrowSession> {
  const { amountUsd, nativeBalanceWei } = params;
  const paymentAmountMusd = parseUnits(amountUsd.toFixed(6), 18);
  const warnings: string[] = [];

  const [protocol, { priceUsd: btcPriceUsd, usedFallback: priceFallback }] = await Promise.all([
    readProtocolParams(),
    fetchBtcPriceUsd(),
  ]);

  if (protocol.minNetDebtFallback) {
    warnings.push('Could not read minimum borrow from chain; using 1,800 MUSD fallback.');
  }
  if (priceFallback) {
    warnings.push(
      `Could not fetch live BTC price; using $${BTC_PRICE_FALLBACK_USD.toLocaleString()} estimate.`,
    );
  }

  const targetBorrow =
    paymentAmountMusd > protocol.minNetDebt ? paymentAmountMusd : protocol.minNetDebt;

  const borrowingFee = await readBorrowingFee(targetBorrow);

  const { initialCollateral } = initialBorrowSessionInputs(
    protocol.minNetDebt,
    paymentAmountMusd,
    protocol.gasCompensation,
    btcPriceUsd,
    targetBorrow,
    borrowingFee,
    MEZO_DEFAULT_CR_PERCENT,
  );

  return {
    minNetDebt: protocol.minNetDebt,
    gasCompensation: protocol.gasCompensation,
    mcrPercent: protocol.mcrPercent,
    btcPriceUsd,
    paymentAmountMusd,
    nativeBalanceWei,
    initialCollateralBtc: initialCollateral,
    initialCollateralRatioPercent: MEZO_DEFAULT_CR_PERCENT,
    warnings,
  };
}

export { buildQuoteFromCollateral, readBorrowingFee };
