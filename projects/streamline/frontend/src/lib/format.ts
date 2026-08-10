import type { NetworkName } from "./networks";

/** 0x1234…cdef — truncated address for compact display. */
export function shortAddress(addr: string, lead = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + tail + 2) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** SuiScan explorer URL for an address or object on a given network. */
export function explorerUrl(
  network: NetworkName,
  kind: "account" | "object" | "tx",
  id: string
): string {
  const path =
    kind === "account" ? "account" : kind === "object" ? "object" : "tx";
  return `https://suiscan.xyz/${network}/${path}/${id}`;
}

/** Copy text to clipboard, resolving false if unavailable. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
