import { getDatabaseClient } from '@noderails/database';
import { chainRegistryToArray, mergeChainRegistry } from '@noderails/common';
const CRYPTO_ICON_BASE =
  'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';

function buildSymbolIconUrl(symbol: string): string {
  return `${CRYPTO_ICON_BASE}/${symbol.toLowerCase()}.png`;
}

async function resolveChainIconUrl(chain: {
  chainId: number;
  nativeCurrencySymbol: string;
  iconUrl: string | null;
}): Promise<string | null> {
  if (chain.iconUrl) return chain.iconUrl;
  return buildSymbolIconUrl(chain.nativeCurrencySymbol);
}

async function resolveTokenIconUrl(token: {
  chainId: number;
  symbol: string;
  contractAddress: string;
  iconUrl: string | null;
}): Promise<string | null> {
  if (token.iconUrl) return token.iconUrl;
  return buildSymbolIconUrl(token.symbol);
}

export async function getSupportedAssets(environment?: 'TEST' | 'PRODUCTION') {
  const db = getDatabaseClient();

  const chainWhere: Record<string, unknown> = { isEnabled: true };
  if (environment) {
    chainWhere.isTestnet = environment === 'TEST';
  }

  const tokenChainWhere: Record<string, unknown> = { isEnabled: true };
  if (environment) {
    tokenChainWhere.isTestnet = environment === 'TEST';
  }

  const [chainsRaw, tokensRaw] = await Promise.all([
    db.supportedChain.findMany({
      where: chainWhere,
      select: {
        chainId: true,
        name: true,
        displayName: true,
        nativeCurrencySymbol: true,
        isTestnet: true,
        iconUrl: true,
      },
      orderBy: { displayName: 'asc' },
    }),
    db.supportedToken.findMany({
      where: {
        isEnabled: true,
        chain: tokenChainWhere,
      },
      select: {
        id: true,
        tokenKey: true,
        symbol: true,
        name: true,
        contractAddress: true,
        chainId: true,
        isStablecoin: true,
        iconUrl: true,
        chain: {
          select: {
            displayName: true,
            isTestnet: true,
          },
        },
      },
      orderBy: [{ symbol: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const chains = await Promise.all(
    chainsRaw.map(async (chain) => ({
      ...chain,
      iconUrl: await resolveChainIconUrl(chain),
    })),
  );

  const tokens = await Promise.all(
    tokensRaw.map(async (token) => ({
      id: token.id,
      tokenKey: token.tokenKey,
      symbol: token.symbol,
      name: token.name,
      contractAddress: token.contractAddress,
      chainId: token.chainId,
      chainName: token.chain.displayName,
      isTestnet: token.chain.isTestnet,
      isStablecoin: token.isStablecoin,
      iconUrl: await resolveTokenIconUrl(token),
    })),
  );

  return {
    chains,
    tokens,
    updatedAt: new Date().toISOString(),
  };
}

export async function getChainRegistry() {
  const db = getDatabaseClient();

  const dbChains = await db.supportedChain.findMany({
    select: {
      chainId: true,
      name: true,
      displayName: true,
      explorerUrl: true,
      isTestnet: true,
      nativeCurrencySymbol: true,
      chainType: true,
    },
    orderBy: { displayName: 'asc' },
  });

  const byChainId = mergeChainRegistry(
    dbChains.map((c) => ({
      chainId: c.chainId,
      name: c.name,
      displayName: c.displayName,
      explorerUrl: c.explorerUrl,
      isTestnet: c.isTestnet,
      nativeCurrencySymbol: c.nativeCurrencySymbol,
      chainType: c.chainType,
    })),
  );

  return {
    chains: chainRegistryToArray(byChainId),
    updatedAt: new Date().toISOString(),
  };
}
