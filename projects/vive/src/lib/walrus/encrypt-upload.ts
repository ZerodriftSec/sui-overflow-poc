import type { SealClient } from "@mysten/seal";
import {
  DEFAULT_WALRUS_EPOCHS,
  SEAL_THRESHOLD,
  type WalrusService,
} from "./constants";
import { fetchWalrusEndpointWithFailover } from "./provider-service";
import { getVaultPackageId } from "../vault-package";
import { buildSealIdentity } from "../storage/name-hash";

export interface WalrusUploadResult {
  blobId: string;
  blobObjectId: string;
  endEpoch: number;
}

interface WalrusStorageInfo {
  newlyCreated?: {
    blobObject: {
      blobId: string;
      id: string;
      storage: { endEpoch: number };
    };
  };
  alreadyCertified?: {
    blobId: string;
    endEpoch: number;
  };
}

export async function encryptBytes(input: {
  sealClient: SealClient;
  projectId: string;
  fileId?: string;
  plaintext: Uint8Array;
}): Promise<Uint8Array> {
  const { idHex } = buildSealIdentity({
    projectId: input.projectId,
    fileId: input.fileId,
  });

  const { encryptedObject } = await input.sealClient.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: getVaultPackageId(),
    id: idHex,
    data: input.plaintext,
  });

  return encryptedObject;
}

export async function uploadBytesToWalrus(input: {
  bytes: Uint8Array;
  ownerAddress: string;
  epochs?: number;
  service?: WalrusService;
}): Promise<WalrusUploadResult> {
  const epochs = input.epochs ?? DEFAULT_WALRUS_EPOCHS;
  const { response } = await fetchWalrusEndpointWithFailover({
    endpoint: "publisher",
    path: `/v1/blobs?send_object_to=${input.ownerAddress}&epochs=${epochs}&deletable=true`,
    service: input.service,
    init: {
      method: "PUT",
      body: new Blob([Uint8Array.from(input.bytes)]),
    },
  });

  const info = (await response.json()) as WalrusStorageInfo;

  if (info.newlyCreated) {
    return {
      blobId: info.newlyCreated.blobObject.blobId,
      blobObjectId: info.newlyCreated.blobObject.id,
      endEpoch: info.newlyCreated.blobObject.storage.endEpoch,
    };
  }

  if (info.alreadyCertified) {
    return {
      blobId: info.alreadyCertified.blobId,
      blobObjectId: "",
      endEpoch: info.alreadyCertified.endEpoch,
    };
  }

  throw new Error("Unexpected Walrus upload response.");
}

export async function encryptAndUploadBytes(input: {
  sealClient: SealClient;
  projectId: string;
  fileId?: string;
  bytes: Uint8Array;
  ownerAddress: string;
  epochs?: number;
  service?: WalrusService;
}): Promise<WalrusUploadResult> {
  const encrypted = await encryptBytes({
    sealClient: input.sealClient,
    projectId: input.projectId,
    fileId: input.fileId,
    plaintext: input.bytes,
  });

  return uploadBytesToWalrus({
    bytes: encrypted,
    ownerAddress: input.ownerAddress,
    epochs: input.epochs,
    service: input.service,
  });
}
