import { readFile } from 'node:fs/promises';
import { IndexerClient } from '@noderails/indexer-client';
import { CHAIN_DEFINITIONS } from '@noderails/common';
import type { SetupConfig } from './config.js';

/**
 * Register escrow contracts with the Indexer so it starts
 * listening for on-chain payment events, and register the
 * Indexer→NodeRails webhook endpoint.
 *
 * NOTE: Webhooks are configured in the Indexer **Admin UI**, not
 * via the Project API.  This step only prints a reminder.
 */
export async function setupIndexer(config: SetupConfig): Promise<void> {
  const indexer = new IndexerClient({
    baseUrl: config.indexerBaseUrl,
    apiKey: config.indexerApiKey,
  });

  // ── 1. Verify chains ──
  console.log('\n🔗  Verifying chains in Indexer...');
  const indexerChains = await indexer.listChains();
  const indexerChainIds = new Set(indexerChains.map((c) => c.chainId));

  for (const [, def] of Object.entries(CHAIN_DEFINITIONS)) {
    if (indexerChainIds.has(def.chainId)) {
      console.log(`   ✓ ${def.name} (chainId ${def.chainId}) — present`);
    } else {
      console.log(`   ✗ ${def.name} (chainId ${def.chainId}) — NOT in Indexer (add via Admin UI)`);
    }
  }

  // ── 2. Load escrow ABI ──
  console.log('\n📜  Loading Escrow ABI...');
  let abi: unknown[];
  try {
    const raw = await readFile(config.escrowAbiPath, 'utf-8');
    const parsed = JSON.parse(raw);
    abi = Array.isArray(parsed) ? parsed : parsed.abi;
    console.log(`   ✓ Loaded ${abi.length} ABI entries from ${config.escrowAbiPath}`);
  } catch (err) {
    console.error(`   ❌  Failed to load ABI from ${config.escrowAbiPath}:`, err);
    return;
  }

  // ── 3. Register contracts (interactive: reads ESCROW_DEPLOYMENTS env) ──
  //
  // ESCROW_DEPLOYMENTS is a JSON array:
  // [{ "chainId": 1, "address": "0x...", "startBlock": 18000000 }, ...]
  //
  console.log('\n📝  Registering escrow contracts...');
  const deploymentsEnv = process.env.ESCROW_DEPLOYMENTS;
  if (!deploymentsEnv) {
    console.log('   ⚠  ESCROW_DEPLOYMENTS env var not set — skipping contract registration.');
    console.log('      Set it to a JSON array of { chainId, address, startBlock }.');
    return;
  }

  interface DeploymentEntry {
    chainId: number;
    address: string;
    startBlock?: number;
  }

  let deployments: DeploymentEntry[];
  try {
    deployments = JSON.parse(deploymentsEnv) as DeploymentEntry[];
  } catch {
    console.error('   ❌  Failed to parse ESCROW_DEPLOYMENTS JSON.');
    return;
  }

  const existingContracts = await indexer.listContracts();
  const existingAddrs = new Set(existingContracts.map((c) => c.address.toLowerCase()));

  for (const dep of deployments) {
    if (existingAddrs.has(dep.address.toLowerCase())) {
      console.log(`   ✓ ${dep.address} (chainId ${dep.chainId}) — already registered`);
      continue;
    }

    await indexer.addContract({
      chainId: dep.chainId,
      address: dep.address,
      abi,
      name: 'NodeRailsEscrow',
      startBlock: dep.startBlock,
    });
    console.log(`   + ${dep.address} (chainId ${dep.chainId}) — registered`);
  }

  // ── 4. Register Sui Move packages (optional) ──
  //
  // SUI_DEPLOYMENTS is a JSON array:
  // [{ "chainId": 201, "packageId": "0x...", "module": "escrow", "startCheckpoint": 0 }, ...]
  //
  console.log('\n📦  Registering Sui packages...');
  const suiDeploymentsEnv = process.env.SUI_DEPLOYMENTS;
  if (!suiDeploymentsEnv) {
    console.log('   ⚠  SUI_DEPLOYMENTS env var not set — skipping Sui package registration.');
    console.log('      Set it to a JSON array of { chainId, packageId, module?, startCheckpoint? }.');
  } else {
    interface SuiDeploymentEntry {
      chainId: number;
      packageId: string;
      module?: string;
      startCheckpoint?: number;
    }
    try {
      const suiDeployments = JSON.parse(suiDeploymentsEnv) as SuiDeploymentEntry[];
      for (const dep of suiDeployments) {
        console.log(
          `   + Sui package ${dep.packageId} (chainId ${dep.chainId}) — register via Indexer Admin (protocol: sui)`,
        );
        void dep.module;
        void dep.startCheckpoint;
      }
    } catch {
      console.error('   ❌  Failed to parse SUI_DEPLOYMENTS JSON.');
    }
  }

  // ── 5. Webhook reminder ──
  console.log('\n📡  Indexer webhook setup:');
  console.log(`   Indexer webhooks are managed in the Admin UI.`);
  console.log(`   Ensure a webhook is configured for this project pointing to:`);
  console.log(`     ${config.indexerWebhookUrl}`);
  console.log(`   Subscribe to: all contract events + native transfers.`);

  console.log('\n✅  Indexer setup complete.');
}
