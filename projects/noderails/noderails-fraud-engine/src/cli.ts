#!/usr/bin/env node
import { assessWallet } from './assess.js';

async function main(): Promise<void> {
  const wallet = process.argv[2];
  if (!wallet) {
    console.error('Usage: npm run assess -- <wallet_address>');
    console.error('Requires .env with GOLDRUSH_API_KEY (see .env.example).');
    process.exitCode = 1;
    return;
  }
  try {
    const json = await assessWallet({ walletAddress: wallet });
    console.log(json);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

main();
