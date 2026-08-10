import { SuiGraphQLClient } from "@mysten/sui/graphql";

export function createGraphqlClient(network: string) {
  const urls: Record<string, string> = {
    mainnet: "https://graphql.mainnet.sui.io/graphql",
    testnet: "https://graphql.testnet.sui.io/graphql",
    devnet: "https://graphql.devnet.sui.io/graphql",
    local: "http://127.0.0.1:8000/graphql"
  };
  return new SuiGraphQLClient({
    network: network === "local" ? "localnet" : (network as any),
    url: urls[network] || urls.testnet
  });
}
