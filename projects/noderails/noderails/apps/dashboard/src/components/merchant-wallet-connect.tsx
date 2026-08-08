'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useSignPersonalMessage,
  useWallets as useSuiWallets,
} from '@mysten/dapp-kit';
import {
  OrbitAdapter,
  formatConnectorName,
  getAdapterFromConnectorType,
  getConnectorTypeFromName,
  type ConnectorType,
} from '@tuwaio/orbit-core';
import { getAvailableSolanaConnectors } from '@tuwaio/orbit-solana';
import { useSatelliteConnectStore } from '@tuwaio/satellite-react';
import { AlertCircle, Check, RefreshCw, Wallet } from 'lucide-react';
import type { SolanaConnection } from '@tuwaio/satellite-solana';
import { useAccount, useConnectors, useDisconnect, useSignMessage } from 'wagmi';
import { Button } from '@/components/ui';
import { WalletBrandIcon } from '@/components/wallet-brand-icon';
import { SuiWalletProvider } from '@/components/sui-wallet-provider';
import {
  MERCHANT_CHAIN_FAMILY_LABELS,
  merchantChainId,
  type MerchantChainFamily,
} from '@/lib/merchant-wallet-networks';
import { isActiveSolanaConnection, signSolanaPersonalMessage } from '@/lib/solana-sign-message';
import { solanaClusterForChainId } from '@/lib/wagmi';

export type MerchantWalletType = 'receiving' | 'payout';

interface MerchantWalletConnectProps {
  appName: string;
  appEnv: 'TEST' | 'PRODUCTION';
  walletType?: MerchantWalletType;
  initialFamily?: MerchantChainFamily;
  onVerified: (family: MerchantChainFamily, address: string, signature: string) => void;
}

function WalletTile({
  name,
  isReady,
  isConnecting,
  onClick,
}: {
  name: string;
  isReady: boolean;
  isConnecting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isConnecting}
      onClick={onClick}
      className="flex h-auto min-h-[3.25rem] w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/40 disabled:opacity-60 cursor-pointer"
    >
      <WalletBrandIcon name={name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{name}</span>
      {isConnecting ? (
        <span className="text-xs text-muted-foreground">Connecting…</span>
      ) : isReady ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      ) : null}
    </button>
  );
}

function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}…${address.slice(-8)}`;
}

function ChainFamilyTabs({
  family,
  onChange,
}: {
  family: MerchantChainFamily;
  onChange: (next: MerchantChainFamily) => void;
}) {
  const families: MerchantChainFamily[] = ['EVM', 'SOLANA', 'SUI'];

  return (
    <div className="grid min-w-0 grid-cols-3 gap-2 rounded-lg bg-muted/50 p-1">
      {families.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`min-w-0 truncate rounded-md px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
            family === item
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {MERCHANT_CHAIN_FAMILY_LABELS[item]}
        </button>
      ))}
    </div>
  );
}

