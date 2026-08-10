import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { getConfig, SupportedNetwork } from "../constants";

const clients = new Map<SupportedNetwork, SuiGraphQLClient>();

export function getGraphQLClient(network?: SupportedNetwork) {
  const target = network || "testnet";
  if (!clients.has(target)) {
    clients.set(target, new SuiGraphQLClient({
      url: getConfig(target).GRAPHQL_URL,
      network: target as any,
    }));
  }
  return clients.get(target)!;
}

export interface PlatformObject {
  id: string;
  owner: string;
  name: string;
  description: string;
  category: string;
  image_url: string | null;
  is_paused: boolean;
  created_at: number;
}

export interface SubscriptionAccountObject {
  id: string;
  owner: string;
  paused: boolean;
  closed: boolean;
  address_balance: string;
}

export interface CoinTypeRegistryObject {
  id: string;
  version: number;
}

export interface PlatformVersionInfo {
  objectId: string;
  initialSharedVersion: number;
}

export interface PaymentSchedulerObject {
  id: string;
  initialSharedVersion: number;
  is_paused: boolean;
  min_gas_budget: string;
  last_processed_at?: string;
}

export interface PlatformRegisteredEvent {
  platform_id: string;
  owner: string;
  name: string;
  timestamp: number;
}

export interface AccountCreatedEvent {
  account_id: string;
  cap_id: string;
  owner: string;
  timestamp: number;
}

export interface SubscriptionCreatedEvent {
  subscription_id: string;
  account_id: string;
  platform_id: string;
  tier_index: number;
  amount: string;
  frequency_ms: string;
  timestamp: number;
}

export interface PaymentProcessedEvent {
  id: string;
  account_id: string;
  platform_id: string;
  amount: string;
  timestamp: number;
}

export interface SubscriptionUpdatedEvent {
  id?: string;
  account_id: string;
  platform_id: string;
  change_kind: number;
  timestamp: number;
}

export interface PaymentFailedEvent {
  id: string;
  account_id: string;
  platform_id: string;
  reason: string;
  timestamp: number;
}

export interface DepositEvent {
  id: string;
  account_id: string;
  amount: string;
  timestamp: number;
}

async function executeQuery<T>(query: string, variables?: Record<string, unknown>, network?: SupportedNetwork): Promise<T> {
  const client = getGraphQLClient(network);
  const result = await client.query({ query, variables });
  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }
  return (result.data || {}) as T;
}

function parseEventTimestamp(node: any): number {
  const jsonTs = node.contents?.json?.timestamp || node.contents?.json?.timestamp_ms;
  if (jsonTs) return Number(jsonTs);
  if (node.timestamp) return new Date(node.timestamp).getTime();
  return Date.now();
}

export async function queryPlatform(platformId: string, network?: SupportedNetwork): Promise<PlatformObject> {
  const data = await executeQuery<{ object: { asMoveObject: { contents: { json: PlatformObject } }, owner: { initialSharedVersion: number } } }>(
    `query GetPlatform($id: SuiAddress!) {
      object(address: $id) {
        asMoveObject { contents { json } }
        owner { ... on Shared { initialSharedVersion } }
      }
    }`,
    { id: platformId },
    network
  );
  return data.object.asMoveObject.contents.json;
}

export async function queryMultiplePlatforms(platformIds: string[], network?: SupportedNetwork): Promise<Array<{ objectId: string, initialSharedVersion: number, json: any }>> {
  if (platformIds.length === 0) return [];

  const query = `
    query GetPlatforms {
      ${platformIds.map((id, index) => `
        obj${index}: object(address: "${id}") {
          address
          owner {
            ... on Shared {
              initialSharedVersion
            }
          }
          asMoveObject { contents { json } }
        }
      `).join("\\n")}
    }
  `;

  const data = await executeQuery<Record<string, any>>(query, {}, network);
  const objects = Object.values(data || {}).filter(Boolean) as any[];

  return objects.map((obj: any) => {
    const json = obj.asMoveObject?.contents?.json || {};
    let parsedTiers = [];

    if (json.tiers && Array.isArray(json.tiers)) {
      parsedTiers = json.tiers;
    } else if (json.tiers?.contents && Array.isArray(json.tiers.contents)) {
      parsedTiers = json.tiers.contents.map((t: any) => {
        const val = t.value || {};
        let frequency = val.frequency || val.frequency_ms || "monthly";
        
        if (frequency === "86400000") frequency = "daily";
        else if (frequency === "604800000") frequency = "weekly";
        else if (frequency === "2592000000") frequency = "monthly";
        else if (frequency === "31536000000") frequency = "yearly";

        return {
          name: val.name || "",
          amount: val.amount || "0",
          frequency,
          subscriber_count: parseInt(val.subscriber_count || "0", 10),
          is_active: val.is_active ?? true,
        };
      });
    }

    return {
      objectId: obj.address,
      initialSharedVersion: obj.owner?.initialSharedVersion ?? 0,
      json: {
        ...json,
        tiers: parsedTiers,
      },
    };
  });
}

