import { SuiGraphQLClient } from "@mysten/sui/graphql";
const client = new SuiGraphQLClient({ url: "http://127.0.0.1:8000/graphql" });
const query = `
  query getPlatformEvents($eventType: String!) {
    events(filter: { type: $eventType }, last: 100) {
      nodes { contents { json } }
    }
  }
`;
import { readFileSync } from "fs";
const file = readFileSync("src/constants.ts", "utf-8");
const match = file.match(/local:\s*\{[\s\S]*?PACKAGE_ID:\s*"([^"]+)"/);
const eventType = `${match[1]}::platform::PlatformRegistered`;

async function run() {
  const r1 = await client.query({ query, variables: { eventType } });
  console.log("LAST 100:", JSON.stringify(r1, null, 2));
}
run().catch(console.error);
