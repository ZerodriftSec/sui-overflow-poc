#!/usr/bin/env node

/**
 * Idempotent demo-platform seeder for the v2 subscription contract on Sui
 * devnet.
 *
 * This script is the one-command entry point for keeping the PayStreamer
 * demo alive on devnet. It is safe to run multiple times — on each run it
 * either:
 *   (a) discovers an existing "Demo SaaS" platform on devnet (by scanning
 *       `PlatformRegistered` events for the fixed name) and re-prints its
 *       object ID and `initialSharedVersion`, or
 *   (b) creates a fresh platform (and a single demo tier with 1-minute
 *       billing) and prints the new IDs.
 *
 * The fixed inputs are:
 *   - platform name:    "Demo SaaS"
 *   - platform category: "SaaS"
 *   - tier name:        "Demo Tier (1-minute billing)"
 *   - tier amount:      1_000_000 MIST (0.001 SUI)
 *   - tier frequency:   60_000 ms (60 seconds — short enough to demo the
 *                       permissionless scheduler in well under a minute)
 *
 * Requirements:
 *   - The `sui` CLI is configured with a devnet account that has SUI for
 *     gas (the script signs with the active keypair in
 *     `~/.sui/sui_config/sui.keystore`).
 *   - `V2_PACKAGE_ID` (see `scripts/v2/config.ts`) is published on devnet.
 *
 * Output: a single JSON object on stdout with the platform/tier metadata,
 * suitable for piping into `src/constants.ts`. See the bottom of
 * `main()` for the `DEMO_PLATFORM_ID` / `DEMO_PLATFORM_INIT_VERSION`
 * patch.
 *
 * Usage: pnpm seed:demo
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Transaction, Inputs } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";

import {
  CLOCK_OBJECT_ID,
  NETWORK_CONFIGS,
  SUI_TYPE_ARG,
  NETWORK
} from "../src/constants.ts";

const networkConfig = NETWORK_CONFIGS[NETWORK];
const V3_PACKAGE_ID = networkConfig.PACKAGE_ID;
const V3_COIN_TYPE_REGISTRY_ID = networkConfig.COIN_TYPE_REGISTRY_ID;
const V3_COIN_TYPE_REGISTRY_INIT_VERSION = networkConfig.COIN_TYPE_REGISTRY_INIT_VERSION;
const V2_GRAPHQL_URL = networkConfig.GRAPHQL_URL;
const V2_NETWORK = NETWORK;
const PUSD_PACKAGE_ID = networkConfig.PUSD_PACKAGE_ID;
const PUSD_TYPE_ARG = networkConfig.PUSD_TYPE_ARG;
const PUSD_TREASURY_CAP_ID = networkConfig.PUSD_TREASURY_CAP_ID;
import { loadKeypair, newTx, sharedObjectMut } from "./test-utils.ts";

const DEMO_PLATFORM_NAME = "Demo SaaS 2";
const DEMO_PLATFORM_DESCRIPTION =
  "A demo platform for the PayStreamer hackathon. Subscribe for a few minutes of test billing.";
const DEMO_PLATFORM_CATEGORY = "SaaS";
const DEMO_TIER_NAME = "Demo Tier (1-minute billing)";
const DEMO_TIER_AMOUNT_MIST = 10_000_000_000n;
const DEMO_TIER_FREQUENCY_MS = 60_000n;

const DEMO_USER_ADDRESS = "0x95db3e349c7112b4e326062318e029c9e9a67d26099517a1b5977b826df1dccf";

// Shared-object initial versions are discovered dynamically from the
// on-chain object (see `fetchPlatformObjectVersion`). We don't need a
// hard-coded `SHARED_INIT_VERSION_*` constant for the demo platform
// itself — the script is the canonical source of truth, and it always
// re-queries the chain.

type DiscoveredPlatform = {
  platformId: string;
  initialSharedVersion: number;
  foundExisting: boolean;
};

type SeedResult = {
  platformId: string;
  platformInitVersion: number;
  tierIndex: number;
  tierName: string;
  tierAmountMist: string;
  tierFrequencyMs: string;
  suiDiscriminant: number;
  pusdDiscriminant: number;
};

async function fetchPlatformObjectVersion(
  client: SuiGraphQLClient,
  platformId: string,
): Promise<number | undefined> {
  const res = await client.query({
    query: `
      query GetObj($id: SuiAddress!) {
        object(address: $id) {
          asMoveObject { contents { json } }
          owner { ... on Shared { initialSharedVersion } }
        }
      }
    `,
    variables: { id: platformId },
  });
  const v = (res.data as any)?.object?.owner?.initialSharedVersion;
  return typeof v === "number" ? v : undefined;
}

/**
 * Scan `PlatformRegistered` events emitted by the configured package and
 * return the most recent one whose `name` field matches
 * `DEMO_PLATFORM_NAME`.
 *
 * The Sui GraphQL `events` connection is returned in descending order by
 * checkpoint / timestamp, so the first match in the first page is the
 * latest one. We only paginate if the first page has no match.
 *
 * We can't filter on a JSON field via the GraphQL `filter` arg, so we walk
 * pages and inspect `contents.json` in JS. This is acceptable for a
 * seeder: `PlatformRegistered` events are sparse.
 */
