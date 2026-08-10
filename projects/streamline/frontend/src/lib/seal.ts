/**
 * Seal integration: encrypt a private stream's secrets (values + blindings) to
 * each party's *wallet identity*, and decrypt them with a session key.
 *
 * The ciphertext is stored on the ConfidentialStream object itself (dynamic
 * field, see `stream.move`), so a freelancer on a different wallet can fetch it
 * from chain and ask Seal's key servers for the decryption key. The key servers
 * grant it only if `streamline::stream::seal_approve` passes for the requester
 * — i.e. the wallet asking is the identity the blob was encrypted to.
 *
 * Identity layout: `id = <32-byte wallet address>`, namespaced by the original
 * (v1) package id. Move calls target the latest package version, but Seal pins
 * identity namespaces to the first version of a package.
 */
import type { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, fromHex, toBase64 } from "@mysten/sui/utils";
import { SealClient, SessionKey } from "@mysten/seal";

import type { NetworkName } from "./constants";

/** Verified independent key servers (testnet). */
const TESTNET_KEY_SERVERS = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

/** 1-of-2 so a single key server outage never locks anyone out (testnet). */
const THRESHOLD = 1;

const SESSION_TTL_MIN = 30;

/** Plaintext that rides (encrypted) on the stream object. All bigints as strings. */
export type PrivateStreamPayload = {
  v: 1;
  coinType: string;
  totalBase: string;
  milestones: number;
  freelancer: string;
  remainingBase: string;
  rRemaining: string;
  earnedBase: string;
  rEarned: string;
};

/** The on-chain blob: one Seal ciphertext per party, JSON-wrapped. */
type SecretsEnvelope = {
  v: 1;
  /** base64 Seal ciphertext encrypted to the stream sender's wallet. */
  s: string;
  /** base64 Seal ciphertext encrypted to the freelancer's wallet. */
  f: string;
};

let sealClient: SealClient | null = null;

export function getSealClient(suiClient: SuiClient): SealClient {
  if (!sealClient) {
    sealClient = new SealClient({
      // 1.36's SuiClient implements the experimental core API Seal needs; the
      // nominal types differ because seal bundles its own @mysten/sui.
      suiClient: suiClient as unknown as ConstructorParameters<
        typeof SealClient
      >[0]["suiClient"],
      serverConfigs: TESTNET_KEY_SERVERS,
      verifyKeyServers: false,
    });
  }
  return sealClient;
}

const idForAddress = (address: string) => address.replace(/^0x/, "");

/**
 * Encrypt `payload` separately to the sender's and freelancer's wallets and
 * pack both ciphertexts into the envelope stored on-chain.
 */
export async function encryptSecrets(args: {
  suiClient: SuiClient;
  /** Original (v1) package id — Seal's identity namespace. */
  sealNamespace: string;
  payload: PrivateStreamPayload;
  sender: string;
  freelancer: string;
}): Promise<Uint8Array> {
  const client = getSealClient(args.suiClient);
  const data = new TextEncoder().encode(JSON.stringify(args.payload));

  const encryptTo = async (address: string) => {
    const { encryptedObject } = await client.encrypt({
      threshold: THRESHOLD,
      packageId: args.sealNamespace,
      id: idForAddress(address),
      data,
    });
    return toBase64(encryptedObject);
  };

  const envelope: SecretsEnvelope = {
    v: 1,
    s: await encryptTo(args.sender),
    f: await encryptTo(args.freelancer),
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Decrypt the party's half of an on-chain secrets envelope.
 *
 * `currentPackageId` is the latest package version (where `seal_approve`
 * lives); the session key + ciphertext are namespaced by `sealNamespace`.
 */
export async function decryptSecrets(args: {
  suiClient: SuiClient;
  currentPackageId: string;
  envelopeBytes: Uint8Array;
  role: "sender" | "freelancer";
  sessionKey: SessionKey;
  address: string;
}): Promise<PrivateStreamPayload> {
  const client = getSealClient(args.suiClient);
  const envelope = JSON.parse(
    new TextDecoder().decode(args.envelopeBytes)
  ) as SecretsEnvelope;
  const ciphertext = fromBase64(args.role === "sender" ? envelope.s : envelope.f);

  const tx = new Transaction();
  tx.moveCall({
    target: `${args.currentPackageId}::stream::seal_approve`,
    arguments: [tx.pure.vector("u8", fromHex(idForAddress(args.address)))],
  });
  const txBytes = await tx.build({
    client: args.suiClient,
    onlyTransactionKind: true,
  });

  const plaintext = await client.decrypt({
    data: ciphertext,
    sessionKey: args.sessionKey,
    txBytes,
  });
  return JSON.parse(new TextDecoder().decode(plaintext)) as PrivateStreamPayload;
}

// === Session key management ===
//
// One Seal session per wallet+package, persisted for the TTL so the user signs
// a single personal message instead of one per decryption.

const sessionStorageKey = (address: string, network: NetworkName) =>
  `streamline:seal-session:${network}:${address}`;

export async function loadOrCreateSessionKey(args: {
  suiClient: SuiClient;
  address: string;
  network: NetworkName;
  /** Original (v1) package id — must match the encryption namespace. */
  sealNamespace: string;
  /** Asks the wallet to sign Seal's personal message (only on fresh sessions). */
  signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>;
}): Promise<SessionKey> {
  const storageKey = sessionStorageKey(args.address, args.network);
  const suiClient = args.suiClient as unknown as Parameters<
    typeof SessionKey.import
  >[1];

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const restored = SessionKey.import(JSON.parse(raw), suiClient);
      if (!restored.isExpired()) return restored;
    }
  } catch {
    // fall through to a fresh session
  }

  const session = await SessionKey.create({
    address: args.address,
    packageId: args.sealNamespace,
    ttlMin: SESSION_TTL_MIN,
    suiClient,
  });
  const { signature } = await args.signPersonalMessage(
    session.getPersonalMessage()
  );
  await session.setPersonalMessageSignature(signature);
  // SessionKey.export() returns an object with a non-enumerable toJSON that
  // throws ("This object is not serializable") to guard the secret key from
  // accidental JSON.stringify. Spread to keep only the enumerable fields so it
  // persists (and SessionKey.import can restore it).
  sessionStorage.setItem(storageKey, JSON.stringify({ ...session.export() }));
  return session;
}
