import { createContext, useContext, ReactNode, useMemo } from 'react';
import { SuiGraphQLClient } from '@mysten/sui/graphql';

export interface PayStreamerConfig {
  packageId: string;
  registryId: string;
  clockId: string;
  pusdType: string;
  pusdPackageId?: string;
  pusdTreasuryCapId?: string;
  sponsorApiUrl?: string;
  network?: string; // "devnet", "testnet", "mainnet"
  graphqlUrl?: string; // e.g. "https://graphql.testnet.sui.io/graphql"
  graphqlClient?: SuiGraphQLClient;
  isMockMode?: boolean; // Used for UI playgrounds
}

import { Context } from 'react';

const globalKey = Symbol.for("PayStreamerContext");
export const PayStreamerContext: Context<PayStreamerConfig | undefined> = (globalThis as any)[globalKey] || ((globalThis as any)[globalKey] = createContext<PayStreamerConfig | undefined>(undefined));

export interface PayStreamerProviderProps {
  config: PayStreamerConfig;
  children: ReactNode;
}

export function PayStreamerProvider({ config, children }: PayStreamerProviderProps) {
  const finalConfig = useMemo(() => {
    if (config.graphqlClient) return config;
    if (config.graphqlUrl) {
      return {
        ...config,
        graphqlClient: new SuiGraphQLClient({
          url: config.graphqlUrl,
          network: config.network || "testnet",
        }),
      };
    }
    // Fallback default client
    return {
      ...config,
      graphqlClient: new SuiGraphQLClient({
        url: "https://graphql.testnet.sui.io/graphql",
        network: "testnet"
      })
    };
  }, [config]);

  return (
    <PayStreamerContext.Provider value={finalConfig}>
      {children}
    </PayStreamerContext.Provider>
  );
}

export function usePayStreamerConfig(): PayStreamerConfig {
  const context = useContext(PayStreamerContext);
  if (!context) {
    throw new Error('usePayStreamerConfig must be used within a PayStreamerProvider');
  }
  return context;
}
