"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import { copyToClipboard, shortAddress } from "@/lib/format";
import type { DurationUnit } from "@/lib/stream-math";
import {
  DEMO_SUBSCRIPTION_KEY,
  buildSubscriptionShareUrl,
  buildSubscriptionStreamUrl,
  loadSubscriptions,
  newSubId,
  periodLabel,
  saveSubscriptions,
  type ProSubscription,
  type ProSubscriptionStatus,
} from "@/lib/pro-subscriptions";
import { useProWorkspace } from "../ProWorkspaceContext";
import { fmtUsd } from "../types";
import { ProEyebrow, ProStat } from "../ui";

type View = "list" | "create" | "detail";

const DURATION_PRESETS: { label: string; value: number; unit: DurationUnit }[] = [
  { label: "7 days", value: 7, unit: "days" },
  { label: "14 days", value: 14, unit: "days" },
  { label: "30 days", value: 30, unit: "days" },
  { label: "90 days", value: 90, unit: "days" },
];

export function SubscriptionsScreen() {
  const embedded = usePhoneEmbedded();
  const account = useCurrentAccount();
  const { workspace, isDemo } = useProWorkspace();
  const ownerKey = account?.address ?? (isDemo ? DEMO_SUBSCRIPTION_KEY : "");
  const payee =
    account?.address ??
    (isDemo
      ? "0x0000000000000000000000000000000000000000000000000000000000d00001"
      : null);
  const canCreate = !!payee;

  const [subs, setSubs] = useState<ProSubscription[]>([]);
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [presetIdx, setPresetIdx] = useState(2);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ownerKey) {
      setSubs([]);
      return;
    }
    setSubs(loadSubscriptions(ownerKey));
  }, [ownerKey]);

  const persist = (next: ProSubscription[]) => {
    setSubs(next);
    if (ownerKey) saveSubscriptions(ownerKey, next);
  };

  const selected = subs.find((s) => s.id === selectedId) ?? null;

  const totals = useMemo(() => {
    const live = subs.filter((s) => s.status === "open" || s.status === "active");
    const mrr = live.reduce((a, s) => {
      const days =
        s.durationUnit === "weeks"
          ? s.durationValue * 7
          : s.durationUnit === "hours"
            ? s.durationValue / 24
            : s.durationValue;
      return a + (days > 0 ? (s.amountUsd * 30) / days : 0);
    }, 0);
    return {
      count: subs.length,
      live: live.length,
      mrr,
    };
  }, [subs]);

  const shell = embedded
    ? "flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5"
    : "mx-auto max-w-lg space-y-5";

  const create = () => {
    if (!payee) return;
    const n = Number(amount);
    if (!(n > 0) || !planName.trim()) return;
    const preset = DURATION_PRESETS[presetIdx] ?? DURATION_PRESETS[2];
    const sub: ProSubscription = {
      id: newSubId(),
      planName: planName.trim(),
      customerLabel: customer.trim() || "Customer",
      amountUsd: Math.round(n * 100) / 100,
      durationValue: preset.value,
      durationUnit: preset.unit,
      payeeAddress: payee,
      note: note.trim(),
      status: "open",
      createdAtMs: Date.now(),
    };
    persist([sub, ...subs]);
    setPlanName("");
    setCustomer("");
    setAmount("");
    setNote("");
    setSelectedId(sub.id);
    setView("detail");
  };

  const markActive = (id: string) => {
    persist(
      subs.map((s) =>
        s.id === id
          ? {
              ...s,
              status: "active" as const,
              activatedAtMs: Date.now(),
            }
          : s
      )
    );
  };

  const endSub = (id: string) => {
    persist(
      subs.map((s) =>
        s.id === id ? { ...s, status: "ended" as const } : s
      )
    );
  };

  const voidSub = (id: string) => {
    persist(
      subs.map((s) =>
        s.id === id ? { ...s, status: "void" as const } : s
      )
    );
  };

  if (view === "create") {
    return (
      <div className={shell}>
        {!embedded ? <Header title="New subscription" /> : null}
        <section
          className={`sl-pro-card sl-pro-card--flush ${
            embedded ? "p-3.5" : "p-5"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
              Create plan
            </p>
            <button
              type="button"
              onClick={() => setView("list")}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-white/45"
            >
              Back
            </button>
          </div>

          <Field label="Plan name">
            <input
              value={planName}
              onChange={(e) => setPlanName(e.target.value.slice(0, 40))}
              placeholder="Studio retainer"
              className={inputClass}
            />
          </Field>
          <Field label="Customer label">
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value.slice(0, 40))}
              placeholder="Acme Studio"
              className={inputClass}
            />
          </Field>
          <Field label="Period amount (USDC)">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </Field>

          <div className="mt-3">
            <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">
              Stream period
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {DURATION_PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPresetIdx(i)}
                  className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                    presetIdx === i
                      ? "bg-white text-[#0a0a0a]"
                      : "border border-white/10 bg-white/[0.04] text-white/60"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-white/35">
              Customer locks this USDC into a drip stream to your wallet for the
              period.
            </p>
          </div>

          <Field label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 80))}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>

          <button
            type="button"
            disabled={!canCreate || !(Number(amount) > 0) || !planName.trim()}
            onClick={create}
            className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#22c55e] px-4 py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition-transform enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            {canCreate ? "Create & share stream" : "Connect wallet to create"}
          </button>
          {canCreate ? (
            <p className="mt-2 text-center text-[9px] text-white/35">
              Stream payee {shortAddress(payee, 6, 4)} · customer locks USDC
              on-chain when they subscribe
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  if (view === "detail" && selected) {
    const shareUrl = buildSubscriptionShareUrl(
      selected,
      workspace.orgName || "Org"
    );
    const streamUrl = buildSubscriptionStreamUrl(selected);
    return (
      <div className={shell}>
        {!embedded ? <Header title={selected.planName} /> : null}
        <section
          className={`sl-pro-card sl-pro-card--flush ${
            embedded ? "p-3.5" : "p-5"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
              Subscription stream
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setView("list");
              }}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-white/45"
            >
              Done
            </button>
          </div>

          <p className="mt-3 text-center text-[1.15rem] font-semibold tracking-tight text-white">
            {selected.planName}
          </p>
          <p className="mt-1 text-center text-[2rem] font-semibold tabular leading-none text-white">
            {fmtUsd(selected.amountUsd)}
          </p>
          <p className="mt-2 text-center text-[11px] text-white/40">
            {selected.customerLabel} · {periodLabel(selected)} stream
            {selected.note ? ` · ${selected.note}` : ""}
          </p>
          <div className="mt-2 flex justify-center">
            <StatusPill status={selected.status} />
          </div>

          <div className="mx-auto mt-4 flex items-center justify-center rounded-2xl bg-white p-3.5">
            <QRCodeSVG value={shareUrl} size={embedded ? 148 : 180} level="M" />
          </div>
          <p className="mt-2.5 break-all text-center text-[9px] leading-snug text-white/30">
            {shareUrl}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={async () => {
                if (await copyToClipboard(shareUrl)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }
              }}
              className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-[12px] font-semibold text-white"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(streamUrl);
              }}
              className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-[12px] font-semibold text-white"
            >
              Copy stream URL
            </button>
          </div>

          {selected.status === "open" ? (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => markActive(selected.id)}
                className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-[12px] font-semibold text-white"
              >
                Mark active (manual)
              </button>
              <button
                type="button"
                onClick={() => voidSub(selected.id)}
                className="rounded-2xl border border-white/12 px-3 py-3 text-[12px] font-semibold text-white/50"
              >
                Void
              </button>
            </div>
          ) : selected.status === "active" ? (
            <button
              type="button"
              onClick={() => endSub(selected.id)}
              className="mt-1.5 w-full rounded-2xl border border-white/12 px-3 py-3 text-[12px] font-semibold text-white/60"
            >
              Mark ended
            </button>
          ) : null}
          <p className="mt-2 text-center text-[9px] text-white/35">
            The subscribe link creates a real on-chain payment stream to your
            wallet. Confirm it in Streams (recipient = you), then mark it active.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={shell}>
      {!embedded ? (
        <div>
          <ProEyebrow>Tools</ProEyebrow>
          <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
            Subscriptions
          </h1>
          <p className="mt-1 text-[13px] text-white/45">
            Customer locks USDC into a drip stream to your org for the plan
            period.
          </p>
        </div>
      ) : null}

      {/* Stats — one block, three cards */}
      <div className={`grid grid-cols-3 ${embedded ? "gap-1.5" : "gap-3"}`}>
        <ProStat label="Plans" value={String(totals.count)} />
        <ProStat label="Live" value={String(totals.live)} />
        <ProStat
          label="~MRR"
          value={fmtUsd(totals.mrr, totals.mrr % 1 ? 0 : 0)}
          accent
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setView("create")}
          disabled={!canCreate && !isDemo}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#22c55e] px-4 py-3.5 text-[14px] font-semibold tracking-tight text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
        >
          <span className="text-[18px] leading-none">+</span>
          {canCreate || isDemo ? "New subscription" : "Connect to create"}
        </button>
        <p className="mt-2 text-center text-[9px] leading-snug text-white/35">
          {isDemo
            ? "Explore-demo sample plans. Sign in so subscribe links pay your wallet."
            : "Creating a plan is a share link. The stream is created on-chain when the customer subscribes."}
        </p>
      </div>

      <section
        className={`sl-pro-card sl-pro-card--flush ${
          embedded ? "p-3.5" : "p-5"
        }`}
      >
        <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
          All plans
        </p>
        <div className="mt-2.5 space-y-1.5">
          {subs.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => {
                setSelectedId(sub.id);
                setView("detail");
              }}
              className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-2.5 py-2.5 text-left transition-colors active:bg-white/[0.07]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[12px] font-semibold text-white">
                    {sub.planName}
                  </p>
                  <StatusPill status={sub.status} />
                </div>
                <p className="mt-0.5 text-[10px] text-white/40">
                  {sub.customerLabel} · {periodLabel(sub)}
                </p>
              </div>
              <p className="shrink-0 text-[12px] font-semibold tabular text-white">
                {fmtUsd(sub.amountUsd)}
              </p>
            </button>
          ))}
          {subs.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-white/35">
              No subscriptions yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-white/25";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">
        {label}
      </span>
      {children}
    </label>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div>
      <ProEyebrow>Subscriptions</ProEyebrow>
      <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
        {title}
      </h1>
    </div>
  );
}

function StatusPill({ status }: { status: ProSubscriptionStatus }) {
  const label =
    status === "active"
      ? "Active"
      : status === "ended"
        ? "Ended"
        : status === "void"
          ? "Void"
          : "Open";
  const cls =
    status === "active"
      ? "bg-[#1d9e75]/20 text-[#1d9e75]"
      : status === "void"
        ? "bg-white/8 text-white/40"
        : status === "ended"
          ? "bg-white/10 text-white/50"
          : "bg-amber-400/15 text-amber-200/90";
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] ${cls}`}
    >
      {label}
    </span>
  );
}
