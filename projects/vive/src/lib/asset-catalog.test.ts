import { describe, expect, test } from "bun:test";
import { enrichOnChainRefsWithCatalog, type CatalogAssetRef } from "./asset-catalog";

function ref(partial: Partial<CatalogAssetRef> & Pick<CatalogAssetRef, "id" | "title" | "folderId">): CatalogAssetRef {
  return {
    storagePhase: "script",
    assetKind: "script",
    fileType: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "ready",
    ...partial,
  };
}

describe("enrichOnChainRefsWithCatalog", () => {
  test("applies manifest titles by content blob id", () => {
    const enriched = enrichOnChainRefsWithCatalog(
      [
        ref({
          id: "deadbeef",
          title: "deadbeef",
          folderId: "scripts",
          contentBlobId: "blob-1",
        }),
      ],
      {
        scripts: [
          {
            id: "script-1",
            title: "Cinematic adventure",
            blobId: "blob-1",
            versions: [],
          },
        ],
        designAssets: [],
        storyboards: [],
        videos: [],
      },
    );

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.id).toBe("script-1");
    expect(enriched[0]?.title).toBe("Cinematic adventure");
  });

  test("applies manifest titles by asset id when blob ids do not match", () => {
    const enriched = enrichOnChainRefsWithCatalog(
      [
        ref({
          id: "script-2",
          title: "40dec31a",
          folderId: "scripts",
          contentBlobId: "on-chain-only-blob",
        }),
      ],
      {
        scripts: [
          {
            id: "script-2",
            title: "Pilot Episode",
            blobId: "local-cache:script-2:v1",
            versions: [{ version: 1, blobId: "local-cache:script-2:v1", savedAt: "" }],
          },
        ],
        designAssets: [],
        storyboards: [],
        videos: [],
      },
    );

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.title).toBe("Pilot Episode");
  });
});
