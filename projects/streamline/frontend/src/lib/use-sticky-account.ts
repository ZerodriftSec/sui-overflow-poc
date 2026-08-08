"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

type Account = NonNullable<ReturnType<typeof useCurrentAccount>>;

/**
 * Wallet account that tolerates brief null flickers during Slush / extension
 * connect finalization (otherwise onboarding snaps back to intro for ~1s).
 */
export function useStickyAccount(graceMs = 900): Account | null {
  const account = useCurrentAccount();
  const [sticky, setSticky] = useState<Account | null>(account ?? null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (account) {
      if (graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = null;
      }
      setSticky(account);
      return;
    }
    graceRef.current = setTimeout(() => {
      setSticky(null);
      graceRef.current = null;
    }, graceMs);
    return () => {
      if (graceRef.current) clearTimeout(graceRef.current);
    };
  }, [account, graceMs]);

  return account ?? sticky;
}
