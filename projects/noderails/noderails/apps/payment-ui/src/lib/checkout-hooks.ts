'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSignTypedData,
  useSwitchChain,
  useChainId,
} from 'wagmi';
import { erc20Abi, type Address, parseUnits, maxUint256 } from 'viem';
import { convertFiatToToken, authorizePayment, getCheckoutIntentStatus } from './api';

function useEvmChainReady(chainId: number | undefined) {
  const currentChainId = useChainId();
  return chainId != null && currentChainId === chainId;
}

// ── ERC20 Balance Hook ──

export function useTokenBalance(
  tokenAddress: string | undefined,
  chainId: number | undefined,
  decimals: number | undefined,
) {
  const { address } = useAccount();
  const chainReady = useEvmChainReady(chainId);
  const isNative =
    !tokenAddress ||
    tokenAddress === '0x0000000000000000000000000000000000000000' ||
    tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: chainReady && !!address && !!tokenAddress && !!chainId && !isNative,
      refetchInterval: 10_000,
    },
  });

  return {
    balance: isNative ? undefined : erc20Balance,
    isNative,
    refetch: refetchErc20,
    chainReady,
  };
}

// ── ERC20 Allowance Hook ──

export function useTokenAllowance(
  tokenAddress: string | undefined,
  spenderAddress: string | undefined,
  chainId: number | undefined,
) {
  const { address } = useAccount();
  const chainReady = useEvmChainReady(chainId);
  const isNative =
    !tokenAddress ||
    tokenAddress === '0x0000000000000000000000000000000000000000' ||
    tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  const { data: allowance, refetch } = useReadContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && spenderAddress ? [address, spenderAddress as Address] : undefined,
    chainId,
    query: {
      enabled: chainReady && !!address && !!tokenAddress && !!spenderAddress && !!chainId && !isNative,
      refetchInterval: 5_000,
    },
  });

  return { allowance: isNative ? undefined : allowance, refetch, chainReady };
}

// ── ERC20 Approve Hook ──

export function useTokenApproval(
  tokenAddress: string | undefined,
  spenderAddress: string | undefined,
  amount: bigint | undefined,
  chainId: number | undefined,
  isSubscription: boolean = false,
) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // For subscriptions, approve a capped yearly amount so the escrow can pull
  // funds for recurring charges without requiring re-approval each cycle.
  // The caller is responsible for passing the per-charge amount; this hook
  // will use it as-is for one-time payments, or delegate to the caller's
  // pre-computed yearly cap for subscriptions.
  const approve = useCallback(() => {
    if (!tokenAddress || !spenderAddress || !amount) return;
    writeContract({
      address: tokenAddress as Address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress as Address, amount],
      chainId,
    });
  }, [writeContract, tokenAddress, spenderAddress, amount, chainId]);

  return {
    approve,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}

// ── EIP-2612 Permit Hook ──

const PERMIT_TYPEHASH = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export function usePermitSign(
  tokenAddress: string | undefined,
  tokenName: string | undefined,
  spenderAddress: string | undefined,
  amount: bigint | undefined,
  chainId: number | undefined,
  permitVersion: string | undefined,
) {
  const { address } = useAccount();
  const chainReady = useEvmChainReady(chainId);

  // Prefer on-chain metadata for the permit EIP-712 domain when available.
  const { data: onchainTokenName } = useReadContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'name',
    chainId,
    query: {
      enabled: chainReady && !!tokenAddress && !!chainId,
    },
  });

  const { data: onchainPermitVersion } = useReadContract({
    address: tokenAddress as Address,
    abi: [
      {
        inputs: [],
        name: 'version',
        outputs: [{ name: '', type: 'string' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const,
    functionName: 'version',
    chainId,
    query: {
      enabled: chainReady && !!tokenAddress && !!chainId,
    },
  });

  // Read the permit nonce
  const { data: nonce } = useReadContract({
    address: tokenAddress as Address,
    abi: [
      {
        inputs: [{ name: 'owner', type: 'address' }],
        name: 'nonces',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ] as const,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: chainReady && !!address && !!tokenAddress && !!chainId,
    },
  });

  const { signTypedData, data: signature, isPending, error } = useSignTypedData();

  // Store deadline separately so it survives across renders
  const [deadline, setDeadline] = useState<string | null>(null);

  const [parsedSig, setParsedSig] = useState<{
    deadline: string;
    v: number;
    r: string;
    s: string;
  } | null>(null);

  const signPermit = useCallback(() => {
    const domainName = onchainTokenName ?? tokenName;
    const domainVersion = onchainPermitVersion ?? permitVersion ?? '1';

    if (!address || !tokenAddress || !spenderAddress || amount === undefined || nonce === undefined || !chainId || !domainName) {
      return;
    }

    const dl = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
    setDeadline(dl.toString());

    signTypedData({
      domain: {
        name: domainName,
        version: domainVersion,
        chainId,
        verifyingContract: tokenAddress as Address,
      },
      types: PERMIT_TYPEHASH,
      primaryType: 'Permit',
      message: {
        owner: address,
        spender: spenderAddress as Address,
        value: amount,
        nonce,
        deadline: dl,
      },
    });
  }, [address, tokenAddress, spenderAddress, amount, nonce, chainId, onchainTokenName, tokenName, onchainPermitVersion, permitVersion, signTypedData]);

  // Parse the signature when it arrives
  useEffect(() => {
    if (signature && deadline) {
      const r = `0x${signature.slice(2, 66)}`;
      const s = `0x${signature.slice(66, 130)}`;
      const parsedV = parseInt(signature.slice(130, 132), 16);
      const v = parsedV < 27 ? parsedV + 27 : parsedV;
      setParsedSig({ deadline, v, r, s });
    }
  }, [signature, deadline]);

  return {
    signPermit,
    signature: parsedSig,
    isReady: !!parsedSig,
    isPending,
    error,
  };
}

// ── Price Conversion Hook ──

export function usePriceConversion(
  tokenSymbol: string | undefined,
  amountUsd: number | undefined,
  decimals: number | undefined,
  currency = 'USD',
) {
  const [data, setData] = useState<{
    rawAmount: bigint;
    tokenAmount: string;
    priceUsd: number;
    exchangeRate: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenSymbol || !amountUsd || !decimals) return;

    let cancelled = false;
    setIsLoading(true);

    convertFiatToToken(tokenSymbol, amountUsd, currency)
      .then((result) => {
        if (cancelled) return;
        const raw = parseUnits(result.tokenAmount, decimals);
        setData({
          rawAmount: raw,
          tokenAmount: result.tokenAmount,
          priceUsd: result.priceFiat,
          exchangeRate: result.tokenAmount,
        });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message ?? 'Price conversion failed');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenSymbol, amountUsd, decimals, currency]);

  return { data, isLoading, error };
}

// ── Chain Switching Hook ──

export function useChainSwitch(targetChainId: number | undefined) {
  const currentChainId = useChainId();
  const { switchChain, isPending: isSwitching, error } = useSwitchChain();

  const needsSwitch = !!targetChainId && currentChainId !== targetChainId;

  const switchToTarget = useCallback(() => {
    if (targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [switchChain, targetChainId]);

  return { needsSwitch, switchToTarget, isPending: isSwitching, error };
}

// ── Checkout Intent Polling Hook ──

export function useIntentStatusPolling(intentId: string | undefined) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!intentId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await getCheckoutIntentStatus(intentId);
        if (cancelled) return;
        setStatus(res.status);
      } catch {
        // Ignore polling errors
      }
    }, 3_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [intentId]);

  return { status };
}
