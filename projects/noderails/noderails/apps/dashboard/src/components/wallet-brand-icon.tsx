'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { getWalletTileMeta } from '@/components/wallet-tile-meta';

export function WalletBrandIcon({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}) {
  const meta = getWalletTileMeta(name);
  const [failed, setFailed] = useState(false);

  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const img = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  if (meta.iconUrl && !failed) {
    return (
      <div
        className={clsx(
          box,
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card',
        )}
      >
        <img
          src={meta.iconUrl}
          alt=""
          className={clsx(img, 'object-contain')}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        box,
        'flex shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white',
      )}
      style={{ backgroundColor: meta.accent }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
