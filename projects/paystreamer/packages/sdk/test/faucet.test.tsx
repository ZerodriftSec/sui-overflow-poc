import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';

import { PayStreamerProvider, useMintTestPusd } from '../src/react';
import { TestnetFaucetButton } from '../src/ui';

// Mock the dAppKit hooks
let capturedTransaction: Transaction | null = null;
vi.mock('@mysten/dapp-kit-react', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useCurrentAccount: () => ({ address: "0x0000000000000000000000000000000000000000000000000000000000000123" }),
    useCurrentClient: () => ({
      waitForTransaction: async () => ({}),
    }),
    useDAppKit: () => ({
      signTransaction: async ({ transaction }: any) => {
        capturedTransaction = transaction;
        return { signature: "mock_sig", bytes: new Uint8Array() };
      }
    })
  };
});

describe('SDK Faucet Utilities', () => {
  const mockGraphqlClient = {
    query: vi.fn().mockImplementation(async () => {
      return {
        data: {
          address: {
            balance: {
              totalBalance: "1000000000" // 1 SUI (local execution path)
            }
          }
        }
      };
    }),
    executeTransaction: vi.fn().mockImplementation(async () => {
      return {
        $kind: "Transaction",
        Transaction: { digest: "MOCK_FAUCET_DIGEST" }
      };
    }),
  };

  const MOCK_PUSD_PACKAGE_ID = "0x0000000000000000000000000000000000000000000000000000000000000abc";
  const MOCK_TREASURY_CAP_ID = "0x0000000000000000000000000000000000000000000000000000000000000def";

  const config = {
    packageId: "0x0000000000000000000000000000000000000000000000000000000000000111",
    registryId: "0x0000000000000000000000000000000000000000000000000000000000000222",
    clockId: "0x0000000000000000000000000000000000000000000000000000000000000006",
    pusdType: `${MOCK_PUSD_PACKAGE_ID}::pusd::PUSD`,
    pusdPackageId: MOCK_PUSD_PACKAGE_ID,
    pusdTreasuryCapId: MOCK_TREASURY_CAP_ID,
    graphqlClient: mockGraphqlClient as any,
  };

  const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });

  afterEach(() => {
    cleanup();
    capturedTransaction = null;
  });

  function FaucetTestComponent() {
    const { mint, isLoading, error } = useMintTestPusd();
    const [digest, setDigest] = useState<string | null>(null);

    return (
      <div>
        <div data-testid="loading">{isLoading ? "Loading" : "Idle"}</div>
        <div data-testid="error">{error || "None"}</div>
        <div data-testid="digest">{digest || "None"}</div>
        <button onClick={async () => {
          const res = await mint(50_000_000_000n); // mint 50 PUSD
          if (res) setDigest(res);
        }}>
          Mint Test Tokens
        </button>
      </div>
    );
  }

  it('should build the faucet transaction with correct parameters', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <FaucetTestComponent />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Mint Test Tokens'));

    await waitFor(() => {
      expect(screen.getByTestId('digest').textContent).toBe('MOCK_FAUCET_DIGEST');
    });

    expect(capturedTransaction).not.toBeNull();
    const txData = capturedTransaction!.getData();
    
    // Check that we have a move call inside the transaction
    const callCommand = txData.commands.find((c: any) => c.$kind === 'MoveCall' || c.kind === 'MoveCall');
    expect(callCommand).toBeDefined();
    
    const moveCall = callCommand.$kind === 'MoveCall' ? callCommand.MoveCall : callCommand;
    expect(moveCall.package).toBe(MOCK_PUSD_PACKAGE_ID);
    expect(moveCall.module).toBe('pusd');
    expect(moveCall.function).toBe('mint');
    expect(moveCall.typeArguments).toEqual([]);
  });

  it('should render the TestnetFaucetButton and execute successfully', async () => {
    const queryClient = createTestQueryClient();
    const handleSuccess = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <TestnetFaucetButton 
            amountMist={100_000_000_000n}
            onSuccess={handleSuccess}
          />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Mint 100 PUSD/i }));

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith('MOCK_FAUCET_DIGEST');
    });

    expect(capturedTransaction).not.toBeNull();
    const txData = capturedTransaction!.getData();
    const callCommand = txData.commands.find((c: any) => c.$kind === 'MoveCall' || c.kind === 'MoveCall');
    const moveCall = callCommand.$kind === 'MoveCall' ? callCommand.MoveCall : callCommand;
    expect(moveCall.package).toBe(MOCK_PUSD_PACKAGE_ID);
    expect(moveCall.module).toBe('pusd');
    expect(moveCall.function).toBe('mint');
  });
});