export async function queryAccount(accountId: string, network?: SupportedNetwork): Promise<SubscriptionAccountObject> {
  const data = await executeQuery<{ object: { asMoveObject: { contents: { json: SubscriptionAccountObject } } } }>(
    `query GetAccount($id: SuiAddress!) {
      object(address: $id) {
        asMoveObject { contents { json } }
      }
    }`,
    { id: accountId },
    network
  );
  return data.object.asMoveObject.contents.json;
}

export async function queryCoinTypeRegistry(registryId: string, network?: SupportedNetwork): Promise<CoinTypeRegistryObject> {
  const data = await executeQuery<{ object: { asMoveObject: { contents: { json: CoinTypeRegistryObject } } } }>(
    `query GetRegistry($id: SuiAddress!) {
      object(address: $id) {
        asMoveObject { contents { json } }
      }
    }`,
    { id: registryId },
    network
  );
  return data.object.asMoveObject.contents.json;
}

export async function queryPaymentScheduler(schedulerId: string, network?: SupportedNetwork): Promise<PaymentSchedulerObject> {
  const data = await executeQuery<{ object: { asMoveObject: { contents: { json: PaymentSchedulerObject } }, owner: { initialSharedVersion: number } } }>(
    `query GetScheduler($id: SuiAddress!) {
      object(address: $id) {
        asMoveObject { contents { json } }
        owner { ... on Shared { initialSharedVersion } }
      }
    }`,
    { id: schedulerId },
    network
  );
  return {
    ...data.object.asMoveObject.contents.json,
    initialSharedVersion: data.object.owner?.initialSharedVersion ?? 0,
  };
}

export async function queryPlatformInitialVersions(
  platformIds: string[],
): Promise<PlatformVersionInfo[]> {
  if (platformIds.length === 0) return [];
  
  const results = await Promise.all(
    platformIds.map(async (id) => {
      const data = await executeQuery<{ object: { owner: { initialSharedVersion: number } | null } }>(
        `query GetPlatformVersion($id: SuiAddress!) {
          object(address: $id) {
            owner { ... on Shared { initialSharedVersion } }
          }
        }`,
        { id }
      );
      return {
        objectId: id,
        initialSharedVersion: data.object?.owner?.initialSharedVersion ?? 0,
      };
    })
  );

  return results;
}

export async function queryPlatformsByOwner(owner: string, network?: SupportedNetwork): Promise<PlatformRegisteredEvent[]> {
  const config = getConfig(network);
  const data = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: PlatformRegisteredEvent } }[] } }>(
    `query GetPlatformsByOwner($type: String!, $owner: SuiAddress!) {
      events(last: 50, filter: { type: $type, sender: $owner }) {
        nodes { timestamp, contents { json } }
      }
    }`,
    { type: `${config.PACKAGE_ID}::platform::PlatformRegistered`, owner },
    network
  );
  return data.events.nodes.map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as PlatformRegisteredEvent);
}

export async function queryAccountCreatedEvents(sender: string, network?: SupportedNetwork): Promise<AccountCreatedEvent[]> {
  const config = getConfig(network);
  const data = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: AccountCreatedEvent } }[] } }>(
    `query GetAccountCreated($type: String!, $sender: SuiAddress!) {
      events(last: 50, filter: { type: $type, sender: $sender }) {
        nodes { timestamp, contents { json } }
      }
    }`,
    { type: `${config.PACKAGE_ID}::account::AccountCreated`, sender },
    network
  );
  return data.events.nodes.map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as AccountCreatedEvent);
}

export async function queryPlatformRegisteredEvents(network?: SupportedNetwork): Promise<PlatformRegisteredEvent[]> {
    const config = getConfig(network);
    const data = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: PlatformRegisteredEvent } }[] } }>(
    `query GetPlatformRegistered($type: String!) {
      events(last: 50, filter: { type: $type }) {
        nodes { timestamp, contents { json } }
      }
    }`,
    { type: `${config.PACKAGE_ID}::platform::PlatformRegistered` },
    network
  );
  return data.events.nodes.map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as PlatformRegisteredEvent);
}

