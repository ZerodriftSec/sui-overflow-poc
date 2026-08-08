"use client";

import { useCallback, useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";

import { isHexAddress } from "./handle";
import {
  resolveRecipient,
  reverseResolveHandle,
  type ResolvedRecipient,
} from "./suins";

/**
 * Resolve a typed recipient (handle or 0x) to an address before submitting a tx.
 */
export async function resolveRecipientOrThrow(
  client: Parameters<typeof resolveRecipient>[0],
  input: string
): Promise<ResolvedRecipient> {
  const resolved = await resolveRecipient(client, input);
  if (!resolved) {
    throw new Error(
      "Could not resolve recipient. Use a @handle or a full Sui address (0x + 64 hex)."
    );
  }
  return resolved;
}

/** True when the field looks like a complete address or plausible handle. */
export function looksLikeRecipient(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  if (isHexAddress(t)) return true;
  // Don't treat bare "0x" drafts as ready.
  if (t.startsWith("0x")) return false;
  return t.length >= 3;
}

/**
 * Display label for an address: prefer SuiNS handle, else shortened hex.
 */
export function useAddressLabel(
  address: string | null | undefined,
  head = 4,
  tail = 4
): string {
  const client = useSuiClient();
  const [label, setLabel] = useState(() =>
    address ? shortFallback(address, head, tail) : ""
  );

  useEffect(() => {
    if (!address || !isHexAddress(address)) {
      setLabel(address ? shortFallback(address, head, tail) : "");
      return;
    }
    let cancelled = false;
    setLabel(shortFallback(address, head, tail));
    void reverseResolveHandle(client, address).then((h) => {
      if (!cancelled && h) setLabel(h);
    });
    return () => {
      cancelled = true;
    };
  }, [address, client, head, tail]);

  return label;
}

function shortFallback(address: string, head: number, tail: number): string {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head + 2)}…${address.slice(-tail)}`;
}

export function useResolveOnBlur() {
  const client = useSuiClient();
  return useCallback(
    async (input: string) => resolveRecipient(client, input),
    [client]
  );
}
