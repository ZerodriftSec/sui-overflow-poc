import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { NETWORK_CONFIGS, NETWORK, SupportedNetwork } from '@paystreamer/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { Transaction } from '@mysten/sui/transactions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transaction: txJson, userAddress } = req.body;

  if (!txJson) {
    return res.status(400).json({ error: 'Missing "transaction" field' });
  }

  if (!userAddress || typeof userAddress !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "userAddress" field' });
  }


  
  const sponsorPrivateKeyStr = process.env.SPONSOR_PRIVATE_KEY || (process.env.VITE_NETWORK === 'local' ? process.env.E2E_PRIVATE_KEY : undefined);
  if (!sponsorPrivateKeyStr) {
    return res.status(500).json({ error: 'SPONSOR_PRIVATE_KEY environment variable is not configured' });
  }
  
  let sponsorAddress = '';
  try {
    let secretKey: Uint8Array;
    if (sponsorPrivateKeyStr.startsWith('suiprivkey')) {
      secretKey = decodeSuiPrivateKey(sponsorPrivateKeyStr).secretKey;
    } else {
      secretKey = new Uint8Array(Buffer.from(sponsorPrivateKeyStr, 'hex'));
    }
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    sponsorAddress = keypair.toSuiAddress();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to parse sponsor private key' });
  }

  try {
    const targetNet = (process.env.VITE_NETWORK as SupportedNetwork) || NETWORK || 'testnet';
    const configs = (NETWORK_CONFIGS as any)?.default || NETWORK_CONFIGS;
    const sdkConfig = configs?.[targetNet] || configs?.testnet || configs?.local;
    if (!sdkConfig) throw new Error('SDK configuration for network not found');
    const client = new SuiGraphQLClient({
      url: sdkConfig.GRAPHQL_URL,
      network: targetNet === 'local' ? 'localnet' : targetNet,
    });

    // Reconstruct transaction from JSON
    const transaction = Transaction.from(txJson);

    // Set sender and gas owner
    transaction.setSender(userAddress);
    transaction.setGasOwner(sponsorAddress);

    // Fetch sponsor's coins for gas payment
    const coins = await client.listCoins({
      owner: sponsorAddress,
      coinType: '0x2::sui::SUI',
      limit: 5,
    });

    if (coins.objects.length === 0) {
      return res.status(400).json({ error: 'Sponsor has no SUI coins for gas' });
    }

    // Use the first coin as gas payment
    const gasCoin = coins.objects[0];
    transaction.setGasPayment([{
      objectId: gasCoin.objectId,
      digest: gasCoin.digest,
      version: gasCoin.version,
    }]);
    transaction.setGasBudget(50000000);

    // Build the transaction with sponsor's gas
    const builtTx = await transaction.build({ client });

    return res.status(200).json({
      bytes: Buffer.from(builtTx).toString('base64'),
    });
  } catch (error: any) {
    console.error('[Sponsor API] Error preparing transaction:', error);
    return res.status(500).json({ error: error.message || 'Failed to prepare transaction' });
  }
}
