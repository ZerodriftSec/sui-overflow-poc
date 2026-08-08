import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex, toHex } from "@mysten/sui/utils";

/** Match Move `utils::name_hash`: blake2b256(project_id_bytes || name_bytes). */
export function computeNameHash(projectId: string, name: string): Uint8Array {
  const projectBytes = fromHex(projectId);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(projectBytes.length + nameBytes.length);
  data.set(projectBytes, 0);
  data.set(nameBytes, projectBytes.length);
  return blake2b(data, { dkLen: 32 });
}

export function nameHashToBytes(hash: Uint8Array): number[] {
  return Array.from(hash);
}

export function bytesToUtf8Vector(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

export function utf8VectorToString(bytes: number[] | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder().decode(arr);
}

/** Seal identity: project_id_bytes || optional_file_id_bytes || nonce */
export function buildSealIdentity(input: {
  projectId: string;
  fileId?: string;
  nonce?: Uint8Array;
}): { idBytes: Uint8Array; idHex: string } {
  const nonce = input.nonce ?? crypto.getRandomValues(new Uint8Array(5));
  const projectBytes = fromHex(input.projectId);
  const fileBytes = input.fileId ? fromHex(input.fileId) : new Uint8Array();
  const idBytes = new Uint8Array(projectBytes.length + fileBytes.length + nonce.length);
  idBytes.set(projectBytes, 0);
  idBytes.set(fileBytes, projectBytes.length);
  idBytes.set(nonce, projectBytes.length + fileBytes.length);
  return { idBytes, idHex: toHex(idBytes) };
}

export function contentHash(bytes: Uint8Array): number[] {
  return Array.from(blake2b(bytes, { dkLen: 32 }));
}
