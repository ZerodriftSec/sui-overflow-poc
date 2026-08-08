"use client";

import { useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { QRCodeSVG } from "qrcode.react";

import { commit, proveWrap } from "@/lib/confidential";
import { copyToClipboard } from "@/lib/format";
import { useNetworkVariable } from "@/lib/networks";
import { toBaseUnits } from "@/lib/stream-math";
import { useGaslessExecute } from "@/lib/use-gasless";
import {
  buildCreateGiftCard,
  findCreatedGiftCardId,
} from "@/lib/streamline-tx";
import {
  buildGiftCardUrl,
  generateGiftCardSecrets,
} from "@/lib/giftcard";
import { PhoneField, phoneInputClass } from "./PhoneFormParts";
import { phoneFlowFooter, phoneGlassCard } from "./phoneStyles";

type PhoneSendGiftCardViewProps = {
  /** Close the whole transfer flow (Done after share). */
  onClose: () => void;
  /** Back to Transfer menu; defaults to onClose. */
  onBack?: () => void;
};

const btnPrimary =
  "w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";
const btnSecondary =
  "w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]";

export function PhoneSendGiftCardView({
  onClose,
  onBack,
}: PhoneSendGiftCardViewProps) {
  const goBack = onBack ?? onClose;
  const account = useCurrentAccount();
  const client = useSuiClient();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const vaultId = useNetworkVariable("giftCardVaultId");
  const { execute, isPending } = useGaslessExecute();

  const [amount, setAmount] = useState("25");
  const [note, setNote] = useState("");
  const [expireDays, setExpireDays] = useState("7");
  const [status, setStatus] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [proving, setProving] = useState(false);

  const onLock = async () => {
    if (!account) {
      setStatus("Connect a wallet first.");
      return;
    }
    if (!vaultId || vaultId === "0x0") {
      setStatus("Gift card vault not configured on this network yet.");
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      setStatus("Enter a positive amount.");
      return;
    }
    const amountBase = toBaseUnits(amt);
    const { secretHex, claimHash, blinding } = generateGiftCardSecrets();
    const days = Math.max(0, Number(expireDays) || 0);
    const expiresMs = days > 0 ? Date.now() + days * 86_400_000 : 0;

    try {
      setProving(true);
      setStatus("Proving wrap…");
      const commitment = await commit(amountBase, blinding);
      const { proof } = await proveWrap(amountBase, blinding);
      setProving(false);
      setStatus("Locking gift card…");

      const tx = buildCreateGiftCard({
        packageId,
        usdcType,
        vaultId,
        sender: account.address,
        amountBase,
        commitment,
        wrapProof: proof,
        claimHash,
        note: note.trim(),
        expiresMs,
      });

      execute(tx, {
        onSuccess: async ({ digest }) => {
          try {
            await client.waitForTransaction({ digest });
            const tb = await client.getTransactionBlock({
              digest,
              options: { showObjectChanges: true },
            });
            const cardId = findCreatedGiftCardId(tb.objectChanges);
            if (!cardId) {
              setStatus(
                `Created (${digest.slice(0, 10)}…) but no gift card id found.`
              );
              return;
            }
            const url = buildGiftCardUrl(window.location.origin, {
              cardId,
              secretHex,
              amountBase,
              blinding,
            });
            setClaimUrl(url);
            setStatus(null);
          } catch (e) {
            setStatus(e instanceof Error ? e.message : String(e));
          }
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setProving(false);
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const onCopy = async () => {
    if (!claimUrl) return;
    const ok = await copyToClipboard(claimUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (claimUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
            Gift card ready
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[#111]">
            Share this link
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-[#666]">
            Anyone with the link can claim $
            {(Number(amount) || 0).toLocaleString()} USDC once. Amount stays
            hidden on-chain until they claim. Don’t post it publicly.
          </p>
          <div
            className={`${phoneGlassCard} mt-4 flex flex-col items-center gap-3 p-4`}
          >
            <QRCodeSVG value={claimUrl} size={160} level="M" />
            <p className="w-full break-all text-center font-mono text-[9px] leading-relaxed text-[#555]">
              {claimUrl}
            </p>
          </div>
        </div>
        <div className={phoneFlowFooter}>
          <button type="button" className={btnPrimary} onClick={onCopy}>
            {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">
          Transfer
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#111]">
          Gift card
        </h2>
        <p className="mt-1 text-[12px] leading-snug text-[#666]">
          Lock USDC now. The amount stays hidden on-chain until the recipient
          claims.
        </p>

        <div className="mt-4 space-y-3">
          <PhoneField label="Amount (USDC)">
            <input
              className={phoneInputClass}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </PhoneField>
          <PhoneField label="Note (optional)">
            <input
              className={phoneInputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Coffee, tip…"
              maxLength={80}
            />
          </PhoneField>
          <PhoneField label="Expires in (days, 0 = never)">
            <input
              className={phoneInputClass}
              inputMode="numeric"
              value={expireDays}
              onChange={(e) => setExpireDays(e.target.value)}
            />
          </PhoneField>
        </div>
        {status && (
          <p className="mt-3 text-[11px] leading-snug text-[#b45309]">{status}</p>
        )}
      </div>
      <div className={phoneFlowFooter}>
        <button
          type="button"
          className={btnPrimary}
          disabled={isPending || proving || !account}
          onClick={() => void onLock()}
        >
          {proving || isPending ? "Working…" : "Lock & get link"}
        </button>
        <button type="button" className={btnSecondary} onClick={goBack}>
          Back
        </button>
      </div>
    </div>
  );
}
