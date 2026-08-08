"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSuiClient } from "@mysten/dapp-kit";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import {
  buildPosPayUrl,
  loadPosQrs,
  savePosQrs,
  usePosStats,
  type PosQr,
} from "@/lib/pro-pos";
import { useProWorkspace } from "../ProWorkspaceContext";
import { fmtUsd } from "../types";
import { ProEyebrow, ProStat } from "../ui";

export function PosScreen() {
  const embedded = usePhoneEmbedded();
  const client = useSuiClient();
  const { workspace, address } = useProWorkspace();
  const treasuryId = workspace.treasuryId;

  const [qrs, setQrs] = useState<PosQr[]>([]);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [openAmount, setOpenAmount] = useState(true);
  const [copied, setCopied] = useState(false);

  // Load persisted QR definitions for this org.
  useEffect(() => {
    setQrs(loadPosQrs(address));
  }, [address]);

  const persist = useCallback(
    (next: PosQr[]) => {
      setQrs(next);
      savePosQrs(address, next);
    },
    [address]
  );

  // Real uses + totals from on-chain PosPaid events for this treasury.
  const { data: stats } = usePosStats(client, treasuryId);
  const statFor = (id: string) => stats?.byQr[id] ?? { uses: 0, totalUsd: 0 };

  const totals = useMemo(
    () => ({
      count: qrs.length,
      active: qrs.filter((q) => q.active).length,
      uses: stats?.totalUses ?? 0,
      taken: stats?.totalUsd ?? 0,
    }),
    [qrs, stats]
  );

  const selected = qrs.find((q) => q.id === selectedId) ?? null;

  const openCreate = () => {
    setDraftLabel("");
    setDraftAmount("");
    setOpenAmount(true);
    setView("create");
  };

  const createQr = () => {
    const label = draftLabel.trim() || `QR ${qrs.length + 1}`;
    let amountUsd: number | null = null;
    if (!openAmount) {
      const n = Number(draftAmount);
      if (!Number.isFinite(n) || n <= 0) return;
      amountUsd = Math.round(n * 100) / 100;
    }
    const id = `qr-${Date.now().toString(36)}`;
    const next: PosQr = { id, label, amountUsd, active: true, createdAtMs: Date.now() };
    persist([next, ...qrs]);
    setSelectedId(id);
    setView("detail");
  };

  const shell = embedded
    ? "flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5"
    : "mx-auto max-w-lg space-y-5";

  // No treasury yet → payments have nowhere to land. Gate creation honestly.
  const noTreasury = !treasuryId;

  if (view === "create") {
    return (
      <div className={shell}>
        {!embedded ? <Header title="New payment QR" /> : null}
        <section className={`sl-pro-card sl-pro-card--flush ${embedded ? "p-3.5" : "p-5"}`}>
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
              Create QR
            </p>
            <button
              type="button"
              data-demo-action="pro-pos-create-back"
              onClick={() => setView("list")}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-white/45"
            >
              Back
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">
              Label
            </span>
            <input
              type="text"
              data-demo="pro-pos-label"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value.slice(0, 32))}
              placeholder="Counter, Table 3, Merch…"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-white/25"
            />
          </label>

          <div className="mt-3.5">
            <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">
              Amount
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setOpenAmount(true)}
                className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                  openAmount
                    ? "bg-white text-[#0a0a0a]"
                    : "border border-white/10 bg-white/[0.04] text-white/60"
                }`}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => setOpenAmount(false)}
                className={`rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors ${
                  !openAmount
                    ? "bg-white text-[#0a0a0a]"
                    : "border border-white/10 bg-white/[0.04] text-white/60"
                }`}
              >
                Fixed USDC
              </button>
            </div>
            {!openAmount ? (
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                placeholder="0.00"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] tabular text-white placeholder:text-white/25 outline-none focus:border-white/25"
              />
            ) : (
              <p className="mt-2 text-[10px] leading-snug text-white/35">
                Customer enters the amount when they scan.
              </p>
            )}
          </div>

          {noTreasury ? (
            <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-[10px] leading-snug text-amber-200/80">
              Fund your treasury pool first (Treasury tab) — scanned payments
              settle into it.
            </p>
          ) : null}

          <button
            type="button"
            data-demo-action="pro-pos-create-submit"
            onClick={createQr}
            disabled={noTreasury || (!openAmount && !(Number(draftAmount) > 0))}
            className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#22c55e] px-4 py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition-transform enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
          >
            Create payment QR
          </button>
        </section>
      </div>
    );
  }

  if (view === "detail" && selected && treasuryId) {
    const url = buildPosPayUrl(selected, treasuryId, workspace.orgName);
    const s = statFor(selected.id);
    return (
      <div className={shell}>
        {!embedded ? <Header title={selected.label} /> : null}
        <section className={`sl-pro-card sl-pro-card--flush ${embedded ? "p-3.5" : "p-5"}`}>
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
              Payment QR
            </p>
            <button
              type="button"
              data-demo-action="pro-pos-detail-back"
              onClick={() => {
                setSelectedId(null);
                setView("list");
              }}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-white/45"
            >
              Done
            </button>
          </div>

          <p className="mt-3 text-center text-[1.25rem] font-semibold tracking-tight text-white">
            {selected.label}
          </p>
          <p className="mt-1 text-center text-[11px] text-white/40">
            {selected.amountUsd != null
              ? `${fmtUsd(selected.amountUsd)} fixed · USDC`
              : "Open amount · USDC"}
            {selected.active ? "" : " · paused"}
          </p>

          <div className="mx-auto mt-4 flex items-center justify-center rounded-2xl bg-white p-3.5">
            <QRCodeSVG value={url} size={embedded ? 148 : 180} level="M" />
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-2.5 block w-full break-all text-center text-[9px] leading-snug text-white/30 transition-colors hover:text-white/50"
          >
            {copied ? "Copied ✓" : url}
          </button>

          <div className="mt-4 grid grid-cols-2 gap-1.5">
            <StatTile label="Uses" value={String(s.uses)} />
            <StatTile
              label="Taken"
              value={fmtUsd(s.totalUsd, s.totalUsd % 1 ? 2 : 0)}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              persist(
                qrs.map((q) =>
                  q.id === selected.id ? { ...q, active: !q.active } : q
                )
              )
            }
            className="mt-3 w-full rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-[12px] font-semibold text-white"
          >
            {selected.active ? "Pause" : "Activate"}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className={shell}>
      {!embedded ? (
        <div>
          <ProEyebrow>POS</ProEyebrow>
          <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
            Payment QRs
          </h1>
          <p className="mt-1 text-[13px] text-white/45">
            Reusable USDC QR codes for the counter. Scans pay on-chain into your
            treasury pool; uses & totals are read from chain.
          </p>
        </div>
      ) : null}

      <div className={`grid grid-cols-3 ${embedded ? "gap-1.5" : "gap-3"}`}>
        <ProStat label="Codes" value={String(totals.count)} />
        <ProStat label="Uses" value={String(totals.uses)} />
        <ProStat
          label="Taken"
          value={fmtUsd(totals.taken, totals.taken % 1 ? 2 : 0)}
          accent
        />
      </div>

      <button
        type="button"
        data-demo-action="pro-pos-new"
        onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#22c55e] px-4 py-3.5 text-[14px] font-semibold tracking-tight text-white shadow-[0_8px_24px_rgba(34,197,94,0.35)] transition-transform active:scale-[0.98]"
      >
        <span className="text-[18px] leading-none">+</span>
        Create payment QR
      </button>

      <section className={`sl-pro-card sl-pro-card--flush ${embedded ? "p-3.5" : "p-5"}`}>
        <div className="flex items-center justify-between">
          <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
            All payment QRs
          </p>
          <span className="text-[9px] text-white/35">{totals.active} active</span>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {qrs.map((qr) => {
            const s = statFor(qr.id);
            return (
              <button
                key={qr.id}
                type="button"
                onClick={() => {
                  setSelectedId(qr.id);
                  setView("detail");
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-2.5 py-2.5 text-left transition-colors active:bg-white/[0.07]"
              >
                <QrThumb
                  url={treasuryId ? buildPosPayUrl(qr, treasuryId, workspace.orgName) : ""}
                  muted={!qr.active}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[12px] font-semibold text-white">
                      {qr.label}
                    </p>
                    {!qr.active ? (
                      <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-white/40">
                        Paused
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-white/40">
                    {qr.amountUsd != null ? `${fmtUsd(qr.amountUsd)} fixed` : "Open amount"}
                    {" · "}
                    {s.uses} use{s.uses === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-semibold tabular text-white">
                    {fmtUsd(s.totalUsd, s.totalUsd % 1 ? 2 : 0)}
                  </p>
                  <p className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-white/30">
                    total
                  </p>
                </div>
              </button>
            );
          })}
          {qrs.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-white/35">
              No payment QRs yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div>
      <ProEyebrow>POS</ProEyebrow>
      <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
        {title}
      </h1>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2.5 py-2.5 text-center">
      <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold tabular leading-none text-white">
        {value}
      </p>
    </div>
  );
}

function QrThumb({ url, muted }: { url: string; muted?: boolean }) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 ${
        muted ? "opacity-40" : ""
      }`}
    >
      {url ? <QRCodeSVG value={url} size={36} level="L" /> : null}
    </div>
  );
}
