/**
 * Smoke script: create a stream by handle on testnet.
 *
 *   SUI_PRIVATE_KEY=suiprivkey… RECIPIENT=0x… npm run example:pay
 *
 * Optional: AMOUNT_USDC, DURATION_DAYS, INDEXER_URL, SPONSOR_URL
 */
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

import {
  StreamLine,
  createKeypairSigner,
  createSponsoredKeypairSigner,
  resolveNetworkConfig,
} from "../src/index.js";

async function main() {
  const secret = process.env.SUI_PRIVATE_KEY?.trim();
  if (!secret) {
    console.error("Set SUI_PRIVATE_KEY (suiprivkey… or bech32).");
    process.exit(1);
  }
  const recipient =
    process.env.RECIPIENT?.trim() || "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (recipient.endsWith("0000000000000000")) {
    console.error("Set RECIPIENT to a handle (alice@streamline) or 0x address.");
    process.exit(1);
  }

  const amountUsdc = Number(process.env.AMOUNT_USDC ?? "1");
  const durationDays = Number(process.env.DURATION_DAYS ?? "7");
  const config = resolveNetworkConfig("testnet", {
    indexerUrl: process.env.INDEXER_URL,
  });
  const client = new SuiClient({ url: config.fullnodeUrl });

  const { secretKey } = decodeSuiPrivateKey(secret);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  const sponsorUrl = process.env.SPONSOR_URL?.trim();
  const signer = sponsorUrl
    ? createSponsoredKeypairSigner({
        keypair,
        client,
        network: "testnet",
        sponsorUrl,
      })
    : createKeypairSigner({ keypair, client });

  const sl = new StreamLine({
    network: "testnet",
    signer,
    client,
    indexerUrl: config.indexerUrl,
  });

  console.log("sender", signer.address);
  console.log("resolve", recipient);
  const resolved = await sl.resolve(recipient);
  console.log("→", resolved);

  const result = await sl.stream.to(recipient, {
    amountUsdc,
    durationDays,
    milestones: [{ name: "Delivery", amountUsdc }],
  });
  console.log("created", result);

  if (result.streamId) {
    try {
      const status = await sl.streams.get(result.streamId);
      console.log("indexer", status);
    } catch (e) {
      console.warn("indexer not ready yet:", e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
