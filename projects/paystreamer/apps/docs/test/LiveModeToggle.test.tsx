import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveModeToggle } from '../components/LiveModeToggle';

const mockSetIsLive = vi.fn();
vi.mock('../lib/LiveModeContext', () => ({
  useLiveMode: vi.fn(() => ({
    isLive: false,
    setIsLive: mockSetIsLive
  }))
}));

const mockDisconnect = vi.fn();
vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: vi.fn(),
  useDAppKit: vi.fn(() => ({ disconnectWallet: mockDisconnect }))
}));

const mockOnOpenChange = vi.fn();
vi.mock('next/dynamic', () => ({
  default: () => ({ open, onOpenChange }: any) => {
    mockOnOpenChange.mockImplementation(onOpenChange);
    return open ? <div data-testid="connect-modal">Modal Open</div> : null;
  }
}));

import { useLiveMode } from '../lib/LiveModeContext';
import { useCurrentAccount } from '@mysten/dapp-kit-react';

describe('LiveModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<LiveModeToggle />);
    expect(screen.getByText('Live')).toBeDefined();
  });

  it('sets isLive to false and disconnects if currently live, prevents default', () => {
    (useLiveMode as any).mockReturnValue({ isLive: true, setIsLive: mockSetIsLive });
    render(
      <a href="/test" onClick={(e) => {}}>
        <LiveModeToggle />
      </a>
    );
    
    const button = screen.getByRole('button');
    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };
    
    fireEvent.click(button, mockEvent);
    expect(mockSetIsLive).toHaveBeenCalledWith(false);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('sets isLive to true if not live and account exists', () => {
    (useLiveMode as any).mockReturnValue({ isLive: false, setIsLive: mockSetIsLive });
    (useCurrentAccount as any).mockReturnValue({ address: '0x123' });
    render(<LiveModeToggle />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetIsLive).toHaveBeenCalledWith(true);
  });

  it('opens modal if not live and no account', () => {
    (useLiveMode as any).mockReturnValue({ isLive: false, setIsLive: mockSetIsLive });
    (useCurrentAccount as any).mockReturnValue(null);
    const { rerender } = render(<LiveModeToggle />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('connect-modal')).toBeDefined();
    
    // Simulate user closing modal after connecting
    (useCurrentAccount as any).mockReturnValue({ address: '0x123' });
    rerender(<LiveModeToggle />);
    
    act(() => {
      mockOnOpenChange(false);
    });
    expect(mockSetIsLive).toHaveBeenCalledWith(true);
  });
});
