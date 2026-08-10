import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverPlatforms, discoverSubscriptions, filterDueSubscriptions, getCurrentTime } from '../src/scheduler/discovery.js';
import { gqlClient, grpcClient } from '../src/lib/sui.js';

vi.mock('../src/lib/sui.js', () => ({
  gqlClient: {
    query: vi.fn()
  },
  grpcClient: {
    core: {
      getObjects: vi.fn(),
      getObject: vi.fn()
    }
  }
}));

vi.mock('../src/lib/config.js', () => ({
  PACKAGE_ID: '0xmock'
}));

describe('discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discoverPlatforms parses graphql nodes correctly and checks last: 50', async () => {
    (gqlClient.query as any).mockResolvedValueOnce({
      data: {
        events: {
          nodes: [
            { contents: { json: { platform_id: '0x1' } } },
            { contents: { json: { id: '0x2' } } },
            { contents: null }
          ]
        }
      }
    });

    const platforms = await discoverPlatforms();
    expect(platforms).toEqual([
      { platformId: '0x1' },
      { platformId: '0x2' }
    ]);
    expect(gqlClient.query).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('last: 50')
    }));
  });

  it('discoverSubscriptions filters by status 0 and correct denomination', async () => {
    (gqlClient.query as any).mockResolvedValueOnce({
      data: {
        events: {
          nodes: [
            { contents: { json: { platform_id: '0x1', account_id: 'acc1' } } }
          ]
        }
      }
    });

    (grpcClient.core.getObjects as any).mockResolvedValueOnce({
      objects: [
        {
          objectId: 'acc1',
          type: '0xmock::account::Account<0xcoin::COIN>',
          json: {
            subscriptions: {
              fields: {
                contents: [
                  {
                    fields: {
                      key: '0x1',
                      value: {
                        fields: {
                          status: 0,
                          next_billing_time: '1000'
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    });

    const subs = await discoverSubscriptions('0x1');
    expect(subs).toEqual([
      {
        accountId: 'acc1',
        platformId: '0x1',
        nextBillingTime: 1000n,
        denomination: '0xcoin::COIN'
      }
    ]);
  });

  it('filterDueSubscriptions correctly filters based on time', () => {
    const subs = [
      { accountId: '1', platformId: 'p', nextBillingTime: 500n, denomination: 'd' },
      { accountId: '2', platformId: 'p', nextBillingTime: 1000n, denomination: 'd' },
      { accountId: '3', platformId: 'p', nextBillingTime: 1500n, denomination: 'd' },
    ];
    
    const due = filterDueSubscriptions(subs, 1000n);
    expect(due).toHaveLength(2);
    expect(due.map(d => d.accountId)).toEqual(['1', '2']);
  });
});
