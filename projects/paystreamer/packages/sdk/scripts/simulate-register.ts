import { Transaction } from "@mysten/sui/transactions";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { loadKeypair, newTx } from "./test-utils.ts";
import { SUBSCRIPTION_DEVNET_PACKAGE_ID, CLOCK_OBJECT_ID, GRAPHQL_URL, NETWORK } from "../src/constants.ts";

async function main() {
  const keypair = loadKeypair();
  const client = new SuiGraphQLClient({
    url: GRAPHQL_URL,
    network: NETWORK,
  });

  const tx = newTx(keypair);
  tx.moveCall({
    target: `${SUBSCRIPTION_DEVNET_PACKAGE_ID}::platform::register_platform`,
    arguments: [
      tx.pure.string("Test Platform"),
      tx.pure.string("Test Description"),
      tx.pure.string("Software"),
      tx.pure.option("string", null),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  try {
    const built = await tx.build({ client });
    console.log("Built successfully");
    const result = await client.signAndExecuteTransaction({ transaction: built, signer: keypair });
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
}

main().catch(console.error);
