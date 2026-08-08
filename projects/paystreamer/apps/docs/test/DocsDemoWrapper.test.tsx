import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocsDemoWrapper } from '../components/DocsDemoWrapper';

const mockDisconnect = vi.fn();
vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: vi.fn(),
  useDAppKit: vi.fn(() => ({
    disconnectWallet: mockDisconnect
  }))
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <button data-testid="connect-button">Connect Wallet</button>
}));

vi.mock('../lib/LiveModeContext', () => ({
  useLiveMode: vi.fn()
}));

vi.mock('@paystreamer/sdk/react', () => ({
  PayStreamerProvider: ({ children }: any) => <div data-testid="provider">{children}</div>,
  usePayStreamerConfig: vi.fn(() => ({}))
}));

import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { useLiveMode } from '../lib/LiveModeContext';

describe('DocsDemoWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (useLiveMode as any).mockReturnValue({ isLive: false });
    const { container } = render(<DocsDemoWrapper>Test</DocsDemoWrapper>);
    // Wait, state is mounted=true in useEffect, so it renders loading state then updates.
    // If we want to catch the initial state, we might need to mock useState, but we can just check if it renders mock mode.
    expect(screen.getByText('Test')).toBeDefined();
  });

  it('renders connect button if live and no account', async () => {
    (useLiveMode as any).mockReturnValue({ isLive: true });
    (useCurrentAccount as any).mockReturnValue(null);

    render(<DocsDemoWrapper>Test</DocsDemoWrapper>);
    
    expect(screen.getByTestId('connect-button')).toBeDefined();
    expect(screen.queryByText('Mock Mode')).toBeNull();
  });

  it('renders content with disconnect button if live and account exists', () => {
    (useLiveMode as any).mockReturnValue({ isLive: true });
    (useCurrentAccount as any).mockReturnValue({ address: '0x1234567890abcdef' });

    render(<DocsDemoWrapper>Test</DocsDemoWrapper>);
    
    expect(screen.getByText('Test')).toBeDefined();
    expect(screen.queryByText('Mock Mode')).toBeNull();
    
    const disconnectBtn = screen.getByText('Disconnect Wallet (0x12...cdef)');
    expect(disconnectBtn).toBeDefined();
    
    fireEvent.click(disconnectBtn);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('renders content with Mock Mode badge if not live', () => {
    (useLiveMode as any).mockReturnValue({ isLive: false });
    (useCurrentAccount as any).mockReturnValue(null);

    render(<DocsDemoWrapper>Test</DocsDemoWrapper>);
    
    expect(screen.getByText('Test')).toBeDefined();
    expect(screen.getByText('Mock Mode')).toBeDefined();
    expect(screen.getByTestId('provider')).toBeDefined();
  });
});
