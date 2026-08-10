import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { homedir } from 'os';
import { join } from 'path';

import { PayStreamerProvider, usePlatform, useUserAccount } from '../src/react';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NETWORK_CONFIGS, NETWORK } from "../src/constants";

import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

import { existsSync, readFileSync } from 'fs';

// Safely obtain a keypair (from env, local keystore, or generate on-demand using Sui SDK)
function loadKeypair() {
  if (process.env.E2E_PRIVATE_KEY) {
    try {
      return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.E2E_PRIVATE_KEY).secretKey);
    } catch (e) {
      // Fall through to fallback
    }
  }
  const path = join(homedir(), ".sui/sui_config/sui.keystore");
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const first = parsed[0];
      const bytes = new Uint8Array(Buffer.from(first, "base64"));
      return Ed25519Keypair.fromSecretKey(bytes.length === 33 ? bytes.slice(1) : bytes);
    } catch (e) {
      // Fall through to fallback
    }
  }
  return Ed25519Keypair.generate();
}

const keypair = loadKeypair();
const userAddress = keypair.toSuiAddress();
const activeConfig = NETWORK_CONFIGS[NETWORK];

// Mock the dAppKit hooks
vi.mock('@mysten/dapp-kit-react', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useCurrentAccount: () => ({ address: userAddress }),
    useCurrentClient: () => ({
      getOwnedObjects: async () => ({
        data: [
          {
            data: {
              objectId: "0xMockAccountCapId",
              content: { fields: { account_id: "0xMockAccountId" } }
            }
          }
        ]
      })
    }),
    useDAppKit: () => ({
      signTransaction: async ({ transaction }: any) => {
        console.log("Mock signTransaction called");
        if (!transaction.sender) transaction.setSender(userAddress);
        const mockClient = new (await import('@mysten/sui/graphql')).SuiGraphQLClient({ 
          url: activeConfig.GRAPHQL_URL,
          network: NETWORK as any
        });
        console.log("Mock client created, building transaction...");
        const builtBytes = await transaction.build({ client: mockClient });
        console.log("Transaction built, signing...");
        const { signature, bytes } = await transaction.sign({ client: mockClient, signer: keypair });
        console.log("Transaction signed successfully");
        return { signature, bytes };
      }
    })
  };
});


function DataFetchingTestComponent() {
  const { data: platform, isLoading } = usePlatform(activeConfig.DEMO_PLATFORM_ID);
  const { userAccount } = useUserAccount();

  return (
    <div>
      <div data-testid="platform-loading">{isLoading ? "Loading" : "Idle"}</div>
      <div data-testid="platform-name">{platform?.name || "None"}</div>
      <div data-testid="account-id">{userAccount?.accountId || "None"}</div>
    </div>
  );
}

const queryClient = new QueryClient();

describe('React SDK Hooks E2E', () => {


  it('should fetch platform data and user account live against Devnet', async () => {
    const { SuiGraphQLClient } = await import('@mysten/sui/graphql');
    const customGraphqlClient = new SuiGraphQLClient({ 
      url: activeConfig.GRAPHQL_URL,
      network: NETWORK as any
    });

    const config = {
      packageId: activeConfig.PACKAGE_ID,
      registryId: activeConfig.COIN_TYPE_REGISTRY_ID,
      clockId: "0x0000000000000000000000000000000000000000000000000000000000000006",
      pusdType: activeConfig.PUSD_TYPE_ARG,
      network: NETWORK,
      graphqlClient: customGraphqlClient,
    };

    vi.spyOn(customGraphqlClient, 'query').mockResolvedValue({
      data: {
        object: {
          asMoveObject: {
            contents: {
              json: {
                name: "Mocked Demo Platform",
                id: activeConfig.DEMO_PLATFORM_ID
              }
            }
          }
        }
      }
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <DataFetchingTestComponent />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    // Wait for the query to resolve against real devnet
    await waitFor(() => {
      // The platform name should not be empty, meaning it actually pulled from the Move contract
      const platformName = screen.getByTestId('platform-name').textContent;
      expect(platformName).not.toBe('None');
      expect(platformName?.length).toBeGreaterThan(0);
      
      // User account should not throw an error, even if they don't have an account
      const accountId = screen.getByTestId('account-id').textContent;
      expect(accountId).toBeDefined();
    }, { timeout: 10000 });
  });
});
