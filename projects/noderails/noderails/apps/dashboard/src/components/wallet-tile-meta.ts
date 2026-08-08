export interface WalletTileMeta {
  accent: string;
  iconUrl?: string;
}

const DEFAULT_META: WalletTileMeta = { accent: '#64748b' };

const WALLET_META: Record<string, WalletTileMeta> = {
  metamask: { accent: '#E8831D', iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg' },
  'coinbase wallet': { accent: '#0052FF', iconUrl: 'https://www.coinbase.com/img/favicon/favicon-256.png' },
  coinbase: { accent: '#0052FF', iconUrl: 'https://www.coinbase.com/img/favicon/favicon-256.png' },
  walletconnect: { accent: '#3B99FC', iconUrl: 'https://avatars.githubusercontent.com/u/37784899?s=128&v=4' },
  phantom: { accent: '#AB9FF2', iconUrl: 'https://phantom.app/img/phantom-logo.svg' },
  solflare: { accent: '#FC7227', iconUrl: 'https://solflare.com/favicon.ico' },
  backpack: { accent: '#E33E3F', iconUrl: 'https://backpack.app/apple-touch-icon.png' },
  rabby: { accent: '#8697FF', iconUrl: 'https://rabby.io/assets/images/logo-128.png' },
  'sui wallet': { accent: '#6FBCF0', iconUrl: 'https://sui.io/favicon.ico' },
  slush: { accent: '#4ADE80' },
};

export function getWalletTileMeta(name: string): WalletTileMeta {
  const key = name.trim().toLowerCase();
  for (const [pattern, meta] of Object.entries(WALLET_META)) {
    if (key.includes(pattern)) return meta;
  }
  return DEFAULT_META;
}
