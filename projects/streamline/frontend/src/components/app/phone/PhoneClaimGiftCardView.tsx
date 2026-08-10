"use client";

import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { hexToBytes } from "@noble/hashes/utils";

import { WalletButton } from "@/components/wallet/WalletButton";
import { proveUnwrap } from "@/lib/confidential";
import type { GiftCardParams } from "@/lib/giftcard";
import { useNetworkVariable } from "@/lib/networks";
import { USDC_BASE } from "@/lib/stream-math";
import { useGaslessExecute } from "@/lib/use-gasless";
import { buildClaimGiftCard } from "@/lib/streamline-tx";
import { phoneFlowFooter, phoneGlassCard } from "./phoneStyles";

type PhoneClaimGiftCardViewProps = {
  gift: GiftCardParams;
  onDone?: () => void;
};

const btnPrimary =
  "w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";

export function PhoneClaimGiftCardView({
  gift,
  onDone,
}: PhoneClaimGiftCardViewProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const vaultId = useNetworkVariable("giftCardVaultId");
  const { execute, isPending } = useGaslessExecute();
  const [status, setStatus] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [proving, setProving] = useState(false);

  const { data: obj, isLoading, error } = useSuiClientQuery(
    "getObject",
    {
      id: gift.cardId,
      options: { showContent: true, showType: true },
    },
    { refetchInterval: claimed ? false : 12_000 }
  );

  const fields = useMemo(() => {
    const content = obj?.data?.content;
    if (!content || content.dataType !== "moveObject") return null;
    const f = content.fields as Record<string, unknown>;
    return {
      claimed: Boolean(f.claimed),
      note: String(f.note ?? ""),
      expiresMs: Number(f.expires_ms ?? 0),
      sender: String(f.sender ?? ""),
    };
  }, [obj]);

  const usd = (Number(gift.amountBase) / USDC_BASE).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const onClaim = async () => {
    if (!account) {
      setStatus("Connect a wallet to claim.");
      return;
    }
    if (!vaultId || vaultId === "0x0") {
      setStatus("Gift card vault not configured on this network yet.");
      return;
    }
    if (fields?.claimed) {
      setStatus("This gift card was already claimed.");
      return;
    }
    try {
      setProving(true);
      setStatus("Proving unwrap…");
      const { proof } = await proveUnwrap(gift.amountBase, gift.blinding);
      setProving(false);
      setStatus("Claiming…");
      const tx = buildClaimGiftCard({
        packageId,
        usdcType,
        vaultId,
        sender: account.address,
        cardId: gift.cardId,
        secretBytes: hexToBytes(gift.secretHex),
        value: gift.amountBase,
        unwrapProof: proof,
      });
      execute(tx, {
        onSuccess: async ({ digest }) => {
          await client.waitForTransaction({ digest });
          setClaimed(true);
          setStatus(`Claimed — ${digest.slice(0, 12)}…`);
          // Brief beat so the success state is visible, then back to home.
          window.setTimeout(() => onDone?.(), 900);
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setProving(false);
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
          Gift card
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#111]">
          {claimed || fields?.claimed ? "Claimed" : "You’ve been sent USDC"}
        </h2>

        <div className={`${phoneGlassCard} mt-4 space-y-2 p-4`}>
          {isLoading && (
            <p className="text-[12px] text-[#666]">Loading gift card…</p>
          )}
          {error && (
            <p className="text-[12px] text-[#b45309]">
              Couldn’t load this gift card. It may not be published on this
              network yet.
            </p>
          )}
          <p className="text-2xl font-bold tracking-tight text-[#111]">{usd}</p>
          <p className="text-[11px] text-[#888]">
            Amount from your link — hidden on-chain until claim.
          </p>
          {fields?.note ? (
            <p className="text-[12px] text-[#555]">{fields.note}</p>
          ) : null}
          {fields && (
            <p className="font-mono text-[9px] text-[#999]">
              from {fields.sender.slice(0, 8)}…{fields.sender.slice(-6)}
            </p>
          )}
          {fields && fields.expiresMs > 0 && (
            <p className="text-[10px] text-[#888]">
              Expires {new Date(fields.expiresMs).toLocaleString()}
            </p>
          )}
        </div>

        {!account ? (
          <div className="mt-4 flex h-11 items-center justify-center">
            <WalletButton className="sl-glass-btn sl-glass-btn-primary !px-6 !py-2.5 !text-[11px]" />
          </div>
        ) : (
          <div className="mt-4 h-11" aria-hidden />
        )}

        <p className="mt-3 min-h-[2.5rem] text-[11px] leading-snug text-[#555]">
          {status ?? ""}
        </p>
      </div>
      <div className={phoneFlowFooter}>
        <button
          type="button"
          className={btnPrimary}
          disabled={
            isPending ||
            proving ||
            !account ||
            claimed ||
            fields?.claimed ||
            isLoading ||
            !!error
          }
          onClick={() => void onClaim()}
        >
          {proving || isPending
            ? "Working…"
            : claimed || fields?.claimed
              ? "Already claimed"
              : "Claim to wallet"}
        </button>
      </div>
    </div>
  );
}
