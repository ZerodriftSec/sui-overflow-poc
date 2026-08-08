/**
 * Offline gift-card checks (no Sui CLI / no on-chain).
 * Run: npx tsx scripts/test-giftcard.ts
 */
import assert from "node:assert/strict";
import { blake2b } from "@noble/hashes/blake2b";
import { hexToBytes } from "@noble/hashes/utils";

import { commit, randomBlinding } from "../src/lib/confidential";
import { allowedMoveCallTargets } from "../src/lib/enoki-targets";
import {
  blindingFromHex,
  blindingToHex,
  buildGiftCardUrl,
  generateGiftCardSecrets,
  isGiftCardPath,
  parseGiftCardUrl,
} from "../src/lib/giftcard";
import {
  buildCancelGiftCard,
  buildClaimGiftCard,
  buildCreateGiftCard,
  findCreatedGiftCardId,
} from "../src/lib/streamline-tx";

function moveCalls(tx: {
  getData: () => { commands: Array<Record<string, unknown>> };
}): Array<{ module: string; function: string; argCount: number }> {
  return tx.getData().commands.flatMap((c) => {
    const mc = c.MoveCall as
      | { module?: string; function?: string; arguments?: unknown[] }
      | undefined;
    if (!mc?.module || !mc.function) return [];
    return [
      {
        module: mc.module,
        function: mc.function,
        argCount: mc.arguments?.length ?? 0,
      },
    ];
  });
}

async function main() {
  // --- URL / secret ---
  const secrets = generateGiftCardSecrets();
  assert.equal(secrets.secretHex.length, 64);
  assert.equal(secrets.claimHash.length, 32);
  assert.deepEqual(
    Array.from(blake2b(secrets.secretBytes, { dkLen: 32 })),
    secrets.claimHash
  );

  const rHex = blindingToHex(secrets.blinding);
  assert.equal(rHex.length, 64);
  assert.equal(blindingFromHex(rHex), secrets.blinding);

  const amountBase = 25_000_000n;
  const cardId = "0x" + "ab".repeat(32);
  const url = buildGiftCardUrl("http://localhost:3000", {
    cardId,
    secretHex: secrets.secretHex,
    amountBase,
    blinding: secrets.blinding,
  });
  assert.match(url, /^http:\/\/localhost:3000\/g\/0x[0-9a-f]{64}\?/);
  assert.ok(isGiftCardPath(new URL(url).pathname));

  const parsed = parseGiftCardUrl(url);
  assert.ok(parsed);
  assert.equal(parsed!.cardId, cardId);
  assert.equal(parsed!.secretHex, secrets.secretHex);
  assert.equal(parsed!.amountBase, amountBase);
  assert.equal(parsed!.blinding, secrets.blinding);
  assert.equal(
    parseGiftCardUrl(`http://localhost:3000/g/${cardId}?s=${secrets.secretHex}`),
    null
  );
  assert.deepEqual(
    Array.from(blake2b(hexToBytes(parsed!.secretHex), { dkLen: 32 })),
    secrets.claimHash
  );

  // --- Poseidon commitment (amount privacy surface) ---
  const blinding = randomBlinding();
  const c1 = await commit(amountBase, blinding);
  assert.equal(c1.length, 32);
  assert.deepEqual(Array.from(c1), Array.from(await commit(amountBase, blinding)));
  assert.notDeepEqual(
    Array.from(c1),
    Array.from(await commit(amountBase, randomBlinding()))
  );

  // --- Object discovery (must not match GiftCardVault) ---
  assert.equal(
    findCreatedGiftCardId([
      {
        type: "created",
        objectId: "0xid",
        objectType: "0xpkg::giftcard::GiftCard",
      },
    ]),
    "0xid"
  );
  assert.equal(
    findCreatedGiftCardId([
      {
        type: "created",
        objectId: "0xv",
        objectType: "0xpkg::giftcard::GiftCardVault<0x2::sui::SUI>",
      },
    ]),
    undefined
  );

  // --- PTB wiring ---
  const create = moveCalls(
    buildCreateGiftCard({
      packageId: "0xabc",
      usdcType: "0x2::sui::SUI",
      vaultId: "0x" + "22".repeat(32),
      sender: "0x" + "33".repeat(32),
      amountBase,
      commitment: c1,
      wrapProof: new Uint8Array(128),
      claimHash: secrets.claimHash,
    })
  );
  assert.deepEqual(create, [
    { module: "giftcard", function: "create", argCount: 7 },
  ]);

  const claim = moveCalls(
    buildClaimGiftCard({
      packageId: "0xabc",
      usdcType: "0x2::sui::SUI",
      vaultId: "0x" + "22".repeat(32),
      sender: "0x" + "33".repeat(32),
      cardId: "0x" + "44".repeat(32),
      secretBytes: secrets.secretBytes,
      value: amountBase,
      unwrapProof: new Uint8Array(128),
    })
  );
  assert.deepEqual(claim, [
    { module: "giftcard", function: "claim", argCount: 6 },
  ]);

  const cancel = moveCalls(
    buildCancelGiftCard({
      packageId: "0xabc",
      usdcType: "0x2::sui::SUI",
      vaultId: "0x" + "22".repeat(32),
      sender: "0x" + "33".repeat(32),
      cardId: "0x" + "44".repeat(32),
      value: amountBase,
      unwrapProof: new Uint8Array(128),
    })
  );
  assert.deepEqual(cancel, [
    { module: "giftcard", function: "cancel", argCount: 4 },
  ]);

  // --- Enoki ---
  const targets = allowedMoveCallTargets("testnet");
  for (const t of ["create_vault", "create", "claim", "cancel"]) {
    assert.ok(
      targets.some((x) => x.endsWith(`::giftcard::${t}`)),
      `missing enoki target giftcard::${t}`
    );
  }

  console.log("giftcard offline checks: OK");
  console.log("  URL/secret roundtrip, Poseidon commit, PTB arity, Enoki, id matcher");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
