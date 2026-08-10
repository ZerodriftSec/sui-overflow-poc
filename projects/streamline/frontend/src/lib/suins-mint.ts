import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

import type { NetworkName } from "@/lib/constants";

/**
 * Mint SuiNS *leaf* subnames under our parent domain, signed by a backend admin
 * key that owns the domain — no Enoki paid plan needed. A leaf subname has no
 * NFT: the parent owns it, it just points a name at a target address, and the
 * parent can remove it. Perfect for `alice.streamline.sui` → alice's wallet.
 *
 * The move call + object ids mirror `@mysten/suins`'s `createLeafSubName`
 * (mainPackage.testnet), reproduced here so we stay on @mysten/sui v1.
 */

const SUINS: Record<string, { suins: string; subnamesPkg: string }> = {
  testnet: {
    suins: "0x300369e8909b9a6464da265b9a5a9ab6fe2158a040e84e808628cde7a07ee5a3",
    subnamesPkg:
      "0x3c272bc45f9157b7818ece4f7411bdfa8af46303b071aca4e18c03119c9ff636",
  },
  mainnet: {
    suins: process.env.SUINS_OBJECT_MAINNET?.trim() ?? "",
    subnamesPkg: process.env.SUINS_SUBNAMES_PACKAGE_MAINNET?.trim() ?? "",
  },
};

const REGISTRATION_TYPE = "suins_registration::SuinsRegistration";

export function adminSecretKey(): string {
  return process.env.SUINS_ADMIN_SECRET_KEY?.trim() || "";
}

export function suinsMintConfigured(network: NetworkName): boolean {
  const cfg = SUINS[network === "mainnet" ? "mainnet" : "testnet"];
  return !!(adminSecretKey() && cfg?.suins && cfg?.subnamesPkg);
}

function adminKeypair(): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(adminSecretKey());
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/** Parent SuinsRegistration NFT for `domain`, owned by `owner`. Pinnable via env. */
async function parentNftId(
  client: SuiClient,
  owner: string,
  domain: string
): Promise<string> {
  const pinned = process.env.SUINS_PARENT_NFT_ID?.trim();
  if (pinned) return pinned;

  let cursor: string | null | undefined = null;
  for (let page = 0; page < 10; page++) {
    const res = await client.getOwnedObjects({
      owner,
      options: { showType: true, showContent: true },
      cursor,
      limit: 50,
    });
    for (const o of res.data) {
      if (!o.data?.type?.includes(REGISTRATION_TYPE)) continue;
      const fields = (o.data.content as { fields?: { domain_name?: string } })
        ?.fields;
      if (fields?.domain_name === domain) return o.data.objectId;
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }
  throw new Error(`Parent domain ${domain} not held by admin ${owner}`);
}

/** Create `<subname>.<domain>` as a leaf pointing at `targetAddress`. */
export async function mintLeafSubname(opts: {
  client: SuiClient;
  network: NetworkName;
  subname: string; // bare label, e.g. "alice"
  targetAddress: string;
  domain: string; // e.g. "streamline.sui"
}): Promise<{ name: string; digest: string }> {
  const cfg = SUINS[opts.network === "mainnet" ? "mainnet" : "testnet"];
  if (!cfg?.suins || !cfg?.subnamesPkg) {
    throw new Error(`SuiNS not configured for ${opts.network}`);
  }
  const keypair = adminKeypair();
  const owner = keypair.toSuiAddress();
  const parent = await parentNftId(opts.client, owner, opts.domain);
  const name = `${opts.subname}.${opts.domain}`;

  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.subnamesPkg}::subdomains::new_leaf`,
    arguments: [
      tx.object(cfg.suins),
      tx.object(parent),
      tx.object(SUI_CLOCK_OBJECT_ID),
      tx.pure.string(name),
      tx.pure.address(opts.targetAddress),
    ],
  });

  const res = await opts.client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (res.effects?.status.status !== "success") {
    throw new Error(res.effects?.status.error || "subname mint reverted");
  }
  return { name, digest: res.digest };
}