async function discoverDemoPlatform(
  client: SuiGraphQLClient,
): Promise<DiscoveredPlatform | undefined> {
  const eventType = `${V3_PACKAGE_ID}::platform::PlatformRegistered`;
  let cursor: string | null = null;
  let hasNextPage = true;
  let match: { platformId: string } | undefined;

  while (hasNextPage) {
    const res: any = await client.query({
      query: `
        query GetPlatforms($type: String!, $after: String) {
          events(first: 50, after: $after, filter: { type: $type }) {
            nodes {
              contents { json }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      variables: { type: eventType, after: cursor },
    });
    const events: any = (res.data as any)?.events;
    const nodes: any[] = events?.nodes ?? [];
    for (const n of nodes) {
      const json = n?.contents?.json;
      if (json && json.name === DEMO_PLATFORM_NAME && typeof json.platform_id === "string") {
        match = { platformId: json.platform_id };
        break;
      }
    }
    if (match) break;
    hasNextPage = !!events?.pageInfo?.hasNextPage;
    cursor = events?.pageInfo?.endCursor ?? null;
    if (nodes.length === 0) break;
  }

  if (!match) return undefined;
  const version = await fetchPlatformObjectVersion(client, match.platformId);
  if (version === undefined) return undefined;
  return {
    platformId: match.platformId,
    initialSharedVersion: version,
    foundExisting: true,
  };
}

async function fetchDiscriminant(
  client: SuiGraphQLClient,
  packageId: string,
  typeArg: string,
): Promise<number | undefined> {
  const res = await client.query({
    query: `
      query GetCoinTypeRegistrations($type: String!) {
        events(first: 50, filter: { type: $type }) {
          nodes {
            contents { json }
          }
        }
      }
    `,
    variables: { type: `${packageId}::registry::CoinTypeRegistered` },
  });
  const nodes: any[] = (res.data as any)?.events?.nodes ?? [];
  for (const n of nodes) {
    const json = n?.contents?.json;
    if (json && typeof json.coin_type === "string" && json.coin_type.endsWith(typeArg)) {
      if (typeof json.discriminant === "number") return json.discriminant;
      if (typeof json.discriminant === "string") return Number(json.discriminant);
    }
  }
  return undefined;
}

async function fetchSuiDiscriminant(
  client: SuiGraphQLClient,
): Promise<number | undefined> {
  return fetchDiscriminant(client, V3_PACKAGE_ID, "::sui::SUI");
}

async function registerCoinType<T extends string>(
  client: SuiGraphQLClient,
  keypair: ReturnType<typeof loadKeypair>,
  typeArg: T,
  displayName: string,
  registryId: string,
  registryInitVersion: number,
  packageId: string,
): Promise<number> {
  const existing = await fetchDiscriminant(client, packageId, typeArg.split("::").slice(-2).join("::"));
  if (existing !== undefined) {
    console.log(`\n=== register_coin_type<${displayName}> ===`);
    console.log(`  status: SKIP (${displayName} already registered, discriminant=${existing})`);
    return existing;
  }

  const tx = newTx(keypair);
  tx.moveCall({
    target: `${packageId}::registry::register_coin_type`,
    typeArguments: [typeArg],
    arguments: [
      tx.object(
        Inputs.SharedObjectRef({
          objectId: registryId,
          mutable: true,
          initialSharedVersion: registryInitVersion,
        }),
      ),
    ],
  });
  const r = await executeOrSkip(client, keypair, `register_coin_type<${displayName}>`, tx, []);
  if (r.status === "failure") {
    throw new Error(`register_coin_type<${displayName}> failed: ${r.error ?? "unknown"}`);
  }
  let d: number | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    d = await fetchDiscriminant(client, packageId, typeArg.split("::").slice(-2).join("::"));
    if (d !== undefined) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (d === undefined) {
    throw new Error(`register_coin_type<${displayName}> succeeded but no discriminant was discovered`);
  }
  return d;
}

async function mintPusdToDemoUser(
  client: SuiGraphQLClient,
  keypair: ReturnType<typeof loadKeypair>,
  treasuryCapId: string,
  amount: bigint,
): Promise<void> {
  const tx = newTx(keypair);
  tx.moveCall({
    target: `${PUSD_PACKAGE_ID}::pusd::mint`,
    arguments: [
      tx.object(treasuryCapId),
      tx.pure.address(DEMO_USER_ADDRESS),
      tx.pure.u64(amount),
    ],
  });
  const r = await executeOrSkip(client, keypair, `mint PUSD to ${DEMO_USER_ADDRESS}`, tx, []);
  if (r.status === "failure") {
    throw new Error(`PUSD mint failed: ${r.error ?? "unknown"}`);
  }
}

async function findExistingTier(
  client: SuiGraphQLClient,
  platformId: string,
): Promise<{ tierIndex: number; amount: string; frequencyMs: string } | undefined> {
  // Read the platform object and look for a tier with a matching name.
  // Tier 0 is the only tier on a freshly seeded demo platform, but the
  // seed should be robust to re-runs that added extra tiers.
  const res = await client.query({
    query: `
      query GetPlatform($id: SuiAddress!) {
        object(address: $id) {
          asMoveObject { contents { json } }
        }
      }
    `,
    variables: { id: platformId },
  });
  const json: any = (res.data as any)?.object?.asMoveObject?.contents?.json;
  if (!json || typeof json !== "object") return undefined;

  // The `tiers` field is a `VecMap<u64, SubscriptionTier>`. Sui GraphQL
  // renders `VecMap` as `{ contents: [{ key, value }, ...] }` — the
  // top-level `tiers` object is the wrapper, not the array of pairs.
  // Unwrap the `contents` array first, then iterate the pairs.
  const tiers = json.tiers;
  if (!tiers) return undefined;

  let pairs: Array<{ key: number; value: any }> = [];
  if (Array.isArray(tiers.contents)) {
    for (const e of tiers.contents) {
      if (e && typeof e.key !== "undefined" && e.value) {
        pairs.push({ key: Number(e.key), value: e.value });
      }
    }
  } else if (Array.isArray(tiers)) {
    // Defensive: in case a future Sui GraphQL change drops the
    // `contents` wrapper.
    for (const e of tiers) {
      if (e && typeof e.key !== "undefined" && e.value) {
        pairs.push({ key: Number(e.key), value: e.value });
      }
    }
  } else if (typeof tiers === "object") {
    for (const [k, v] of Object.entries(tiers)) {
      if (v && typeof v === "object" && (v as any).name) {
        pairs.push({ key: Number(k), value: v });
      }
    }
  }

  for (const { key, value } of pairs) {
    if (value && value.name === DEMO_TIER_NAME) {
      return {
        tierIndex: key,
        amount: String(value.amount ?? DEMO_TIER_AMOUNT_MIST),
        frequencyMs: String(value.frequency_ms ?? DEMO_TIER_FREQUENCY_MS),
      };
    }
  }
  return undefined;
}

async function executeOrSkip(
  client: SuiGraphQLClient,
  keypair: ReturnType<typeof loadKeypair>,
  name: string,
  tx: Transaction,
  expectedAbortCodes: number[] = [],
): Promise<{ status: "success" | "failure" | "skipped"; digest: string; error?: string }> {
  console.log(`\n=== ${name} ===`);
  try {
    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
    });
    if (result.$kind === "FailedTransaction") {
      const msg = result.FailedTransaction.status.error
        ? JSON.stringify(result.FailedTransaction.status.error)
        : "unknown";
      // Treat known idempotency-related aborts (e.g. tier already exists
      // with the same name) as a soft success: the script's discover
      // step will pick up the existing tier afterwards.
      const knownAborts: Record<number, string> = {
        32770: "EInvalidTier",
        4097: "EPlatformAlreadyExists", // placeholder — adjust if Move defines its own
      };
      const matched = expectedAbortCodes.find((c) => msg.includes(String(c)));
      if (matched !== undefined) {
        console.log(`  status: expected (${knownAborts[matched] ?? `code ${matched}`})`);
        return { status: "success", digest: "" };
      }
      console.log(`  status: FAILED (${msg})`);
      return { status: "failure", digest: result.FailedTransaction.digest, error: msg };
    }
    const digest = result.Transaction!.digest;
    console.log(`  status: success   digest: ${digest}`);
    return { status: "success", digest };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (expectedAbortCodes.some((c) => message.includes(String(c)))) {
      console.log(`  status: expected abort caught (idempotent re-run)`);
      return { status: "success", digest: "" };
    }
    console.log(`  status: EXCEPTION (${message})`);
    return { status: "failure", digest: "", error: message };
  }
}

async function registerPlatformWithTier(
  client: SuiGraphQLClient,
  keypair: ReturnType<typeof loadKeypair>,
  denominationType: string,
): Promise<DiscoveredPlatform> {
  const tx = newTx(keypair);
  tx.moveCall({
    target: `${V3_PACKAGE_ID}::platform::register_platform_with_tier`,
    typeArguments: [denominationType],
    arguments: [
      tx.pure.string(DEMO_PLATFORM_NAME),
      tx.pure.string(DEMO_PLATFORM_DESCRIPTION),
      tx.pure.string(DEMO_PLATFORM_CATEGORY),
      tx.pure.option("string", null),
      tx.pure.string(DEMO_TIER_NAME),
      tx.pure.u64(DEMO_TIER_AMOUNT_MIST),
      tx.pure.u64(DEMO_TIER_FREQUENCY_MS),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  const r = await executeOrSkip(
    client,
    keypair,
    "register_platform_with_tier",
    tx,
  );
  if (r.status === "failure") {
    throw new Error(`register_platform_with_tier failed: ${r.error ?? "unknown"}`);
  }
  let discovered: Awaited<ReturnType<typeof discoverDemoPlatform>>;
  for (let attempt = 0; attempt < 5; attempt++) {
    discovered = await discoverDemoPlatform(client);
    if (discovered) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!discovered) {
    throw new Error(
      "register_platform_with_tier reported success but no \"Demo SaaS\" PlatformRegistered event was found",
    );
  }
  return discovered;
}

async function createDemoTier(
  client: SuiGraphQLClient,
  keypair: ReturnType<typeof loadKeypair>,
  platformId: string,
  platformInitVersion: number,
  denominationType: string,
): Promise<{ tierIndex: number; amount: string; frequencyMs: string; created: boolean }> {
  const existing = await findExistingTier(client, platformId);
  if (existing) {
    console.log(`\n=== create_tier("${DEMO_TIER_NAME}") ===`);
    console.log(`  status: SKIP (tier already exists at index ${existing.tierIndex})`);
    return { ...existing, created: false };
  }

  const tx = newTx(keypair);
  const typeNameArg = tx.moveCall({
    target: "0x1::type_name::get",
    typeArguments: [],
    arguments: [tx.pure.string(denominationType)],
  });
  tx.moveCall({
    target: `${V3_PACKAGE_ID}::platform::create_tier`,
    arguments: [
      sharedObjectMut(platformId, platformInitVersion)(tx),
      tx.pure.string(DEMO_TIER_NAME),
      tx.pure.u64(DEMO_TIER_AMOUNT_MIST),
      tx.pure.u64(DEMO_TIER_FREQUENCY_MS),
      typeNameArg,
    ],
  });
  const r = await executeOrSkip(
    client,
    keypair,
    `create_tier("${DEMO_TIER_NAME}")`,
    tx,
    [32770],
  );
  if (r.status === "failure") {
    throw new Error(`create_tier failed: ${r.error ?? "unknown"}`);
  }
  let after: Awaited<ReturnType<typeof findExistingTier>>;
  for (let attempt = 0; attempt < 5; attempt++) {
    after = await findExistingTier(client, platformId);
    if (after) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!after) {
    throw new Error(
      "create_tier reported success but the demo tier was not found on the platform object",
    );
  }
  return { ...after, created: true };
}

/**
 * Patch `src/constants.ts` so the demo platform ID is wired in to the
 * frontend. The patch is idempotent: if the constants are already set to
 * the same values, the file is left unchanged. If the file already has a
 * different DEMO_PLATFORM_ID, it is overwritten (the script is a
 * seeder, and re-running it is the documented way to point the demo at a
 * fresh platform).
 */
function patchConstants(result: SeedResult): { patched: boolean; reason: string } {
  const constantsPath = fileURLToPath(new URL("../src/constants.ts", import.meta.url));
  let src: string;
  try {
    src = readFileSync(constantsPath, "utf8");
  } catch (e) {
    return { patched: false, reason: `could not read ${constantsPath}: ${String(e)}` };
  }

  const targetNetwork = V2_NETWORK;
  const targetConfigRegex = new RegExp(`(${targetNetwork}:\\s*\\{[^}]+\\})`);
  const match = src.match(targetConfigRegex);

  if (!match) {
    return {
      patched: false,
      reason: `could not find ${targetNetwork} configuration block in src/constants.ts`,
    };
  }

  let targetBlock = match[1];
  targetBlock = targetBlock.replace(/DEMO_PLATFORM_ID: "[^"]*"/, `DEMO_PLATFORM_ID: "${result.platformId}"`);
  targetBlock = targetBlock.replace(/DEMO_PLATFORM_INIT_VERSION: \d+/, `DEMO_PLATFORM_INIT_VERSION: ${result.platformInitVersion}`);

  const next = src.replace(targetConfigRegex, targetBlock);

  try {
    writeFileSync(constantsPath, next, "utf8");
    return { patched: true, reason: "ok" };
  } catch (e) {
    return { patched: false, reason: `could not write ${constantsPath}: ${String(e)}` };
  }
}

async function main() {
  const keypair = loadKeypair();
  const sender = keypair.toSuiAddress();
  const client = new SuiGraphQLClient({
    url: V2_GRAPHQL_URL,
    network: V2_NETWORK,
  });

  console.log("======================================================");
  console.log(" PayStreamer — Demo Platform Seeder (v3 migration)");
  console.log("======================================================");
  console.log(`network:   ${V2_NETWORK}`);
  console.log(`package:   ${V3_PACKAGE_ID}`);
  console.log(`sender:    ${sender}`);
  console.log(`name:      "${DEMO_PLATFORM_NAME}"`);
  console.log(`tier:      "${DEMO_TIER_NAME}" (${DEMO_TIER_AMOUNT_MIST} PUSC / ${DEMO_TIER_FREQUENCY_MS} ms)`);
  console.log(`denomination: PUSD (${PUSD_TYPE_ARG})`);

  console.log("\n=== Step 0: register_coin_type<PUSD> ===");
  const pusdDiscriminant = await registerCoinType(
    client,
    keypair,
    PUSD_TYPE_ARG,
    "PUSD",
    V3_COIN_TYPE_REGISTRY_ID,
    V3_COIN_TYPE_REGISTRY_INIT_VERSION,
    V3_PACKAGE_ID,
  );
  console.log(`  PUSD discriminant: ${pusdDiscriminant}`);

  let platform: DiscoveredPlatform;
  const existing = await discoverDemoPlatform(client);
  if (existing) {
    console.log("\n=== discover platform ===");
    console.log(`  status: FOUND existing "Demo SaaS" platform`);
    console.log(`  platformId:           ${existing.platformId}`);
    console.log(`  initialSharedVersion: ${existing.initialSharedVersion}`);
    platform = existing;
  } else {
    console.log("\n=== register_platform_with_tier ===");
    platform = await registerPlatformWithTier(client, keypair, PUSD_TYPE_ARG);
  }

  console.log("\n=== mint PUSD to demo user ===");
  await mintPusdToDemoUser(client, keypair, PUSD_TREASURY_CAP_ID, 10_000_000_000n);

  const tier = await findExistingTier(client, platform.platformId);
  if (!tier) {
    throw new Error("tier not found after platform registration");
  }

  const result: SeedResult = {
    platformId: platform.platformId,
    platformInitVersion: platform.initialSharedVersion,
    tierIndex: tier.tierIndex,
    tierName: DEMO_TIER_NAME,
    tierAmountMist: tier.amount,
    tierFrequencyMs: tier.frequencyMs,
    suiDiscriminant: 0,
    pusdDiscriminant,
  };

  console.log("\n======================================================");
  console.log(" Demo platform ready");
  console.log("======================================================");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  const patch = patchConstants(result);
  if (patch.patched) {
    console.log(`\nPatched src/constants.ts (${patch.reason})`);
  } else {
    console.log(`\nsrc/constants.ts not patched: ${patch.reason}`);
    console.log("Add these manually:");
    console.log(`  export const DEMO_PLATFORM_ID = "${result.platformId}";`);
    console.log(`  export const DEMO_PLATFORM_INIT_VERSION = ${result.platformInitVersion};`);
  }

  if (!platform.foundExisting) {
    console.log("\nNote: this run created a NEW platform. Old \"Demo SaaS\" platforms");
    console.log("(if any) are still on chain. The frontend uses the most recent one");
    console.log("pinned in src/constants.ts.");
  }
}

main().catch((e) => {
  console.error("SEED_DEMO_FAILED:", e);
  process.exit(1);
});