function SatelliteWalletGrid({
  family,
  appEnv,
}: {
  family: 'EVM' | 'SOLANA';
  appEnv: 'TEST' | 'PRODUCTION';
}) {
  const evmConnectors = useConnectors();
  const [solanaWallets, setSolanaWallets] = useState(() => getAvailableSolanaConnectors());
  const connect = useSatelliteConnectStore((state) => state.connect);
  const disconnect = useSatelliteConnectStore((state) => state.disconnect);
  const connecting = useSatelliteConnectStore((state) => state.connecting);
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const connectionError = useSatelliteConnectStore((state) => state.connectionError);

  useEffect(() => {
    if (family !== 'SOLANA') return;
    const refresh = () => setSolanaWallets(getAvailableSolanaConnectors());
    refresh();
    const timer = window.setTimeout(refresh, 600);
    return () => window.clearTimeout(timer);
  }, [family]);

  const chainId = merchantChainId(family, appEnv);
  const activeMatchesSelection =
    activeConnection?.isConnected &&
    ((family === 'SOLANA' &&
      getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.SOLANA) ||
      (family === 'EVM' &&
        getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.EVM));

  if (activeMatchesSelection) {
    return null;
  }

  const tiles =
    family === 'EVM'
      ? evmConnectors.map((connector) => ({
          key: connector.uid,
          name: connector.name,
          connectorType: getConnectorTypeFromName(
            OrbitAdapter.EVM,
            formatConnectorName(connector.name),
          ) as ConnectorType,
          chainTarget: chainId,
          ready: connector.ready,
        }))
      : solanaWallets.map((wallet) => ({
          key: wallet.name,
          name: wallet.name,
          connectorType: getConnectorTypeFromName(
            OrbitAdapter.SOLANA,
            formatConnectorName(wallet.name),
          ) as ConnectorType,
          chainTarget: solanaClusterForChainId(chainId),
          ready: true,
        }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Choose a wallet</p>
        {family === 'SOLANA' && (
          <button
            type="button"
            onClick={() => setSolanaWallets(getAvailableSolanaConnectors())}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        )}
      </div>

      {tiles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">
            {family === 'SOLANA' ? 'No Solana wallet found' : 'No wallet found'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {family === 'SOLANA'
              ? 'Install Phantom, Solflare, or Backpack'
              : 'Install MetaMask or another EVM wallet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tiles.map((tile) => (
            <WalletTile
              key={tile.key}
              name={tile.name}
              isReady={Boolean(tile.ready)}
              isConnecting={connecting}
              onClick={async () => {
                if (
                  activeConnection?.isConnected &&
                  activeConnection.connectorType !== tile.connectorType
                ) {
                  await disconnect(activeConnection.connectorType);
                }
                await connect({
                  connectorType: tile.connectorType,
                  chainId: tile.chainTarget,
                });
              }}
            />
          ))}
        </div>
      )}

      {connecting && <p className="text-center text-xs text-muted-foreground">Connecting…</p>}

      {connectionError?.message && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {connectionError.message}
        </div>
      )}
    </div>
  );
}

function SuiWalletGrid() {
  const wallets = useSuiWallets();
  const account = useCurrentAccount();
  const { mutate: connectWallet, isPending } = useConnectWallet();

  if (account?.address) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Choose a wallet</p>
      {wallets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No Sui wallet found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Install Sui Wallet, Slush, or another Wallet Standard extension
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {wallets.map((wallet) => (
            <WalletTile
              key={wallet.name}
              name={wallet.name}
              isReady
              isConnecting={isPending}
              onClick={() => connectWallet({ wallet })}
            />
          ))}
        </div>
      )}
      {isPending && <p className="text-center text-xs text-muted-foreground">Connecting…</p>}
    </div>
  );
}

function useConnectedWallet(family: MerchantChainFamily): {
  connected: boolean;
  address: string | null;
  solanaConnection?: SolanaConnection;
} {
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const suiAccount = useCurrentAccount();
  const solanaConnection = isActiveSolanaConnection(activeConnection) ? activeConnection : undefined;

  if (family === 'EVM') {
    return { connected: evmConnected, address: evmAddress ?? null };
  }
  if (family === 'SOLANA') {
    return {
      connected: Boolean(solanaConnection?.isConnected && solanaConnection.address),
      address: solanaConnection?.address ? String(solanaConnection.address) : null,
      solanaConnection,
    };
  }
  return {
    connected: Boolean(suiAccount?.address),
    address: suiAccount?.address ?? null,
  };
}

export function MerchantWalletConnect({
  appName,
  appEnv,
  walletType = 'receiving',
  initialFamily = 'EVM',
  onVerified,
}: MerchantWalletConnectProps) {
  return (
    <SuiWalletProvider appEnv={appEnv}>
      <MerchantWalletConnectInner
        appName={appName}
        appEnv={appEnv}
        walletType={walletType}
        initialFamily={initialFamily}
        onVerified={onVerified}
      />
    </SuiWalletProvider>
  );
}

