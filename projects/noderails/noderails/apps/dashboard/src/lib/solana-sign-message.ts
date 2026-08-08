'use client';

import {
  SolanaSignMessage,
  type SolanaSignMessageFeature,
} from '@solana/wallet-standard-features';
import {
  OrbitAdapter,
  formatConnectorName,
  getAdapterFromConnectorType,
  getConnectorTypeFromName,
} from '@tuwaio/orbit-core';
import { getAvailableSolanaConnectors } from '@tuwaio/orbit-solana';
import type { SolanaConnection } from '@tuwaio/satellite-solana';
import { getWalletFeature } from '@wallet-standard/ui';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui-core';

function resolveLiveSolanaWalletPair(connection: SolanaConnection): {
  wallet: UiWallet;
  account: UiWalletAccount;
} {
  const wallets = getAvailableSolanaConnectors();
  const wallet =
    wallets.find(
      (candidate) =>
        getConnectorTypeFromName(OrbitAdapter.SOLANA, formatConnectorName(candidate.name)) ===
        connection.connectorType,
    ) ??
    wallets.find((candidate) =>
      candidate.accounts.some((account) => account.address === connection.address),
    ) ??
    connection.connectedWallet;

  if (!wallet) {
    throw new Error('Connect a Solana wallet first');
  }

  const account =
    wallet.accounts.find((candidate) => candidate.address === connection.address) ??
    wallet.accounts[0] ??
    connection.connectedAccount;

  if (!account) {
    throw new Error('Connect a Solana wallet first');
  }

  return { wallet, account };
}

export async function signSolanaPersonalMessage(
  connection: SolanaConnection,
  message: string,
): Promise<string> {
  const { wallet, account } = resolveLiveSolanaWalletPair(connection);

  if (!wallet.features.includes(SolanaSignMessage)) {
    throw new Error('This wallet does not support message signing. Try Phantom or Solflare.');
  }

  const feature = getWalletFeature(
    wallet,
    SolanaSignMessage,
  ) as SolanaSignMessageFeature[typeof SolanaSignMessage];

  const bytes = new TextEncoder().encode(message);
  const [output] = await feature.signMessage({ account, message: bytes });
  return btoa(String.fromCharCode(...output.signature));
}

export function isActiveSolanaConnection(
  activeConnection: { connectorType?: unknown; isConnected?: boolean } | null | undefined,
): activeConnection is SolanaConnection {
  return Boolean(
    activeConnection?.isConnected &&
      activeConnection.connectorType &&
      getAdapterFromConnectorType(activeConnection.connectorType as never) === OrbitAdapter.SOLANA,
  );
}
