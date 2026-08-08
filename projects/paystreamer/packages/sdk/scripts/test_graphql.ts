import { SuiGraphQLClient } from '@mysten/sui/graphql';
const client = new SuiGraphQLClient({ url: 'https://graphql.devnet.sui.io/graphql', network: 'devnet' });
const sender = '0x472083c45f28f6fed624f1f252966a753332111a931127f047a9759800672793';
const type = '0x74d11b1c40509335fd139b7b173328a1e1d55d2816a55b893861148d3724a61f::pusd::PUSD';

async function test() {
  const coinsResp = await client.query({
    query: `query GetCoins($owner: SuiAddress!, $type: String!) {
      owner(address: $owner) {
        address
        ... on Address {
          coins(first: 10, type: $type) { nodes { address } }
        }
      }
    }`,
    variables: { owner: sender, type }
  });
  console.log(JSON.stringify(coinsResp, null, 2));
}

test();
