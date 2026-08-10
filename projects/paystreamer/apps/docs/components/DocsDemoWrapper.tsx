import React, { useState, useEffect } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import dynamic from 'next/dynamic';
import { useLiveMode } from '../lib/LiveModeContext';
import { PayStreamerProvider, usePayStreamerConfig } from '@paystreamer/sdk/react';

const ConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((mod) => mod.ConnectButton),
  { ssr: false }
) as any;

export function DocsDemoWrapper({ children }: { children: React.ReactNode }) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const disconnect = () => dAppKit.disconnectWallet();
  const [mounted, setMounted] = useState(false);
  const { isLive } = useLiveMode();
  const config = usePayStreamerConfig();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="p-8 mt-4 border rounded-xl bg-slate-50 dark:bg-slate-900 animate-pulse h-32 w-full" />;
  }

  if (isLive && !account) {
    return (
      <div className="p-8 mt-4 border border-dashed rounded-xl flex flex-col items-center justify-center gap-4 bg-slate-50/50 dark:bg-slate-900/50 text-center w-full">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Connect your wallet to interact with this live component.
        </p>
        <ConnectButton />
      </div>
    );
  }

  const content = (
    <div className="p-6 mt-4 border rounded-xl flex flex-col items-center justify-center gap-6 bg-slate-50 dark:bg-slate-900 w-full relative">
      {!isLive && (
        <div data-testid="mock-badge" className="absolute top-2 right-2 text-xs font-semibold px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md">
          Mock Mode
        </div>
      )}
      <div className="w-full flex justify-center">
        {children}
      </div>
      
      {/* Inline Disconnect Button */}
      {isLive && account && (
        <button 
          onClick={() => disconnect()}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition underline decoration-dotted mt-4"
        >
          Disconnect Wallet ({account.address.slice(0, 4)}...{account.address.slice(-4)})
        </button>
      )}
    </div>
  );

  if (!isLive) {
    return (
      <PayStreamerProvider config={{ ...config, isMockMode: true } as any}>
        {content}
      </PayStreamerProvider>
    );
  }

  return content;
}
