'use client';

import { useEffect, useState } from 'react';
import type { ChainRegistryMap, MergedChainRegistryEntry } from '@noderails/common';
import { chainRegistryMapFromList } from '@noderails/common';
import * as api from '@/lib/api';

let cachedMap: ChainRegistryMap | null = null;
let inflight: Promise<ChainRegistryMap> | null = null;

async function loadChainRegistryMap(): Promise<ChainRegistryMap> {
  if (cachedMap) return cachedMap;
  if (inflight) return inflight;

  inflight = api
    .getChainRegistry()
    .then((res) => {
      const map = chainRegistryMapFromList(res.chains);
      cachedMap = map;
      return map;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useChainRegistry(): {
  registry: ChainRegistryMap | undefined;
  loading: boolean;
} {
  const [registry, setRegistry] = useState<ChainRegistryMap | undefined>(cachedMap ?? undefined);
  const [loading, setLoading] = useState(!cachedMap);

  useEffect(() => {
    let cancelled = false;
    loadChainRegistryMap()
      .then((map) => {
        if (!cancelled) setRegistry(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { registry, loading };
}

export type { MergedChainRegistryEntry };