export async function querySubscriptionCreatedEvents(accountId: string, network?: SupportedNetwork): Promise<SubscriptionCreatedEvent[]> {
  const config = getConfig(network);
  const data = await executeQuery<{ transactions: { nodes: { effects: { timestamp: string, events: { nodes: { contents: { type: { repr: string }, json: any } }[] } } }[] } }>(
    `query GetSubscriptionCreatedTx($id: SuiAddress!) {
      transactions(last: 50, filter: { affectedObject: $id }) {
        nodes {
          effects {
            timestamp
            events {
              nodes {
                contents { type { repr } json }
              }
            }
          }
        }
      }
    }`,
    { id: accountId },
    network
  );
  
  const targetType = `${config.PACKAGE_ID}::billing::SubscriptionCreated`;
  const events: SubscriptionCreatedEvent[] = [];
  
  for (const tx of data.transactions?.nodes || []) {
    for (const ev of tx.effects?.events?.nodes || []) {
      if (ev.contents?.type?.repr.startsWith(targetType)) {
        events.push({ ...ev.contents.json, timestamp: tx.effects.timestamp ? Number(new Date(tx.effects.timestamp)) : Date.now() });
      }
    }
  }
  
  return events.filter((e) => e.account_id === accountId);
}

export async function querySubscriptionCreatedEventsByPlatform(platformId: string, network?: SupportedNetwork): Promise<SubscriptionCreatedEvent[]> {
  const config = getConfig(network);
  const data = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: SubscriptionCreatedEvent } }[] } }>(
    `query GetSubscriptionCreated($type: String!) {
      events(last: 50, filter: { type: $type }) {
        nodes { timestamp, contents { json } }
      }
    }`,
    { type: `${config.PACKAGE_ID}::billing::SubscriptionCreated` },
    network
  );
  return data.events.nodes
    .map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as SubscriptionCreatedEvent)
    .filter((e) => e.platform_id === platformId);
}

export async function queryPaymentProcessedEvents(
  accountId?: string,
  platformId?: string,
  network?: SupportedNetwork
): Promise<PaymentProcessedEvent[]> {
  const config = getConfig(network);
  const targetId = accountId || platformId;
  
  if (!targetId) {
    // Fallback to global events if no specific object is provided
    const allEvents = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: PaymentProcessedEvent } }[] } }>(
      `query GetPaymentProcessed($type: String!) {
        events(last: 50, filter: { type: $type }) {
          nodes { timestamp, contents { json } }
        }
      }`,
      { type: `${config.PACKAGE_ID}::payment::PaymentProcessed` },
      network
    );
    let events = allEvents.events?.nodes?.map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as PaymentProcessedEvent) || [];
    return events;
  }

  // Use affectedObject to bypass global 50 limit
  const data = await executeQuery<{ transactions: { nodes: { effects: { timestamp: string, events: { nodes: { contents: { type: { repr: string }, json: any } }[] } } }[] } }>(
    `query GetPaymentProcessedTx($id: SuiAddress!) {
      transactions(last: 50, filter: { affectedObject: $id }) {
        nodes {
          effects {
            timestamp
            events {
              nodes {
                contents { type { repr } json }
              }
            }
          }
        }
      }
    }`,
    { id: targetId },
    network
  );
  
  const paymentType1 = `${config.PACKAGE_ID}::payment::PaymentProcessed`;
  const paymentType2 = `${config.PACKAGE_ID}::billing::PaymentRecorded`;
  let events: PaymentProcessedEvent[] = [];
  
  for (const tx of data.transactions?.nodes || []) {
    for (const ev of tx.effects?.events?.nodes || []) {
      if (ev.contents?.type?.repr.startsWith(paymentType1) || ev.contents?.type?.repr.startsWith(paymentType2)) {
        events.push({ ...ev.contents.json, timestamp: tx.effects.timestamp ? Number(new Date(tx.effects.timestamp)) : Date.now() });
      }
    }
  }
  
  if (accountId) {
    events = events.filter((e) => e.account_id === accountId);
  }
  if (platformId) {
    events = events.filter((e) => e.platform_id === platformId);
  }
  return events;
}

