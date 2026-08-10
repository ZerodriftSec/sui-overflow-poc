import { SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { getVaultPackageId } from "../vault-package";

export async function createSignedSessionKey(input: {
  address: string;
  suiClient: SealCompatibleClient;
  signPersonalMessage: (message: Uint8Array) => Promise<{ signature: string }>;
  ttlMin?: number;
}): Promise<SessionKey> {
  const sessionKey = await SessionKey.create({
    address: input.address,
    packageId: getVaultPackageId(),
    ttlMin: input.ttlMin ?? 10,
    suiClient: input.suiClient,
  });

  const signed = await input.signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signed.signature);
  return sessionKey;
}

export function isSessionKeyValid(
  sessionKey: SessionKey | null,
  address: string,
): sessionKey is SessionKey {
  return (
    sessionKey !== null &&
    !sessionKey.isExpired() &&
    sessionKey.getAddress() === address
  );
}
