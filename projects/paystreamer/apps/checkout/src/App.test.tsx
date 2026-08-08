import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';


vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => null,
  useCurrentNetwork: () => 'testnet',
  DAppKitProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock('@mysten/dapp-kit-react/ui', () => ({
  ConnectModal: () => <div data-testid="connect-modal"></div>,
}));

vi.mock('@paystreamer/sdk/react', () => ({
  PayStreamerProvider: ({ children }: any) => <>{children}</>,
  usePlatform: () => ({ data: null, isLoading: true }),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class {},
  QueryClientProvider: ({ children }: any) => <>{children}</>,
}));

describe('Checkout App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeDefined();
  });
});
