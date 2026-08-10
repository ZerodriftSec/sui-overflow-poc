import { describe, it, expect } from 'vitest';
import { createGraphqlClient } from '../lib/networkRouting';
import { SuiGraphQLClient } from '@mysten/sui/graphql';

describe('networkRouting', () => {
  it('creates client for mainnet', () => {
    const client = createGraphqlClient('mainnet');
    expect(client).toBeInstanceOf(SuiGraphQLClient);
    expect(client.network).toBe('mainnet');
  });

  it('creates client for testnet', () => {
    const client = createGraphqlClient('testnet');
    expect(client.network).toBe('testnet');
  });

  it('creates client for devnet', () => {
    const client = createGraphqlClient('devnet');
    expect(client.network).toBe('devnet');
  });

  it('creates client for local', () => {
    const client = createGraphqlClient('local');
    expect(client.network).toBe('localnet');
  });

  it('falls back to testnet url for unknown network', () => {
    const client = createGraphqlClient('unknown');
    expect(client.network).toBe('unknown');
    // SuiGraphQLClient URL is internal, but we can verify it doesn't throw.
  });
});
