#!/usr/bin/env node

/**
 * NodeRails Setup CLI
 *
 * One-time setup script that registers chains, contracts,
 * signers, and webhooks with MTXM and the Indexer.
 *
 * Usage:
 *   noderails-setup              # runs both mtxm + indexer setup
 *   noderails-setup --mtxm       # runs only MTXM setup
 *   noderails-setup --indexer    # runs only Indexer setup
 *
 * Requires env vars — see README or run without them for a list.
 */

import { loadConfig } from './config.js';
import { setupMtxm } from './setup-mtxm.js';
import { setupIndexer } from './setup-indexer.js';

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  const runMtxm = args.has('--mtxm') || (!args.has('--indexer'));
  const runIndexer = args.has('--indexer') || (!args.has('--mtxm'));

  console.log('═══════════════════════════════════════');
  console.log('  NodeRails Setup CLI');
  console.log('═══════════════════════════════════════');

  const config = loadConfig();

  if (runMtxm) {
    await setupMtxm(config);
  }

  if (runIndexer) {
    await setupIndexer(config);
  }

  console.log('\n🎉  All done.');
}

main().catch((err) => {
  console.error('\n❌  Setup failed:', err);
  process.exit(1);
});
