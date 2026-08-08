'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import type { SuiClient } from '@mysten/sui/client';
import { SUI_NATIVE_COIN_TYPE, isNativeToken } from '@noderails/common';

export function resolveSuiCoinType(contractAddress: string): string {
  if (isNativeToken(contractAddress)) {
    return SUI_NATIVE_COIN_TYPE;
  }
  return contractAddress.trim();
}

export async function fetchSuiCoinBalance(
  client: Pick<SuiClient, 'getBalance'>,
  owner: string,
  contractAddress: string,
): Promise<bigint> {
  const coinType = resolveSuiCoinType(contractAddress);
  const result = await client.getBalance({ owner, coinType });
  return BigInt(result.totalBalance);
}

export function useSuiTokenBalance(contractAddress: string | undefined, enabled: boolean) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled || !account?.address || !contractAddress) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const raw = await fetchSuiCoinBalance(client, account.address, contractAddress);
      setBalance(raw);
    } catch {
      setBalance(0n);
    } finally {
      setLoading(false);
    }
  }, [enabled, account?.address, contractAddress, client]);

  useEffect(() => {
    void refetch();
    if (!enabled) return;
    const interval = window.setInterval(() => void refetch(), 10_000);
    return () => window.clearInterval(interval);
  }, [refetch, enabled]);

  return {
    balance,
    loading,
    refetch,
    suiAddress: account?.address ?? null,
  };
}
