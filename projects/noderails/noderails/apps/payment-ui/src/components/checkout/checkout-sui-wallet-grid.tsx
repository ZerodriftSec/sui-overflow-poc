'use client';

import { Button, Label, Spinner } from '@heroui/react';
import { useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { WalletBrandIcon } from './wallet-brand-icon';

function SuiWalletTile({
  name,
  isConnecting,
  onClick,
}: {
  name: string;
  isConnecting: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      fullWidth
      isDisabled={isConnecting}
      onPress={onClick}
      className="h-auto min-h-[3.75rem] justify-start gap-3 border border-indigo-100 bg-white px-4 py-3 text-slate-900 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/30"
    >
      <WalletBrandIcon name={name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{name}</span>
      {isConnecting ? <Spinner size="sm" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
    </Button>
  );
}

export function CheckoutSuiWalletGrid() {
  const wallets = useWallets();
  const { mutate: connectWallet, isPending, isSuccess } = useConnectWallet();

  if (isSuccess) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Label className="checkout-field-label !mb-0">Connect Sui wallet</Label>
      {wallets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-900">No Sui wallet found</p>
          <p className="mt-1 text-xs text-slate-500">Install Sui Wallet, Slush, or another Wallet Standard extension</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <SuiWalletTile
              key={wallet.name}
              name={wallet.name}
              isConnecting={isPending}
              onClick={() => connectWallet({ wallet })}
            />
          ))}
        </div>
      )}
      {isPending && <p className="text-center text-xs text-slate-500">Connecting...</p>}
    </div>
  );
}
