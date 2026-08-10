import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PayStreamerProvider } from '../src/react';
import { SetupSubscriptionModal, PayStreamerThemeProvider } from '../src/ui';
import { NETWORK_CONFIGS, NETWORK } from "../src/constants";

const activeConfig = NETWORK_CONFIGS[NETWORK];

// Mock the dAppKit hooks
vi.mock('@mysten/dapp-kit-react', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useCurrentAccount: () => ({ address: "0x123" }),
    useCurrentClient: () => ({
      waitForTransaction: async () => ({}),
    }),
    useDAppKit: () => ({
      signTransaction: async () => {
        return { signature: "mock", bytes: new Uint8Array() };
      }
    })
  };
});

describe('React SDK UI Components E2E', () => {
  let mockPusdBalance = 50000000000n; // 50 PUSD by default

  const mockGraphqlClient = {
    query: vi.fn().mockImplementation(async ({ query, variables }: any) => {
      if (query.includes('GetPlatform')) {
        return {
          data: {
            object: {
              asMoveObject: {
                contents: {
                  json: {
                    id: variables.id,
                    name: "Test Platform",
                    tiers: [
                      {
                        name: "Premium",
                        amount: "10000000000", // 10 PUSD
                        frequency: "2592000000", // 30 days in ms
                        subscriber_count: 5,
                        is_active: true
                      }
                    ]
                  }
                }
              },
              owner: {
                initialSharedVersion: 1
              }
            }
          }
        };
      }
      if (query.includes('GetAccountCap')) {
        return {
          data: {
            address: {
              objects: {
                nodes: []
              }
            }
          }
        };
      }
      if (query.includes('GetPusdBalance')) {
        return {
          data: {
            address: {
              balance: {
                totalBalance: mockPusdBalance.toString()
              }
            }
          }
        };
      }
      return { data: {} };
    }),
    executeTransaction: vi.fn(),
  };

  const config = {
    packageId: activeConfig.PACKAGE_ID,
    registryId: activeConfig.COIN_TYPE_REGISTRY_ID,
    clockId: "0x0000000000000000000000000000000000000000000000000000000000000006",
    pusdType: activeConfig.PUSD_TYPE_ARG,
    network: NETWORK,
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
  });


  it('should render the SetupSubscriptionModal with sufficient balance', async () => {
    mockPusdBalance = 50000000000n; // 50 PUSD
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <SetupSubscriptionModal 
            isOpen={true}
            onClose={() => {}}
            platformId={activeConfig.DEMO_PLATFORM_ID}
            tierIndex={0}
          />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Setup Subscription')).toBeDefined();
      expect(screen.getByText('10.00 PUSD')).toBeDefined();
      const subscribeBtn = screen.getByRole('button', { name: /Setup & Subscribe/i });
      expect(subscribeBtn).toBeDefined();
      expect(subscribeBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('should render the SetupSubscriptionModal with insufficient balance and disable button', async () => {
    mockPusdBalance = 5000000000n; // 5 PUSD (Required is 30 PUSD recommended, or at least 10 PUSD minimum)
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <SetupSubscriptionModal 
            isOpen={true}
            onClose={() => {}}
            platformId={activeConfig.DEMO_PLATFORM_ID}
            tierIndex={0}
          />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Insufficient PUSD in your wallet to fund this deposit.')).toBeDefined();
      const subscribeBtn = screen.getByRole('button', { name: /Setup & Subscribe/i });
      expect(subscribeBtn).toBeDefined();
      expect(subscribeBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  it('should apply custom theme styles to the modal wrapper when passed via props', async () => {
    mockPusdBalance = 50000000000n;
    const queryClient = createTestQueryClient();
    const customTheme = {
      primary: '#ff0000',
      background: '#00ff00',
      radius: '16px'
    };

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <SetupSubscriptionModal 
            isOpen={true}
            onClose={() => {}}
            platformId={activeConfig.DEMO_PLATFORM_ID}
            tierIndex={0}
            theme={customTheme}
          />
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Setup Subscription')).toBeDefined();
    });

    const modalWrapper = screen.getByText('Setup Subscription').closest('.fixed') as HTMLElement;
    expect(modalWrapper).not.toBeNull();
    expect(modalWrapper.style.getPropertyValue('--color-primary')).toBe('#ff0000');
    expect(modalWrapper.style.getPropertyValue('--primary')).toBe('#ff0000');
    expect(modalWrapper.style.getPropertyValue('--color-background')).toBe('#00ff00');
    expect(modalWrapper.style.getPropertyValue('--radius-xl')).toBe('16px');
  });

  it('should apply custom theme styles to the modal wrapper when passed via context', async () => {
    mockPusdBalance = 50000000000n;
    const queryClient = createTestQueryClient();
    const contextTheme = {
      primary: '#0000ff',
      card: '#f0f0f0',
      radius: '8px'
    };

    render(
      <QueryClientProvider client={queryClient}>
        <PayStreamerProvider config={config}>
          <PayStreamerThemeProvider theme={contextTheme}>
            <SetupSubscriptionModal 
              isOpen={true}
              onClose={() => {}}
              platformId={activeConfig.DEMO_PLATFORM_ID}
              tierIndex={0}
            />
          </PayStreamerThemeProvider>
        </PayStreamerProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Setup Subscription')).toBeDefined();
    });

    const modalWrapper = screen.getByText('Setup Subscription').closest('.fixed') as HTMLElement;
    expect(modalWrapper).not.toBeNull();
    expect(modalWrapper.style.getPropertyValue('--color-primary')).toBe('#0000ff');
    expect(modalWrapper.style.getPropertyValue('--primary')).toBe('#0000ff');
    expect(modalWrapper.style.getPropertyValue('--color-card')).toBe('#f0f0f0');
    expect(modalWrapper.style.getPropertyValue('--radius-xl')).toBe('8px');
  });
});
