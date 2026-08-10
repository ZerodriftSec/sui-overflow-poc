import { describe, it, expect, beforeAll } from 'vitest';
import { 
  queryPlatform, 
  queryPlatformRegisteredEvents, 
  queryCoinTypeRegistry,
  queryPaymentScheduler
} from '../src/core/graphql';
import { NETWORK_CONFIGS } from '../src/constants';

const skipLocalnet = (!!process.env.CI && !process.env.ENABLE_LOCALNET_TESTS) || process.env.SKIP_LOCALNET === 'true';

describe.skipIf(skipLocalnet)('GraphQL Core E2E (Localnet)', () => {
  const activeConfig = NETWORK_CONFIGS['local'];

  it('should fetch the coin type registry', async () => {
    const registry = await queryCoinTypeRegistry(activeConfig.COIN_TYPE_REGISTRY_ID, 'local');
    expect(registry).toBeDefined();
    expect(registry.version).toBeDefined();
  });

  it('should fetch the payment scheduler', async () => {
    const scheduler = await queryPaymentScheduler(activeConfig.PAYMENT_SCHEDULER_ID, 'local');
    expect(scheduler).toBeDefined();
    expect(scheduler.initialSharedVersion).toBeGreaterThan(0);
  });

  it('should fetch platform registered events on localnet', async () => {
    const events = await queryPlatformRegisteredEvents('local');
    expect(Array.isArray(events)).toBe(true);
    // Since the seeder ran, we should have at least the demo platform registered!
    expect(events.length).toBeGreaterThanOrEqual(1);
    
    // We can use the first discovered platform to test queryPlatform
    const platformId = events[0].platform_id;
    const platform = await queryPlatform(platformId, 'local');
    
    expect(platform).toBeDefined();
    expect(platform.name).toBeDefined();
    expect(platform.owner).toBeDefined();
  });

});
