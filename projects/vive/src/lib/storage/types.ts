export interface WalrusBlobRef {
  blobId: string;
  blobObjectId: string;
}

export interface PathIndexEntry {
  blobId: string;
  blobObjectId: string;
  updatedAt: string;
}

export interface PathIndex {
  type: "path-index";
  version: 1;
  entries: Record<string, PathIndexEntry>;
  updatedAt: string;
}

export interface ProjectRegistryRecord {
  projectId: string;
  title: string;
  walrusPathPrefix: string;
  ownerAddress: string;
  manifestPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRegistryDocument {
  type: "project-registry";
  version: 1;
  projects: ProjectRegistryRecord[];
  updatedAt: string;
}

export interface WalrusAssetVersion {
  version: number;
  savedAt: string;
  blobId?: string;
  blobObjectId?: string;
}
