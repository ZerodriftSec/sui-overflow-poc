'use client';

import { useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import type { Address, Hash } from 'viem';
import { MEZO_BORROW_CHAIN_ID, MEZO_BORROWER_OPERATIONS_ADDRESS } from '../config';
import { BORROWER_OPERATIONS_ABI, ZERO_ADDRESS } from './constants';

export function useOpenTrove() {
  const { writeContractAsync, isPending, error, data: txHash } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, isError: isReceiptError } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: MEZO_BORROW_CHAIN_ID,
    });

  const openTrove = useCallback(
    async (borrowAmountMusd: bigint, collateralBtc: bigint): Promise<Hash> => {
      const hash = await writeContractAsync({
        address: MEZO_BORROWER_OPERATIONS_ADDRESS as Address,
        abi: BORROWER_OPERATIONS_ABI,
        functionName: 'openTrove',
        args: [borrowAmountMusd, ZERO_ADDRESS, ZERO_ADDRESS],
        value: collateralBtc,
        chainId: MEZO_BORROW_CHAIN_ID,
      });
      return hash;
    },
    [writeContractAsync],
  );

  return {
    openTrove,
    txHash,
    isPending,
    isConfirming,
    isSuccess,
    isReceiptError,
    error,
  };
}
