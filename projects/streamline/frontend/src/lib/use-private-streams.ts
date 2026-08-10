"use client";

import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";

import { useNetworkVariable } from "./networks";
import {
  fetchPrivateStream,
  findPrivateStreamIds,
  type PrivateStreamOnChain,
} from "./private-streams";
import { loadSecrets } from "./confidential-store";

export type PrivateRole = "sender" | "freelancer";

/**
 * Private streams for the connected wallet in a given role. Reads the chain
 * directly (no indexer — amounts are hidden): discovery via ConfStreamCreated
 * events + the local secrets cache, state via object reads.
 */
export function usePrivateStreams(role: PrivateRole) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const confPackageId = useNetworkVariable("confPackageId");
  const addr = account?.address;

  return useQuery({
    queryKey: ["private-streams", addr, role],
    enabled: !!addr && confPackageId !== "0x0",
    refetchInterval: 15_000,
    queryFn: async (): Promise<PrivateStreamOnChain[]> => {
      const eventIds = await findPrivateStreamIds(client, confPackageId, addr!);
      const localIds = loadSecrets(addr!).map((s) => s.streamId);
      const ids = [...new Set([...eventIds, ...localIds])];
      const streams = await Promise.all(
        ids.map((id) => fetchPrivateStream(client, id).catch(() => null))
      );
      return streams
        .filter((s): s is PrivateStreamOnChain => !!s)
        .filter((s) =>
          role === "sender" ? s.sender === addr : s.freelancer === addr
        )
        .filter((s) => s.state !== 4 || s.reserve > 0n);
    },
  });
}
