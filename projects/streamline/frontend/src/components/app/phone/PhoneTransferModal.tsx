"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { phoneFlowOverlay } from "./phoneStyles";
import {
  looksLikeRecipient,
  resolveRecipientOrThrow,
} from "@/lib/use-resolve-recipient";
import { isHexAddress, suinsBrand } from "@/lib/handle";
import {
  OnramperModal,
  onramperConfigured,
} from "@/components/wallet/OnramperWidget";
import { PhoneSendGiftCardView } from "./PhoneSendGiftCardView";

type TransferMode = "wallet" | "giftcard" | "crosschain" | "bank";
type TransferStep = "menu" | TransferMode;
type TransferCoin = "USDC" | "SUI";

type PhoneTransferModalProps = {
  open: boolean;
  onClose: () => void;
};

const MODES: {
  id: TransferMode;
  label: string;
  subtitle: string;
  enabled: boolean;
  icon: React.ReactNode;
}[] = [
  {
    id: "wallet",
    label: "Wallet transfer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M16 12h.01" />
      </svg>
    ),
    subtitle: "Send to another wallet instantly",
    enabled: true,
  },
  {
    id: "giftcard",
    label: "Gift card",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="8" width="18" height="11" rx="2" />
        <path d="M12 8v11" />
        <path d="M3 12h18" />
        <path d="M12 8c-.8-1.2-2.2-1.2-2.6-.4S10.2 9.5 12 8c.8-1.2 2.2-1.2 2.6-.4S13.8 9.5 12 8z" />
      </svg>
    ),
    subtitle: "Link with hidden amount — claim later",
    enabled: true,
  },
  {
    id: "crosschain",
    label: "Cross-chain",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 17h16" />
        <path d="M6 17V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v8" />
      </svg>
    ),
    subtitle: "Bridge to another chain",
    enabled: false,
  },
  {
    id: "bank",
    label: "Bank offramp",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10h18" />
        <path d="M5 10v8" />
        <path d="M9 10v8" />
        <path d="M15 10v8" />
        <path d="M19 10v8" />
        <path d="M3 18h18" />
        <path d="M12 4 3 8h18z" />
      </svg>
    ),
    subtitle: "Cash out USDC to your bank or card",
    enabled: onramperConfigured,
  },
];

export function PhoneTransferModal({ open, onClose }: PhoneTransferModalProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();

  const [step, setStep] = useState<TransferStep>("menu");
  const [recipient, setRecipient] = useState("");
  const [coin, setCoin] = useState<TransferCoin>("USDC");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sellOpen, setSellOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("menu");
      setStatus(null);
      setRecipient("");
      setAmount("");
    }
  }, [open]);

  if (!open) return null;

  if (step === "giftcard") {
    return (
      <div
        className={phoneFlowOverlay}
        role="dialog"
        aria-modal="true"
        aria-label="Gift card"
      >
        <PhoneSendGiftCardView
          onBack={() => setStep("menu")}
          onClose={onClose}
        />
      </div>
    );
  }

  const withdrawDisabled =
    !recipient.trim() ||
    !amount.trim() ||
    !looksLikeRecipient(recipient) ||
    isPending;

  const onWithdraw = async () => {
    if (!account) {
      setStatus("Connect a wallet first.");
      return;
    }
    let to = recipient.trim();
    try {
      if (!isHexAddress(to)) {
        setStatus("Resolving recipient…");
        const resolved = await resolveRecipientOrThrow(client, recipient);
        to = resolved.address;
        setRecipient(resolved.address);
        setStatus(`Resolved ${resolved.displayName}`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      return;
    }
    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setStatus("Enter a valid amount.");
      return;
    }

    const tx = new Transaction();
    try {
      if (coin === "SUI") {
        const mist = BigInt(Math.round(parsedAmount * 1_000_000_000));
        const [out] = tx.splitCoins(tx.gas, [tx.pure.u64(mist)]);
        tx.transferObjects([out], tx.pure.address(to));
      } else {
        const base = BigInt(Math.round(parsedAmount * 1_000_000));
        const bal = await client.getBalance({
          owner: account.address,
          coinType: usdcType,
        });
        if (BigInt(bal.totalBalance) < base) {
          setStatus("Not enough USDC balance.");
          return;
        }
        const coinPage = await client.getCoins({
          owner: account.address,
          coinType: usdcType,
          limit: 50,
        });
        if (coinPage.data.length === 0) {
          setStatus("No USDC coin found in wallet.");
          return;
        }
        const primary = tx.object(coinPage.data[0].coinObjectId);
        if (coinPage.data.length > 1) {
          tx.mergeCoins(
            primary,
            coinPage.data.slice(1).map((c) => tx.object(c.coinObjectId))
          );
        }
        const [out] = tx.splitCoins(primary, [tx.pure.u64(base)]);
        tx.transferObjects([out], tx.pure.address(to));
      }

      setStatus("Awaiting wallet signature…");
      await execute(
        tx,
        {
          onSuccess: ({ digest }) => {
            setStatus(`Transfer sent. Digest ${digest}`);
            setAmount("");
          },
          onError: (e) => setStatus(e.message),
        },
        // Let the sponsor allow-list this transfer's recipient.
        { allowedRecipients: [to] }
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={phoneFlowOverlay}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {step === "menu" && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
                Transfer funds
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-[#666]">
                Pick where you want to withdraw your balance.
              </p>
            </div>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!m.enabled}
                onClick={() => {
                  if (!m.enabled) return;
                  if (m.id === "bank") setSellOpen(true);
                  else setStep(m.id);
                }}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left ${
                  m.enabled
                    ? "border-black/12 bg-transparent text-[#111]"
                    : "border-black/8 bg-transparent text-black/40"
                }`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/10">
                  {m.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold">{m.label}</span>
                  <span className="block text-[10px]">
                    {m.subtitle}
                    {!m.enabled ? " (inactive)" : ""}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              data-demo-action="transfer-close"
              onClick={onClose}
              className="mt-1 w-full rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              Cancel
            </button>
          </div>
        )}

        {step === "wallet" && (
          <div className="flex flex-col gap-4">
            <div className="border-b border-black/8 pb-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
                Wallet transfer
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-[#666]">
                Send USDC or SUI directly to another wallet.
              </p>
            </div>
            <Field label="Recipient">
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={`@${suinsBrand()} or 0x…`}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#5b54e6]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Coin">
                <select
                  value={coin}
                  onChange={(e) => setCoin(e.target.value as TransferCoin)}
                  className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#5b54e6]"
                >
                  <option value="USDC">USDC</option>
                  <option value="SUI">SUI</option>
                </select>
              </Field>
              <Field label="Amount">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#5b54e6]"
                />
              </Field>
            </div>

            {status && <p className="text-[11px] text-[#666]">{status}</p>}

            <button
              type="button"
              onClick={onWithdraw}
              disabled={withdrawDisabled}
              className="mt-1 rounded-xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
            >
              {isPending ? "Withdrawing…" : "Withdraw"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        )}

        {step === "crosschain" && (
          <div className="flex flex-col gap-4">
            <div className="border-b border-black/8 pb-3">
              <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
                Cross-chain transfer
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-[#666]">
                Bridge flow is not active yet.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              Cancel
            </button>
          </div>
        )}

      </div>

      <OnramperModal
        open={sellOpen}
        mode="sell"
        onClose={() => setSellOpen(false)}
        contained
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#777]">
        {label}
      </span>
      {children}
    </label>
  );
}
