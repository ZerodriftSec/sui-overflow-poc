import { Transaction } from '@mysten/sui/transactions';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { executeTransaction } from './helpers.js';
import { V2_PACKAGE_ID, V2_UPGRADE_CAP_ID } from './config.js';

const UPGRADE_CAP = V2_UPGRADE_CAP_ID;
const PACKAGE_ID = V2_PACKAGE_ID;

const modules = JSON.parse(process.argv[2]);

const client = new SuiClient({ url: getFullnodeUrl('devnet') });
const keypair = Ed25519Keypair.fromSecretKey(process.env.SECRET_KEY || '');
const sender = keypair.getPublicKey().toSuiAddress();

const tx = new Transaction();
const [cap] = tx.upgrade({
  modules: modules.map(m => Uint8Array.from(atob(m), c => c.charCodeAt(0))),
  package: PACKAGE_ID,
  upgradeCap: UPGRADE_CAP,
});

tx.transferObjects([cap], tx.pure.address(sender));

const result = await executeTransaction(client, tx, keypair);
console.log('Upgrade result:', JSON.stringify(result, null, 2));