export async function queryPaymentFailedEvents(
  accountId?: string,
  platformId?: string,
  network?: SupportedNetwork
): Promise<PaymentFailedEvent[]> {
  const config = getConfig(network);
  const targetId = accountId || platformId;
  
  if (!targetId) {
    const allEvents = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: PaymentFailedEvent } }[] } }>(
      `query GetPaymentFailed($type: String!) {
        events(last: 50, filter: { type: $type }) {
          nodes { timestamp, contents { json } }
        }
      }`,
      { type: `${config.PACKAGE_ID}::payment::PaymentFailed` },
      network
    );
    let events = allEvents.events?.nodes?.map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as PaymentFailedEvent) || [];
    return events;
  }

  const data = await executeQuery<{ transactions: { nodes: { effects: { timestamp: string, events: { nodes: { contents: { type: { repr: string }, json: any } }[] } } }[] } }>(
    `query GetPaymentFailedTx($id: SuiAddress!) {
      transactions(last: 50, filter: { affectedObject: $id }) {
        nodes {
          effects {
            timestamp
            events {
              nodes {
                contents { type { repr } json }
              }
            }
          }
        }
      }
    }`,
    { id: targetId },
    network
  );
  
  const paymentType1 = `${config.PACKAGE_ID}::payment::PaymentFailed`;
  const paymentType2 = `${config.PACKAGE_ID}::billing::FailedPaymentRecorded`;
  let events: PaymentFailedEvent[] = [];
  
  for (const tx of data.transactions?.nodes || []) {
    for (const ev of tx.effects?.events?.nodes || []) {
      if (ev.contents?.type?.repr.startsWith(paymentType1) || ev.contents?.type?.repr.startsWith(paymentType2)) {
        events.push({ ...ev.contents.json, timestamp: tx.effects.timestamp ? Number(new Date(tx.effects.timestamp)) : Date.now() });
      }
    }
  }
  
  if (accountId) {
    events = events.filter((e) => e.account_id === accountId);
  }
  if (platformId) {
    events = events.filter((e) => e.platform_id === platformId);
  }
  return events;
}

export async function queryDepositEvents(accountId: string, network?: SupportedNetwork): Promise<DepositEvent[]> {
  const config = getConfig(network);
  const data = await executeQuery<{ transactions: { nodes: { effects: { timestamp: string, events: { nodes: { contents: { type: { repr: string }, json: any } }[] } } }[] } }>(
    `query GetDepositsTx($id: SuiAddress!) {
      transactions(last: 50, filter: { affectedObject: $id }) {
        nodes {
          effects {
            timestamp
            events {
              nodes {
                contents { type { repr } json }
              }
            }
          }
        }
      }
    }`,
    { id: accountId },
    network
  );
  
  const targetType = `${config.PACKAGE_ID}::account::Deposit`;
  const events: DepositEvent[] = [];
  
  for (const tx of data.transactions?.nodes || []) {
    for (const ev of tx.effects?.events?.nodes || []) {
      if (ev.contents?.type?.repr.startsWith(targetType)) {
        events.push({ ...ev.contents.json, timestamp: tx.effects.timestamp ? Number(new Date(tx.effects.timestamp)) : Date.now() });
      }
    }
  }
  
  return events.filter((e) => e.account_id === accountId);
}

export async function queryRecentEventsByType(
  type: string,
  limit: number = 10,
  network?: SupportedNetwork
): Promise<Array<{ id: string; transactionDigest: string; timestamp: number; json: Record<string, unknown> }>> {
  const data = await executeQuery<{ events: { nodes: { timestamp: string; transaction: { digest: string }; contents: { json: Record<string, unknown> } }[] } }>(
    `query GetRecentEvents($type: String!) {
      events(last: 50, filter: { type: $type }) {
        nodes {
          timestamp
          transaction { digest }
          contents { json }
        }
      }
    }`,
    { type },
    network
  );
  return (data.events?.nodes ?? []).map((n) => ({
    id: n.transaction.digest,
    transactionDigest: n.transaction.digest,
    timestamp: parseEventTimestamp(n),
    json: n.contents?.json ?? {},
  })).slice(0, limit);
}

export async function querySubscriptionUpdatedEventsByPlatform(
  platformId: string,
  network?: SupportedNetwork
): Promise<SubscriptionUpdatedEvent[]> {
    const config = getConfig(network);
    const data = await executeQuery<{ events: { nodes: { timestamp: string, contents: { json: SubscriptionUpdatedEvent } }[] } }>(
    `query GetSubscriptionUpdated($type: String!) {
      events(last: 50, filter: { type: $type }) {
        nodes { timestamp, contents { json } }
      }
    }`,
    { type: `${config.PACKAGE_ID}::billing::SubscriptionUpdated` },
    network
  );
  return data.events.nodes
    .map((n) => ({ ...n.contents.json, timestamp: parseEventTimestamp(n) }) as SubscriptionUpdatedEvent)
    .filter((e) => e.platform_id === platformId);
}

export async function queryCoins(owner: string, coinType: string): Promise<Array<{ id: string, balance: string }>> {
  const fullCoinType = `0x2::coin::Coin<${coinType}>`;
  const query = `
    query getCoins($owner: SuiAddress!, $type: String!) {
      address(address: $owner) {
        objects(filter: { type: $type }) {
          nodes {
            address
            contents {
              json
            }
          }
        }
      }
    }
  `;
  const data = await executeQuery<any>(query, { owner, type: fullCoinType });
  const nodes = data.address?.objects?.nodes || [];
  return nodes.map((node: any) => ({
    id: node.address,
    balance: node.contents?.json?.balance || "0"
  }));
}