function MerchantWalletConnectInner({
  appName,
  appEnv,
  walletType = 'receiving',
  initialFamily = 'EVM',
  onVerified,
}: MerchantWalletConnectProps) {
  const [family, setFamily] = useState<MerchantChainFamily>(initialFamily);
  const [signing, setSigning] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  const { address, connected, solanaConnection } = useConnectedWallet(family);

  const { signMessageAsync } = useSignMessage();
  const { disconnect: disconnectEvm } = useDisconnect();
  const satelliteDisconnect = useSatelliteConnectStore((state) => state.disconnect);
  const activeConnection = useSatelliteConnectStore((state) => state.activeConnection);
  const { mutate: disconnectSui } = useDisconnectWallet();
  const { mutateAsync: signSuiMessage } = useSignPersonalMessage();

  const handleDisconnect = useCallback(async () => {
    setError('');
    if (family === 'EVM') {
      disconnectEvm();
      if (
        activeConnection?.isConnected &&
        getAdapterFromConnectorType(activeConnection.connectorType) === OrbitAdapter.EVM
      ) {
        await satelliteDisconnect(activeConnection.connectorType);
      }
      return;
    }
    if (family === 'SOLANA' && isActiveSolanaConnection(activeConnection)) {
      await satelliteDisconnect(activeConnection.connectorType);
      return;
    }
    if (family === 'SUI') {
      disconnectSui();
    }
  }, [activeConnection, disconnectEvm, disconnectSui, family, satelliteDisconnect]);

  const handleFamilyChange = useCallback(
    async (next: MerchantChainFamily) => {
      setError('');
      setVerified(false);
      if (connected) {
        await handleDisconnect();
      }
      setFamily(next);
    },
    [connected, handleDisconnect],
  );

  const handleVerify = useCallback(async () => {
    if (!address) return;
    setSigning(true);
    setError('');
    try {
      const walletLabel = walletType === 'payout' ? 'payout wallet' : 'receiving wallet';
      const networkLabel = MERCHANT_CHAIN_FAMILY_LABELS[family];
      const message = `I confirm that I own this ${networkLabel} wallet and authorize it as the ${walletLabel} for "${appName}" on NodeRails.\n\nWallet: ${address}\nTimestamp: ${new Date().toISOString()}`;

      let signature = '';
      if (family === 'EVM') {
        signature = await signMessageAsync({ message });
      } else if (family === 'SOLANA') {
        if (!solanaConnection) {
          throw new Error('Connect a Solana wallet first');
        }
        signature = await signSolanaPersonalMessage(solanaConnection, message);
      } else {
        const bytes = new TextEncoder().encode(message);
        const result = await signSuiMessage({ message: bytes });
        signature = result.signature;
      }

      setVerified(true);
      onVerified(family, address, signature);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'shortMessage' in err
          ? String((err as { shortMessage?: string }).shortMessage)
          : err instanceof Error
            ? err.message
            : 'Signing failed';
      setError(msg);
    } finally {
      setSigning(false);
    }
  }, [
    address,
    appName,
    family,
    onVerified,
    signMessageAsync,
    signSuiMessage,
    solanaConnection,
    walletType,
  ]);

  if (verified && address) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-emerald-700">
            {MERCHANT_CHAIN_FAMILY_LABELS[family]} wallet verified
          </p>
          <p className="truncate font-mono text-xs text-emerald-700/70" title={address}>
            {truncateAddress(address)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 overflow-hidden">
      <ChainFamilyTabs family={family} onChange={handleFamilyChange} />

      {connected && address ? (
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  Connected {MERCHANT_CHAIN_FAMILY_LABELS[family]} wallet
                </p>
                <p className="truncate font-mono text-sm text-foreground" title={address}>
                  {truncateAddress(address)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="shrink-0 cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Disconnect
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <Button
              type="button"
              onClick={() => void handleVerify()}
              disabled={signing}
              className="w-full max-w-full"
              size="sm"
            >
              <Wallet className="h-4 w-4" />
              {signing ? 'Signing…' : 'Sign to verify ownership'}
            </Button>
          </div>
        </div>
      ) : family === 'SUI' ? (
        <SuiWalletGrid />
      ) : (
        <SatelliteWalletGrid family={family} appEnv={appEnv} />
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
