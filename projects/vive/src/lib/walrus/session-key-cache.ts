import {
  ExpiredSessionKeyError,
  SessionKey,
  type ExportedSessionKey,
  type SealCompatibleClient,
} from "@mysten/seal";
import { getVaultPackageId } from "../vault-package";

const SEAL_SESSION_CACHE_PREFIX = "content-seal-session:";

function sessionKeyCacheKey(address: string): string {
  return `${SEAL_SESSION_CACHE_PREFIX}${address}`;
}

export function readCachedSessionKey(
  address: string,
  suiClient: SealCompatibleClient,
): SessionKey | null {
  try {
    const raw = localStorage.getItem(sessionKeyCacheKey(address));
    if (!raw) return null;

    const data = JSON.parse(raw) as ExportedSessionKey;
    if (data.address !== address) return null;
    if (data.packageId !== getVaultPackageId()) return null;
    if (!data.personalMessageSignature) return null;

    return SessionKey.import(data, suiClient);
  } catch (error) {
    if (error instanceof ExpiredSessionKeyError) {
      clearCachedSessionKey(address);
    }
    return null;
  }
}

export function writeCachedSessionKey(key: SessionKey): void {
  const exported = key.export();
  const payload: ExportedSessionKey = {
    address: exported.address,
    packageId: exported.packageId,
    mvrName: exported.mvrName,
    creationTimeMs: exported.creationTimeMs,
    ttlMin: exported.ttlMin,
    personalMessageSignature: exported.personalMessageSignature,
    sessionKey: exported.sessionKey,
  };

  localStorage.setItem(
    sessionKeyCacheKey(key.getAddress()),
    JSON.stringify(payload),
  );
}

export function clearCachedSessionKey(address: string): void {
  localStorage.removeItem(sessionKeyCacheKey(address));
}

export function clearAllCachedSessionKeys(): void {
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(SEAL_SESSION_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
