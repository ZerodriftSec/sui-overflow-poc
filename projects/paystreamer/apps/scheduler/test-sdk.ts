import { SuiGrpcClient } from '@mysten/sui/grpc';
const client = new SuiGrpcClient({ network: 'mainnet', baseUrl: 'https://fullnode.mainnet.sui.io:443' });
async function test() {
  const coins = await client.core.listCoins({ owner: '0x0000000000000000000000000000000000000000000000000000000000000000', coinType: '0x2::sui::SUI' });
  console.log(coins.objects[0] || 'no coins');
}
test().catch(console.error);
