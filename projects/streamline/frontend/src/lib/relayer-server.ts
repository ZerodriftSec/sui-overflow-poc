/**
 * Server-only privacy relayer helpers. Holds the submitter keypair and rebuilds
 * allowlisted Move PTBs so clients cannot drain arbitrary coins.
 */
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

import { FULLNODE_URLS, PACKAGE_IDS, SHIELDED_POOL, USDC_TYPE, type NetworkName } from "@/lib/constants";

export const SUI_ADDR = /^0x[0-9a-fA-F]{64}$/;
export const U256_DEC = /^\d+$/;

function secretKey(): string {
  return process.env.PRIVACY_RELAYER_SUI_PRIVATE_KEY?.trim() || "";
}

export function relayerEnabled(): boolean {
  if (process.env.PRIVACY_RELAYER_ENABLED === "0") return false;
  return !!secretKey();
}

export function relayerKeypair(): Ed25519Keypair | null {
  const secret = secretKey();
  if (!secret) return null;
  return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(secret).secretKey);
}

export function relayerAddress(): string | null {
  const kp = relayerKeypair();
  return kp ? kp.getPublicKey().toSuiAddress() : null;
}

export function rpcUrl(network: NetworkName): string {
  if (network === "testnet") {
    return process.env.NEXT_PUBLIC_SUI_TESTNET_RPC?.trim() || FULLNODE_URLS.testnet;
  }
  if (network === "mainnet") {
    return process.env.NEXT_PUBLIC_SUI_MAINNET_RPC?.trim() || FULLNODE_URLS.mainnet;
  }
  return process.env.NEXT_PUBLIC_SUI_DEVNET_RPC?.trim() || getFullnodeUrl("devnet");
}

export function suiClient(network: NetworkName): SuiClient {
  return new SuiClient({ url: rpcUrl(network) });
}

const u8 = (tx: Transaction, b: Uint8Array) =>
  tx.pure.vector("u8", Array.from(b));

function decodeProof(b64: string): Uint8Array {
  const bytes = fromBase64(b64);
  if (bytes.length < 64 || bytes.length > 2048) {
    throw new Error("invalid_proof");
  }
  return bytes;
}

function assertAddr(a: string, label: string) {
  if (!SUI_ADDR.test(a)) throw new Error(`invalid_${label}`);
}

function assertU256(s: string, label: string) {
  if (!U256_DEC.test(s) || s.length > 80) throw new Error(`invalid_${label}`);
}

function resolvePackage(network: NetworkName, packageId?: string): string {
  if (packageId && SUI_ADDR.test(packageId)) return packageId;
  const pkg = PACKAGE_IDS[network];
  if (!pkg || pkg === "0x0") throw new Error("package_not_configured");
  return pkg;
}

function resolvePool(network: NetworkName, poolId?: string): string {
  if (poolId && SUI_ADDR.test(poolId)) return poolId;
  const id = SHIELDED_POOL[network];
  if (!id || id === "0x0") throw new Error("pool_not_configured");
  return id;
}

function resolveCoin(network: NetworkName, coinType?: string): string {
  if (coinType && coinType.includes("::")) return coinType;
  return USDC_TYPE[network];
}

// --- Rate limit (per IP, in-memory) ---

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

export function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

export type RelayerKind =
  | "spend"
  | "withdraw"
  | "settle"
  | "deposit"
  | "open";

export type RelayerSubmitBody = {
  network?: NetworkName;
  kind?: RelayerKind;
  packageId?: string;
  coinType?: string;
  poolId?: string;
  // spend
  root?: string;
  nf?: string;
  cm1?: string;
  cm2?: string;
  proofB64?: string;
  cipher1B64?: string;
  // withdraw
  amount?: string;
  cmChange?: string;
  recipient?: string;
  // settle
  engagementId?: string;
  paramsCommitment?: string;
  nowSec?: string;
  workerCipherB64?: string;
  // deposit / open
  cm?: string;
  amountBase?: string;
  ciphertextB64?: string;
};

