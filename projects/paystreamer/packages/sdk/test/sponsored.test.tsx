import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';

import { PayStreamerProvider, useSponsoredTransaction } from '../src/react';

const VALID_USER_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000123";

// Mock the dAppKit hooks
let capturedTransaction: any = null;
const mockSignTransaction = vi.fn().mockImplementation(async ({ transaction }: any) => {
  capturedTransaction = transaction;
  return { signature: "user_sig", bytes: "dGVzdF9ieXRlcw==" }; // base64 representation of "test_bytes"
});

vi.mock('@mysten/dapp-kit-react', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useCurrentAccount: () => ({ address: VALID_USER_ADDRESS }),
    useCurrentClient: () => ({
      waitForTransaction: async () => ({}),
    }),
    useDAppKit: () => ({
      signTransaction: mockSignTransaction
    })
  };
});

describe('useSponsoredTransaction Fallback & Sponsor flow', () => {
  const mockGraphqlClient = {
    query: vi.fn().mockImplementation(async () => {
      return {
        data: {
          address: {
            balance: {
              totalBalance: "10000" // Low balance: < 0.1 SUI (triggers sponsor flow)
            }
          }
        }
      };
    }),
    executeTransaction: vi.fn().mockImplementation(async () => {
      return {
        $kind: "Transaction",
        Transaction: { digest: "MOCK_LOCAL_FALLBACK_DIGEST" }
      };
    }),
  };

  const config = {
    packageId: "0x111",
    registryId: "0x222",
    clockId: "0x0000000000000000000000000000000000000000000000000000000000000006",
    pusdType: "0x333::pusd::PUSD",
    sponsorApiUrl: "https://mock-sponsor.api",
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
    vi.restoreAllMocks();
    mockSignTransaction.mockClear();
    mockGraphqlClient.executeTransaction.mockClear();
    mockGraphqlClient.query.mockClear();
  });

  function TestComponent() {
    const { executeSponsored } = useSponsoredTransaction();
    const [result, setResult] = useState<any>(null);

    const handleRun = async () => {
      const tx = new Transaction();
      // Add a dummy move call so transaction has contents
      tx.moveCall({
        target: "0x0000000000000000000000000000000000000000000000000000000000000111::test::func",
        arguments: [],
      });
      const res = await executeSponsored(tx);
      setResult(res);
    };

    return (
      <div>
        <div data-testid="status">{result ? result.status : "Idle"}</div>
        <div data-testid="digest">{result?.digest || "None"}</div>
        <div data-testid="error">{result?.error || "None"}</div>
        <button onClick={handleRun}>Run Transaction</button>
      </div>
    );
  }

  it('should successfully execute sponsored transaction when API returns 200', async () => {
    // Mock successful sponsor API calls
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/prepare')) {
        return {
          ok: true,
          json: async () => ({ bytes: "dGVzdF9ieXRlcw==" }) // base64 encoded bytes
        } as any;
      }
      if (url.includes('/execute')) {
        return {
          ok: true,
          json: async () => ({ digest: "MOCK_SPONSOR_DIGEST" })
        } as any;
      }
      return { ok: false } as any;
    });
    vi.stubGlobal('fetch', mockFetch);

    // Mock Transaction.from to return a transaction object we can sign
    const originalFrom = Transaction.from;
    const mockTx = new Transaction();
    mockTx.setSender(VALID_USER_ADDRESS);
    Transaction.from = vi.fn().mockReturnValue(mockTx);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <TestComponent />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    const button = screen.getByText('Run Transaction');
    button.click();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
      expect(screen.getByTestId('digest').textContent).toBe('MOCK_SPONSOR_DIGEST');
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    Transaction.from = originalFrom;
  });

  it('should trigger local fallback when prepare endpoint returns 500', async () => {
    // Mock prepare returning 500 error
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/prepare')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Internal Server Error" })
        } as any;
      }
      return { ok: false } as any;
    });
    vi.stubGlobal('fetch', mockFetch);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <TestComponent />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    const button = screen.getByText('Run Transaction');
    button.click();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
      expect(screen.getByTestId('digest').textContent).toBe('MOCK_LOCAL_FALLBACK_DIGEST');
    });

    expect(mockSignTransaction).toHaveBeenCalled();
    expect(mockGraphqlClient.executeTransaction).toHaveBeenCalled();
  });

  it('should trigger local fallback when execute endpoint returns 500', async () => {
    // Mock prepare success, execute 500 error
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/prepare')) {
        return {
          ok: true,
          json: async () => ({ bytes: "dGVzdF9ieXRlcw==" })
        } as any;
      }
      if (url.includes('/execute')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Execution Failed" })
        } as any;
      }
      return { ok: false } as any;
    });
    vi.stubGlobal('fetch', mockFetch);

    // Mock Transaction.from
    const originalFrom = Transaction.from;
    const mockTx = new Transaction();
    mockTx.setSender(VALID_USER_ADDRESS);
    Transaction.from = vi.fn().mockReturnValue(mockTx);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <TestComponent />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    const button = screen.getByText('Run Transaction');
    button.click();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
      expect(screen.getByTestId('digest').textContent).toBe('MOCK_LOCAL_FALLBACK_DIGEST');
    });

    expect(mockSignTransaction).toHaveBeenCalled();
    expect(mockGraphqlClient.executeTransaction).toHaveBeenCalled();

    Transaction.from = originalFrom;
  });
});
