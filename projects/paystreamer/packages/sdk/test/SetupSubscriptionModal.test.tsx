import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SetupSubscriptionModal } from '../src/ui/SetupSubscriptionModal';
import * as provider from '../src/react/provider';

// Mock the React hooks used inside the modal
vi.mock('../src/react/usePlatform', () => ({
  usePlatform: vi.fn(() => ({
    data: {
      tiers: [
        { amount: '10000000000', frequency: '60000' } // 10 PUSD
      ]
    },
    isLoading: false
  }))
}));

vi.mock('../src/react/useUserAccount', () => ({
  useUserAccount: vi.fn(() => ({
    userAccount: { balance: 0n, accountId: 'acc_123', accountCapId: 'cap_123' },
    isLoading: false
  }))
}));

const mockBalance = vi.fn().mockReturnValue(100000000000n);
vi.mock('../src/react/usePusdBalance', () => ({
  usePusdBalance: vi.fn(() => ({
    get data() { return mockBalance(); },
    isLoading: false
  }))
}));

const mockSubscribe = vi.fn();
vi.mock('../src/react/useSubscribe', () => ({
  useSubscribe: vi.fn(() => ({
    subscribe: mockSubscribe,
    isLoading: false,
    error: null,
    recommendedDeposit: 10000000000n,
    hasAccount: true
  }))
}));

vi.mock('../src/ui/ThemeContext', () => ({
  useThemeStyles: vi.fn(() => ({}))
}));

describe('SetupSubscriptionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBalance.mockReturnValue(100000000000n); // 100 PUSD default
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly and shows Wallet Balance in Live Mode', () => {
    vi.spyOn(provider, 'usePayStreamerConfig').mockReturnValue({ isMockMode: false } as any);

    render(
      <SetupSubscriptionModal 
        isOpen={true} 
        onClose={() => {}} 
        platformId="plat_123" 
        tierIndex={0} 
      />
    );
    expect(screen.getByText('Fill Up & Subscribe')).toBeDefined();
    // 10 PUSD tier amount
    expect(screen.getAllByText('10.00 PUSD').length).toBeGreaterThan(0);
    // Should show Wallet Balance
    expect(screen.getByText('Wallet Balance')).toBeDefined();
  });

  it('hides Wallet Balance in Mock Mode', () => {
    vi.spyOn(provider, 'usePayStreamerConfig').mockReturnValue({ isMockMode: true } as any);

    render(
      <SetupSubscriptionModal 
        isOpen={true} 
        onClose={() => {}} 
        platformId="plat_123" 
        tierIndex={0} 
      />
    );
    expect(screen.queryByText('Wallet Balance')).toBeNull();
  });

  it('shows Insufficient PUSD warning in Live Mode when balance is low', () => {
    vi.spyOn(provider, 'usePayStreamerConfig').mockReturnValue({ isMockMode: false } as any);
    mockBalance.mockReturnValue(0n); // 0 PUSD

    render(
      <SetupSubscriptionModal 
        isOpen={true} 
        onClose={() => {}} 
        platformId="plat_123" 
        tierIndex={0} 
      />
    );
    expect(screen.getByText('Insufficient PUSD in your wallet to fund this deposit.')).toBeDefined();
    const button = screen.getByRole('button', { name: 'Subscribe' });
    expect(button).toHaveProperty('disabled', true);
  });

  it('does not render when isOpen is false', () => {
    vi.spyOn(provider, 'usePayStreamerConfig').mockReturnValue({ isMockMode: false } as any);
    const { container } = render(
      <SetupSubscriptionModal 
        isOpen={false} 
        onClose={() => {}} 
        platformId="plat_123" 
        tierIndex={0} 
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls subscribe and shows success when submit button is clicked', async () => {
    vi.spyOn(provider, 'usePayStreamerConfig').mockReturnValue({ isMockMode: false } as any);
    mockSubscribe.mockResolvedValueOnce('digest_123');
    
    render(
      <SetupSubscriptionModal 
        isOpen={true} 
        onClose={() => {}} 
        platformId="plat_123" 
        tierIndex={0} 
      />
    );
    
    const button = screen.getByRole('button', { name: 'Subscribe' });
    fireEvent.click(button);
    
    expect(mockSubscribe).toHaveBeenCalledWith(10000000000n);
    
    await waitFor(() => {
      expect(screen.getByText("You're Subscribed!")).toBeDefined();
    });
  });
});
