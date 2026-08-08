"use client";

import { useAddressLabel } from "@/lib/use-resolve-recipient";

/** Prefer SuiNS handle when available, else shortened hex. */
export function AddressLabel({
  address,
  head = 4,
  tail = 4,
  className,
}: {
  address: string;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const label = useAddressLabel(address, head, tail);
  return <span className={className}>{label}</span>;
}
