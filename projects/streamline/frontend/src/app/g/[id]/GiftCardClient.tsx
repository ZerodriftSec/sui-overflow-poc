"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { StreamLineMark } from "@/components/landing/StreamLineMark";
import { PhoneClaimGiftCardView } from "@/components/app/phone/PhoneClaimGiftCardView";
import {
  blindingFromHex,
  type GiftCardParams,
} from "@/lib/giftcard";

/**
 * Shared-link landing for gift cards opened outside the phone shell
 * (e.g. pasted into a browser). Stays a fixed phone-sized frame so the
 * layout doesn’t jump; in-app scans claim inside PhoneAppShell instead.
 */
export default function GiftCardClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  const gift = useMemo((): GiftCardParams | null => {
    const rawId = params.id ?? "";
    const id = rawId.startsWith("0x") ? rawId : `0x${rawId}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return null;
    const s = (search.get("s") ?? "").replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{64}$/.test(s)) return null;
    const vRaw = search.get("v") ?? "";
    if (!/^\d+$/.test(vRaw)) return null;
    const amountBase = BigInt(vRaw);
    if (amountBase <= 0n) return null;
    const blinding = blindingFromHex(search.get("r") ?? "");
    if (blinding === null) return null;
    return {
      cardId: id.toLowerCase(),
      secretHex: s.toLowerCase(),
      amountBase,
      blinding,
    };
  }, [params.id, search]);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[#eceae6] px-4 py-8">
      <div className="flex h-[min(720px,100dvh-4rem)] w-full max-w-[390px] flex-col overflow-hidden rounded-[2rem] border border-black/8 bg-[#f6f6f4] shadow-[0_24px_60px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center px-4 pb-2 pt-5">
          <Link href="/" className="flex items-center gap-2">
            <StreamLineMark size="sm" />
            <span className="text-sm font-bold tracking-tight text-[#111]">
              StreamLine
            </span>
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 pb-4">
          {gift ? (
            <PhoneClaimGiftCardView
              gift={gift}
              onDone={() => router.push("/")}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
              <p className="text-sm font-semibold text-[#111]">Invalid gift card</p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#666]">
                This URL is missing a valid card id, secret, or opening. Ask the
                sender for a fresh link.
              </p>
              <Link
                href="/"
                className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b54e6]"
              >
                Back to StreamLine
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
