import { gqlClient, grpcClient } from '../lib/sui.js';
import { PACKAGE_ID } from '../lib/config.js';

export interface DiscoveredPlatform {
  platformId: string;
}

export interface DiscoveredSubscription {
  accountId: string;
  platformId: string;
  nextBillingTime: bigint;
  denomination: string;
}

export async function discoverPlatforms(): Promise<DiscoveredPlatform[]> {
  console.log('[Discovery] Discovering platforms from PlatformRegistered events...');
  
  try {
    const platformRegisteredEventType = `${PACKAGE_ID}::platform::PlatformRegistered`;
    
    const query = `
      query getPlatformEvents($eventType: String!) {
        events(filter: { type: $eventType }, last: 50) {
          nodes {
            contents {
              json
            }
          }
        }
      }
    `;
    
    const result = await gqlClient.query({
      query,
      variables: { eventType: platformRegisteredEventType }
    });
    
    const platforms: DiscoveredPlatform[] = [];
    const nodes = (result.data as any)?.events?.nodes || [];
    
    for (const node of nodes) {
      const json = node.contents?.json;
      if (json && (json.platform_id || json.id)) {
        platforms.push({ platformId: json.platform_id || json.id });
      }
    }
    
    console.log(`[Discovery] Discovered ${platforms.length} platforms`);
    return platforms;
  } catch (error) {
    console.error('[Discovery] Error discovering platforms:', error);
    return [];
  }
}

export async function discoverSubscriptions(platformId: string): Promise<DiscoveredSubscription[]> {
  try {
    const subscriptionCreatedEventType = `${PACKAGE_ID}::billing::SubscriptionCreated`;
    
    const query = `
      query getSubEvents($eventType: String!) {
        events(filter: { type: $eventType }, last: 50) {
          nodes {
            contents {
              json
            }
          }
        }
      }
    `;
    
    const result = await gqlClient.query({
      query,
      variables: { eventType: subscriptionCreatedEventType }
    });
    
    const accountIds = new Set<string>();
    const nodes = (result.data as any)?.events?.nodes || [];
    
    for (const node of nodes) {
      const json = node.contents?.json;
      if (json && json.platform_id === platformId && json.account_id) {
        accountIds.add(json.account_id);
      }
    }
    
    if (accountIds.size === 0) return [];
    
    const accountIdsArray = Array.from(accountIds);
    const subscriptions: DiscoveredSubscription[] = [];
    
    const BATCH_SIZE = 50;
    for (let i = 0; i < accountIdsArray.length; i += BATCH_SIZE) {
      const batchIds = accountIdsArray.slice(i, i + BATCH_SIZE);
      
      try {
        const objects = await grpcClient.core.getObjects({
          objectIds: batchIds,
          include: { json: true }
        });
        
        for (const obj of objects.objects) {
          if (obj instanceof Error || !('json' in obj) || !obj.json) continue;
          
          const accountId = obj.objectId;
          const typeStr = obj.type || '';
          
          const match = typeStr.match(/<(.+)>/);
          const denomination = match ? match[1] : '';
          if (!denomination) continue;
          
          const fields = obj.json as any;
          const subscriptionsMap = fields.subscriptions?.fields?.contents || [];
          
          const platformSub = subscriptionsMap.find((entry: any) => entry.fields.key === platformId);
          if (platformSub) {
            const subData = platformSub.fields.value.fields;
            if (subData.status === 0) { // Active
              subscriptions.push({
                accountId,
                platformId,
                nextBillingTime: BigInt(subData.next_billing_time),
                denomination
              });
            }
          }
        }
      } catch (err) {
        console.error(`[Discovery] Error fetching objects batch:`, err);
      }
    }
    
    return subscriptions;
  } catch (error) {
    console.error(`[Discovery] Error discovering subscriptions for ${platformId}:`, error);
    return [];
  }
}

export async function getCurrentTime(): Promise<bigint> {
  try {
    const clockObject = await grpcClient.core.getObject({
      objectId: '0x6',
      include: { json: true }
    });
    
    if (clockObject.object?.json) {
      const content = clockObject.object.json as { timestamp_ms?: string | number };
      return BigInt(content.timestamp_ms || 0);
    }
    return BigInt(Date.now());
  } catch (error) {
    console.error('[Discovery] Error getting clock time:', error);
    return BigInt(Date.now());
  }
}

export function filterDueSubscriptions(
  subscriptions: DiscoveredSubscription[],
  currentTime: bigint
): DiscoveredSubscription[] {
  return subscriptions.filter(sub => sub.nextBillingTime <= currentTime);
}
