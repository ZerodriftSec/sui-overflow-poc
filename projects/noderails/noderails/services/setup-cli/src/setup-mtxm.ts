import { MtxmClient } from '@noderails/mtxm-client';
import type { MtxmWebhookEvent } from '@noderails/mtxm-client';
import { CHAIN_DEFINITIONS, getLeanRpcUrl, getSolanaPublicRpcUrl } from '@noderails/common';
import type { SetupConfig } from './config.js';

/**
 * Register all supported chains in MTXM, create a signer,
 * register the MTXM→NodeRails webhook endpoint.
 */
export async function setupMtxm(config: SetupConfig): Promise<void> {
  const mtxm = new MtxmClient({
    baseUrl: config.mtxmBaseUrl,
    projectId: config.mtxmProjectId,
    apiKey: config.mtxmApiKey,
  });

  // ── 1. Register chains ──
  console.log('\n🔗  Registering chains in MTXM...');
  const existingChains = await mtxm.listChains();
  const existingChainIds = new Set(existingChains.map((c) => c.chainId));

  for (const [key, def] of Object.entries(CHAIN_DEFINITIONS)) {
    if (existingChainIds.has(def.chainId)) {
      console.log(`   ✓ ${def.name} (chainId ${def.chainId}) — already exists`);
      continue;
    }

    await mtxm.addChain({
      name: def.name,
      chainId: def.chainId,
      rpcUrls: [getSolanaPublicRpcUrl(def.chainId) ?? getLeanRpcUrl(def.chainId)],
      explorerUrl: def.explorerUrl,
      nativeCurrency: def.nativeCurrency.symbol,
      isTestnet: def.isTestnet,
    });
    console.log(`   + ${def.name} (chainId ${def.chainId}) — registered`);
  }

  // ── 2. Ensure at least one signer exists ──
  console.log('\n🔑  Checking signers...');
  const signers = await mtxm.listSigners();
  if (signers.length === 0) {
    const signer = await mtxm.createSigner({
      label: 'noderails-primary',
      adapterType: 'ENV',
    });
    await mtxm.setMasterSigner(signer.id);
    console.log(`   + Created signer "${signer.label}" (${signer.address}) and set as master`);
  } else {
    const master = signers.find((s) => s.isMaster);
    console.log(
      `   ✓ ${signers.length} signer(s) exist.` +
        (master ? ` Master: ${master.label} (${master.address})` : ' (no master set)'),
    );
  }

  // ── 3. Register webhook ──
  console.log('\n📡  Registering MTXM webhook...');
  const webhooks = await mtxm.listWebhooks();
  const existing = webhooks.find((w) => w.url === config.mtxmWebhookUrl);

  const allEvents: MtxmWebhookEvent[] = [
    'tx.signing',
    'tx.signed',
    'tx.broadcasting',
    'tx.broadcast',
    'tx.confirmed',
    'tx.failed',
    'tx.stuck',
    'tx.cancelled',
    'tx.speed_up',
  ];

  if (existing) {
    console.log(`   ✓ Webhook already registered (id: ${existing.id})`);
  } else {
    const wh = await mtxm.createWebhook({
      url: config.mtxmWebhookUrl,
      events: allEvents,
    });
    console.log(`   + Webhook created (id: ${wh.id})`);
    if (wh.secret) {
      console.log(`   ⚠  Save webhook secret: ${wh.secret}`);
      console.log(`      Set it as MTXM_WEBHOOK_SECRET in your environment.`);
    }
  }

  console.log('\n✅  MTXM setup complete.');
}
