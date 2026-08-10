import { formatUnits, parseUnits } from 'viem';
import {
  MEZO_DEFAULT_CR_PERCENT,
  MEZO_MAX_CR_PERCENT,
  MEZO_MCR_PERCENT,
} from '../config';
import type { MezoBorrowQuote } from '../types';

function estimateBorrowingFee(borrow: bigint, referenceBorrow: bigint, referenceFee: bigint): bigint {
  if (referenceBorrow <= 0n) {
    return 0n;
  }
  return (borrow * referenceFee) / referenceBorrow;
}

/** BTC collateral needed for a target net borrow at the given collateral ratio (Mezo ICR model). */
export function collateralForBorrowAtCr(
  borrowAmountMusd: bigint,
  collateralRatioPercent: number,
  btcPriceUsd: number,
  gasCompensation: bigint,
  referenceBorrow: bigint,
  referenceFee: bigint,
): bigint {
  if (btcPriceUsd <= 0 || collateralRatioPercent <= 0) {
    return 0n;
  }

  const fee = estimateBorrowingFee(borrowAmountMusd, referenceBorrow, referenceFee);
  const totalDebtUsd = Number(formatUnits(borrowAmountMusd + fee + gasCompensation, 18));
  const collateralUsd = totalDebtUsd * (collateralRatioPercent / 100);
  const collateralBtc = collateralUsd / btcPriceUsd;

  if (collateralBtc <= 0) {
    return 0n;
  }
  return parseUnits(collateralBtc.toFixed(18), 18);
}

/** Net borrow from collateral + CR (inverse of collateralForBorrowAtCr). */
export function resolveBorrowFromCollateral(
  collateralBtc: bigint,
  collateralRatioPercent: number,
  btcPriceUsd: number,
  gasCompensation: bigint,
  referenceBorrow: bigint,
  referenceFee: bigint,
): { borrowAmountMusd: bigint; totalDebtMusd: bigint; borrowFeeMusd: bigint } {
  const collUsd = Number(formatUnits(collateralBtc, 18)) * btcPriceUsd;
  const totalDebtUsd = collUsd * (100 / collateralRatioPercent);
  const totalDebt = parseUnits(Math.max(totalDebtUsd, 0).toFixed(18), 18);

  let borrow = totalDebt > gasCompensation ? totalDebt - gasCompensation : 0n;
  for (let i = 0; i < 8; i += 1) {
    const fee = estimateBorrowingFee(borrow, referenceBorrow, referenceFee);
    const nextBorrow = totalDebt > gasCompensation + fee ? totalDebt - gasCompensation - fee : 0n;
    if (nextBorrow === borrow) {
      break;
    }
    borrow = nextBorrow;
  }

  const borrowFeeMusd = estimateBorrowingFee(borrow, referenceBorrow, referenceFee);
  return { borrowAmountMusd: borrow, totalDebtMusd: totalDebt, borrowFeeMusd };
}

export function calcLiquidationPriceUsd(
  collateralBtc: bigint,
  totalDebtMusd: bigint,
  mcrPercent: number,
): number {
  const collBtc = Number(formatUnits(collateralBtc, 18));
  const debtUsd = Number(formatUnits(totalDebtMusd, 18));
  if (collBtc <= 0 || debtUsd <= 0) {
    return 0;
  }
  return (debtUsd * (mcrPercent / 100)) / collBtc;
}

export function buildQuoteFromCollateral(params: {
  collateralBtc: bigint;
  collateralRatioPercent: number;
  btcPriceUsd: number;
  minNetDebt: bigint;
  gasCompensation: bigint;
  referenceBorrow: bigint;
  referenceFee: bigint;
  mcrPercent: number;
  paymentAmountMusd: bigint;
  nativeBalanceWei?: bigint;
  warnings?: string[];
}): MezoBorrowQuote {
  const {
    collateralBtc,
    collateralRatioPercent,
    btcPriceUsd,
    minNetDebt,
    gasCompensation,
    referenceBorrow,
    referenceFee,
    mcrPercent,
    paymentAmountMusd,
    nativeBalanceWei,
    warnings = [],
  } = params;

  const { borrowAmountMusd, totalDebtMusd, borrowFeeMusd } = resolveBorrowFromCollateral(
    collateralBtc,
    collateralRatioPercent,
    btcPriceUsd,
    gasCompensation,
    referenceBorrow,
    referenceFee,
  );

  const belowMinDebt = borrowAmountMusd < minNetDebt;
  const belowPayment = borrowAmountMusd < paymentAmountMusd;
  const liquidationPriceUsd = calcLiquidationPriceUsd(collateralBtc, totalDebtMusd, mcrPercent);
  const totalFeesUsd =
    Number(formatUnits(borrowFeeMusd, 18)) + Number(formatUnits(gasCompensation, 18));

  let canBorrow =
    !belowMinDebt &&
    !belowPayment &&
    collateralBtc > 0n &&
    borrowAmountMusd > 0n &&
    btcPriceUsd > 0;

  if (canBorrow && nativeBalanceWei != null && nativeBalanceWei < collateralBtc) {
    canBorrow = false;
  }

  return {
    paymentAmountMusd,
    borrowAmountMusd,
    minNetDebt,
    collateralBtc,
    collateralRatioPercent,
    borrowFeeMusd,
    gasCompensationMusd: gasCompensation,
    liquidationPriceUsd,
    totalFeesUsd,
    belowMinDebt,
    belowPayment,
    warnings: [...warnings],
    canBorrow,
  };
}

export function initialBorrowSessionInputs(
  minNetDebt: bigint,
  paymentAmountMusd: bigint,
  gasCompensation: bigint,
  btcPriceUsd: number,
  referenceBorrow: bigint,
  referenceFee: bigint,
  collateralRatioPercent = MEZO_DEFAULT_CR_PERCENT,
): { targetBorrow: bigint; initialCollateral: bigint } {
  const targetBorrow = paymentAmountMusd > minNetDebt ? paymentAmountMusd : minNetDebt;
  const initialCollateral = collateralForBorrowAtCr(
    targetBorrow,
    collateralRatioPercent,
    btcPriceUsd,
    gasCompensation,
    referenceBorrow,
    referenceFee,
  );
  return { targetBorrow, initialCollateral };
}

export { MEZO_DEFAULT_CR_PERCENT, MEZO_MAX_CR_PERCENT, MEZO_MCR_PERCENT };
