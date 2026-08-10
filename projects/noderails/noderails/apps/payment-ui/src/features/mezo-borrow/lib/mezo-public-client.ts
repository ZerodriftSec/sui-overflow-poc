import { createPublicClient, formatUnits, http, type Address } from 'viem';
import { defineChain } from 'viem';
import {
  MEZO_BORROW_CHAIN_ID,
  MEZO_BORROWER_OPERATIONS_ADDRESS,
  MEZO_MIN_NET_DEBT,
  MEZO_MCR_PERCENT,
  MEZO_TESTNET_RPC_URL,
  MEZO_TROVE_MANAGER_ADDRESS,
} from '../config';
import { BORROWER_OPERATIONS_ABI, TROVE_MANAGER_ABI } from './constants';

const mezoTestnetChain = defineChain({
  id: MEZO_BORROW_CHAIN_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: {
    default: { http: [MEZO_TESTNET_RPC_URL] },
  },
});

let mezoClient: ReturnType<typeof createPublicClient> | null = null;

export function getMezoPublicClient() {
  if (!mezoClient) {
    mezoClient = createPublicClient({
      chain: mezoTestnetChain,
      transport: http(MEZO_TESTNET_RPC_URL, { timeout: 12_000 }),
    });
  }
  return mezoClient;
}

const RPC_READ_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function readMinNetDebtFromChain(): Promise<{
  value: bigint;
  usedFallback: boolean;
}> {
  const client = getMezoPublicClient();
  try {
    const value = await withTimeout(
      client.readContract({
        address: MEZO_BORROWER_OPERATIONS_ADDRESS as Address,
        abi: BORROWER_OPERATIONS_ABI,
        functionName: 'minNetDebt',
      }),
      RPC_READ_TIMEOUT_MS,
      'minNetDebt',
    );
    return { value, usedFallback: false };
  } catch {
    return { value: MEZO_MIN_NET_DEBT, usedFallback: true };
  }
}

export async function readBorrowingFee(debtAmount: bigint): Promise<bigint> {
  const client = getMezoPublicClient();
  return client.readContract({
    address: MEZO_BORROWER_OPERATIONS_ADDRESS as Address,
    abi: BORROWER_OPERATIONS_ABI,
    functionName: 'getBorrowingFee',
    args: [debtAmount],
  });
}

export async function readProtocolParams(): Promise<{
  minNetDebt: bigint;
  gasCompensation: bigint;
  mcrPercent: number;
  minNetDebtFallback: boolean;
}> {
  const client = getMezoPublicClient();
  try {
    const [minNetDebt, gasCompensation, mcrRaw] = await withTimeout(
      Promise.all([
        client.readContract({
          address: MEZO_BORROWER_OPERATIONS_ADDRESS as Address,
          abi: BORROWER_OPERATIONS_ABI,
          functionName: 'minNetDebt',
        }),
        client.readContract({
          address: MEZO_TROVE_MANAGER_ADDRESS as Address,
          abi: TROVE_MANAGER_ABI,
          functionName: 'MUSD_GAS_COMPENSATION',
        }),
        client.readContract({
          address: MEZO_TROVE_MANAGER_ADDRESS as Address,
          abi: TROVE_MANAGER_ABI,
          functionName: 'MCR',
        }),
      ]),
      RPC_READ_TIMEOUT_MS,
      'protocol params',
    );

    const mcrRatio = Number(formatUnits(mcrRaw, 18));
    const mcrPercent = Number.isFinite(mcrRatio) && mcrRatio > 0 ? Math.round(mcrRatio * 100) : MEZO_MCR_PERCENT;

    return { minNetDebt, gasCompensation, mcrPercent, minNetDebtFallback: false };
  } catch {
    return {
      minNetDebt: MEZO_MIN_NET_DEBT,
      gasCompensation: 200n * 10n ** 18n,
      mcrPercent: MEZO_MCR_PERCENT,
      minNetDebtFallback: true,
    };
  }
}
