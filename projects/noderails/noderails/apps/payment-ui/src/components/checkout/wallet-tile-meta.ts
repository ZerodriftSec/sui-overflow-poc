export interface WalletTileMeta {
  subtitle: string;
  accent: string;
  mark: string;
  iconUrl?: string;
}

const DEFAULT_META: WalletTileMeta = {
  subtitle: 'Browser extension',
  accent: '#64748b',
  mark: 'W',
};

const WALLET_META: Record<string, WalletTileMeta> = {
  metamask: {
    subtitle: 'Extension / Mobile',
    accent: '#E8831D',
    mark: 'M',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
  },
  'coinbase wallet': {
    subtitle: 'Extension / Mobile',
    accent: '#0052FF',
    mark: 'C',
    iconUrl: 'https://www.coinbase.com/img/favicon/favicon-256.png',
  },
  coinbase: {
    subtitle: 'Extension / Mobile',
    accent: '#0052FF',
    mark: 'C',
    iconUrl: 'https://www.coinbase.com/img/favicon/favicon-256.png',
  },
  walletconnect: {
    subtitle: 'Scan with mobile',
    accent: '#3B99FC',
    mark: 'W',
    iconUrl: 'https://avatars.githubusercontent.com/u/37784899?s=128&v=4',
  },
  phantom: {
    subtitle: 'Browser extension',
    accent: '#AB9FF2',
    mark: 'P',
    iconUrl: 'https://phantom.app/img/phantom-logo.svg',
  },
  solflare: {
    subtitle: 'Browser extension',
    accent: '#FC7227',
    mark: 'S',
    iconUrl: 'https://solflare.com/favicon.ico',
  },
  backpack: {
    subtitle: 'Browser extension',
    accent: '#E33E3F',
    mark: 'B',
    iconUrl: 'https://backpack.app/apple-touch-icon.png',
  },
  talisman: {
    subtitle: 'Browser extension',
    accent: '#FF5A00',
    mark: 'T',
    iconUrl: 'https://talisman.xyz/favicon.ico',
  },
  rabby: {
    subtitle: 'Browser extension',
    accent: '#8697FF',
    mark: 'R',
    iconUrl: 'https://rabby.io/assets/images/logo-128.png',
  },
  injected: {
    subtitle: 'Browser wallet',
    accent: '#475569',
    mark: 'W',
  },
  'io.metamask': {
    subtitle: 'Extension / Mobile',
    accent: '#E8831D',
    mark: 'M',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
  },
  trust: {
    subtitle: 'Mobile wallet',
    accent: '#3375BB',
    mark: 'T',
    iconUrl: 'https://trustwallet.com/assets/images/favicon.ico',
  },
  rainbow: {
    subtitle: 'Mobile wallet',
    accent: '#001E59',
    mark: 'R',
    iconUrl: 'https://rainbow.me/favicon.ico',
  },
};

export function getWalletTileMeta(name: string): WalletTileMeta {
  const key = name.trim().toLowerCase();
  for (const [pattern, meta] of Object.entries(WALLET_META)) {
    if (key.includes(pattern)) return meta;
  }
  return {
    ...DEFAULT_META,
    mark: name.trim().charAt(0).toUpperCase() || 'W',
  };
}