export function buildRelayerTx(
  body: RelayerSubmitBody,
  sender: string
): Transaction {
  const network = (body.network ?? "testnet") as NetworkName;
  const kind = body.kind;
  if (!kind) throw new Error("missing_kind");

  const packageId = resolvePackage(network, body.packageId);
  const coinType = resolveCoin(network, body.coinType);
  const poolId = resolvePool(network, body.poolId);
  const proof = body.proofB64 ? decodeProof(body.proofB64) : null;

  const tx = new Transaction();
  tx.setSender(sender);

  if (kind === "spend") {
    if (!proof || !body.root || !body.nf || !body.cm1 || !body.cm2) {
      throw new Error("missing_spend_fields");
    }
    assertU256(body.root, "root");
    assertU256(body.nf, "nf");
    assertU256(body.cm1, "cm1");
    assertU256(body.cm2, "cm2");
    tx.moveCall({
      target: `${packageId}::shielded_pool::spend`,
      typeArguments: [coinType],
      arguments: [
        tx.object(poolId),
        tx.pure.u256(BigInt(body.root)),
        tx.pure.u256(BigInt(body.nf)),
        tx.pure.u256(BigInt(body.cm1)),
        tx.pure.u256(BigInt(body.cm2)),
        u8(tx, proof),
      ],
    });
    if (body.cipher1B64) {
      const c = fromBase64(body.cipher1B64);
      tx.moveCall({
        target: `${packageId}::shielded_pool::publish_note`,
        typeArguments: [coinType],
        arguments: [tx.object(poolId), tx.pure.u256(BigInt(body.cm1)), u8(tx, c)],
      });
    }
    return tx;
  }

  if (kind === "withdraw") {
    if (!proof || !body.root || !body.nf || !body.amount || !body.cmChange || !body.recipient) {
      throw new Error("missing_withdraw_fields");
    }
    assertAddr(body.recipient, "recipient");
    assertU256(body.root, "root");
    assertU256(body.nf, "nf");
    assertU256(body.cmChange, "cmChange");
    const coin = tx.moveCall({
      target: `${packageId}::shielded_pool::withdraw`,
      typeArguments: [coinType],
      arguments: [
        tx.object(poolId),
        tx.pure.u256(BigInt(body.root)),
        tx.pure.u256(BigInt(body.nf)),
        tx.pure.u64(BigInt(body.amount)),
        tx.pure.u256(BigInt(body.cmChange)),
        u8(tx, proof),
      ],
    });
    tx.transferObjects([coin], tx.pure.address(body.recipient));
    return tx;
  }

  if (kind === "settle") {
    if (
      !proof ||
      !body.root ||
      !body.nf ||
      !body.cm1 ||
      !body.cm2 ||
      !body.engagementId ||
      !body.paramsCommitment ||
      !body.nowSec
    ) {
      throw new Error("missing_settle_fields");
    }
    assertAddr(body.engagementId, "engagementId");
    assertU256(body.root, "root");
    assertU256(body.nf, "nf");
    assertU256(body.cm1, "cm1");
    assertU256(body.cm2, "cm2");
    assertU256(body.paramsCommitment, "paramsCommitment");
    const workerCipher = body.workerCipherB64
      ? fromBase64(body.workerCipherB64)
      : new Uint8Array();
    tx.moveCall({
      target: `${packageId}::private_stream::settle_vested`,
      typeArguments: [coinType],
      arguments: [
        tx.object(poolId),
        tx.object(body.engagementId),
        tx.pure.u256(BigInt(body.root)),
        tx.pure.u256(BigInt(body.nf)),
        tx.pure.u256(BigInt(body.cm1)),
        tx.pure.u256(BigInt(body.cm2)),
        tx.pure.u256(BigInt(body.paramsCommitment)),
        tx.pure.u64(BigInt(body.nowSec)),
        u8(tx, proof),
        u8(tx, workerCipher),
        tx.object("0x6"),
      ],
    });
    return tx;
  }

  if (kind === "deposit" || kind === "open") {
    // The relayer must NEVER fund deposit principal from its own balance: an
    // unauthenticated caller can pass their own commitment + a matching proof
    // and sweep whatever USDC the relayer holds into a note they control. So
    // funding open/deposit is user-signed client-side (Enoki-sponsored gas);
    // the relayer only relays proof-only ops (spend/settle/withdraw) that move
    // no principal out of it.
    throw new Error("relayer_deposit_disabled");
  }

  throw new Error("unsupported_kind");
}
