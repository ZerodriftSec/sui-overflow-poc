export interface MezoBorrowChainInfo {
  chainId: number;
  chainType?: 'EVM' | 'SOLANA' | 'SUI';
  nativeCurrencySymbol: string;
  isTestnet: boolean;
}

export interface MezoBorrowTokenInfo {
  symbol: string;
  tokenKey: string;
  contractAddress: string;
  chainId: number;
  decimals: number;
}

/** Fetched once when opening the quote panel. */
export interface MezoBorrowSession {
  minNetDebt: bigint;
  gasCompensation: bigint;
  mcrPercent: number;
  btcPriceUsd: number;
  paymentAmountMusd: bigint;
  nativeBalanceWei?: bigint;
  initialCollateralBtc: bigint;
  initialCollateralRatioPercent: number;
  warnings: string[];
}

export interface MezoBorrowQuote {
  paymentAmountMusd: bigint;
  borrowAmountMusd: bigint;
  minNetDebt: bigint;
  collateralBtc: bigint;
  collateralRatioPercent: number;
  borrowFeeMusd: bigint;
  gasCompensationMusd: bigint;
  liquidationPriceUsd: number;
  totalFeesUsd: number;
  belowMinDebt: boolean;
  belowPayment: boolean;
  warnings: string[];
  canBorrow: boolean;
}

export type MezoBorrowModalStep = 'offer' | 'quote' | 'confirming' | 'success';

export type MezoBorrowDisplayUnit = 'BTC' | 'USD';
