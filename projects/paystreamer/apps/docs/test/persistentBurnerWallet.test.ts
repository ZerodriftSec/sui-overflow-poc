import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPersistentBurnerWalletInitializer } from '../lib/persistentBurnerWallet';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

vi.mock('@mysten/wallet-standard', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    getWallets: vi.fn(() => ({
      register: vi.fn(() => () => {})
    }))
  };
});

describe('persistentBurnerWallet', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new keypair if none is stored', () => {
    const initializer = createPersistentBurnerWalletInitializer();
    expect(initializer.id).toBe('persistent-burner-initializer');
    
    const mockNetworks = [{ network: 'localnet' }];
    const getClient = vi.fn().mockReturnValue({ network: 'localnet' });
    
    initializer.initialize({ networks: mockNetworks as any, getClient });
    
    expect(global.localStorage.getItem).toHaveBeenCalledWith('paystreamer_burner_sk');
    expect(global.localStorage.setItem).toHaveBeenCalledWith('paystreamer_burner_sk', expect.any(String));
  });

  it('loads existing keypair if stored', () => {
    const keypair = Ed25519Keypair.generate();
    const secretKey = keypair.getSecretKey();
    
    global.localStorage.getItem = vi.fn().mockReturnValue(secretKey);

    const initializer = createPersistentBurnerWalletInitializer();
    
    const mockNetworks = [{ network: 'localnet' }];
    const getClient = vi.fn().mockReturnValue({ network: 'localnet' });
    
    initializer.initialize({ networks: mockNetworks as any, getClient });
    
    expect(global.localStorage.getItem).toHaveBeenCalledWith('paystreamer_burner_sk');
    expect(global.localStorage.setItem).not.toHaveBeenCalled();
  });
});
