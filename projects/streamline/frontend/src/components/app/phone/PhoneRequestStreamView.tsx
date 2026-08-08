"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { QRCodeSVG } from "qrcode.react";

import { copyToClipboard } from "@/lib/format";
import type { DurationUnit } from "@/lib/stream-math";
import {
  PhoneDurationField,
  PhoneField,
  PhoneToggleRow,
  phoneInputClass,
} from "./PhoneFormParts";
import { phoneFlowFooter, phoneGlassCard } from "./phoneStyles";
import { RequestPreviewCard } from "./RequestPreviewCard";
import type { StreamRequestParams } from "@/lib/request-link";

type PhoneRequestStreamViewProps = {
  onClose: () => void;
};

type SplitRow = { label: string; address: string; pct: number; yield: boolean };
type RequestStep = 1 | 2 | 3;

const DEFAULT_SPLITS: SplitRow[] = [
  { label: "Your wallet", address: "", pct: 100, yield: false },
];

const STEP_TITLES: Record<RequestStep, string> = {
  1: "Request a stream",
  2: "Stream settings",
  3: "Payout setup",
};

const btnPrimary =
  "w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white";
const btnSecondary =
  "w-full rounded-2xl border border-black/12 bg-white/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] backdrop-blur-sm";

export function PhoneRequestStreamView({ onClose }: PhoneRequestStreamViewProps) {
  const account = useCurrentAccount();
  const [step, setStep] = useState<RequestStep>(1);
  const [streamName, setStreamName] = useState("");
  const [amount, setAmount] = useState("800");
  const [durationValue, setDurationValue] = useState("14");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("days");
  const [isPrivate, setIsPrivate] = useState(false);
  const [useMilestones, setUseMilestones] = useState(false);
  const [useSplitConfig, setUseSplitConfig] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>(DEFAULT_SPLITS);
  const [milestones, setMilestones] = useState<string[]>([
    "request start",
    "Milestone 2",
    "Milestone 3",
  ]);
  const [note, setNote] = useState("");
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const recipient = account?.address ?? "";

  useEffect(() => {
    setStep(1);
    setCreated(false);
    setStepError(null);
  }, []);

  const shareLink = useMemo(() => {
    if (!recipient) return "";
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://streamline.app";
    const params = new URLSearchParams({
      recipient,
      amount: amount || "0",
      duration_value: durationValue || "0",
      duration_unit: durationUnit,
      milestones: useMilestones && milestones.length > 0 ? milestones.join("|") : "0",
    });
    if (streamName.trim()) params.set("stream_name", streamName.trim());
    params.set("private", isPrivate ? "1" : "0");
    params.set("milestones_count", useMilestones ? String(milestones.length) : "0");
    if (useMilestones && milestones.length > 0) {
      params.set("milestones", milestones.join("|"));
    }
    if (note.trim()) params.set("note", note.trim());
    const splitsOn = useSplitConfig && !isPrivate;
    params.set("use_splits", splitsOn ? "1" : "0");
    if (splitsOn) {
      params.set(
        "splits",
        splits
          .map(
            (s) =>
              `${encodeURIComponent(s.label)}:${s.pct}:${s.yield ? 1 : 0}:${encodeURIComponent(s.address)}`
          )
          .join("|")
      );
    }
    return `${origin}/app?${params.toString()}`;
  }, [recipient, streamName, amount, durationValue, durationUnit, milestones, note, isPrivate, useMilestones, useSplitConfig, splits]);

  const splitSum = splits.reduce((s, r) => s + (Number(r.pct) || 0), 0);

  const updateSplit = (i: number, patch: Partial<SplitRow>) =>
    setSplits((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const validateStep = (current: RequestStep): string | null => {
    if (current === 1) {
      if (!(Number(amount) > 0)) return "Enter a valid amount.";
      if (!(Number(durationValue) > 0)) return "Enter a valid duration.";
    }
    if (current === 3 && useSplitConfig && !isPrivate && splitSum !== 100) {
      return `Splits must total 100% (currently ${splitSum}%).`;
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    if (step < 3) setStep((s) => (s + 1) as RequestStep);
  };

  const goBack = () => {
    setStepError(null);
    if (step > 1) setStep((s) => (s - 1) as RequestStep);
  };

  const onCreateRequest = () => {
    const err = validateStep(3);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setCreated(true);
    try {
      if (shareLink) {
        sessionStorage.setItem("sl-demo-request-link", shareLink);
      }
    } catch {
      /* ignore */
    }
  };

  const onCopy = async () => {
    if (!shareLink) return;
    const ok = await copyToClipboard(shareLink);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const onDone = () => {
    setCreated(false);
    setStep(1);
    onClose();
  };

  const previewRequest: StreamRequestParams = {
    streamName,
    recipient,
    amount,
    durationValue,
    durationUnit,
    isPrivate,
    useMilestones,
    milestones,
    useSplitConfig,
    splits,
    note: note.trim() || undefined,
  };

  if (created) {
    return (
      <RequestPageShell
        step={3}
        title="Share your request"
        footer={
          <>
            <button type="button" onClick={onCopy} className={btnPrimary}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className={btnSecondary}
              data-demo-action="request-done"
            >
              Done
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-4" data-demo="request-share">
          <div className={`${phoneGlassCard} p-3`}>
            <QRCodeSVG value={shareLink || "https://streamline.app/app"} size={132} />
          </div>
          <RequestPreviewCard request={previewRequest} />
        </div>
      </RequestPageShell>
    );
  }

  return (
    <RequestPageShell
      step={step}
      title={STEP_TITLES[step]}
      footer={
        <>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className={btnPrimary}
              data-demo-action="request-continue"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreateRequest}
              disabled={!recipient}
              className={`${btnPrimary} disabled:opacity-40`}
              data-demo-action="request-create"
            >
              Create request link
            </button>
          )}
          {step > 1 ? (
            <button type="button" onClick={goBack} className={btnSecondary}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <>
          <PhoneField label="Stream name">
            <input
              data-demo="request-name"
              value={streamName}
              onChange={(e) => setStreamName(e.target.value)}
              placeholder="Design sprint"
              className={phoneInputClass}
            />
          </PhoneField>

          <PhoneField label="Amount (USDC)">
            <input
              data-demo="request-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={phoneInputClass}
            />
          </PhoneField>

          <PhoneDurationField
            value={durationValue}
            unit={durationUnit}
            onValueChange={setDurationValue}
            onUnitChange={setDurationUnit}
          />
        </>
      )}

      {step === 2 && (
        <>
          <PhoneToggleRow
            data-demo="request-private"
            title="Private request"
            subtitle="Hide amounts on-chain"
            checked={isPrivate}
            onChange={(v) => {
              setIsPrivate(v);
              if (v) setUseSplitConfig(false);
            }}
          />

          <PhoneToggleRow
            data-demo="request-milestones"
            title="Use milestones"
            subtitle="Define payment stages"
            checked={useMilestones}
            onChange={setUseMilestones}
          >
            <div className="flex flex-col gap-2">
              {milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111] text-[10px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <input
                    data-demo={`request-milestone-${i}`}
                    value={m}
                    onChange={(e) =>
                      setMilestones((prev) =>
                        prev.map((item, idx) => (idx === i ? e.target.value : item))
                      )
                    }
                    className="w-full rounded-xl border border-black/15 bg-white/80 px-3 py-2 text-[12px] outline-none backdrop-blur-sm focus:border-[#5b54e6]"
                  />
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="px-2 text-[#c0533a]"
                      aria-label="Remove milestone"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                data-demo-action="request-add-milestone"
                onClick={() =>
                  setMilestones((prev) => [...prev, `Milestone ${prev.length + 1}`])
                }
                className="self-start rounded-lg border border-black/15 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444] backdrop-blur-sm"
              >
                + add milestone
              </button>
            </div>
          </PhoneToggleRow>
        </>
      )}

      {step === 3 && (
        <>
          <PhoneToggleRow
            data-demo="request-splits"
            title="Split each drip"
            subtitle={
              isPrivate
                ? "Not available for private streams"
                : splitSum === 100
                  ? "Send each drip to one or more destinations"
                  : `Must total 100% (currently ${splitSum}%)`
            }
            checked={useSplitConfig}
            disabled={isPrivate}
            onChange={setUseSplitConfig}
          >
            <div className="flex flex-col gap-2">
              {splits.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    data-demo={`request-split-addr-${i}`}
                    value={row.address}
                    onChange={(e) =>
                      updateSplit(i, {
                        address: e.target.value,
                        label: e.target.value.trim() || "Your wallet",
                      })
                    }
                    placeholder="0x… or name@handle · blank = you"
                    className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white/80 px-3 py-2 text-[12px] outline-none backdrop-blur-sm focus:border-[#5b54e6]"
                  />
                  <div className="flex shrink-0 items-center gap-0.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      data-demo={`request-split-pct-${i}`}
                      value={row.pct === 0 ? "" : row.pct}
                      placeholder="0"
                      onChange={(e) =>
                        updateSplit(i, {
                          pct: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="w-9 rounded-lg border border-black/15 bg-white/80 px-1 py-1.5 text-center text-[10px] tabular outline-none backdrop-blur-sm focus:border-[#5b54e6] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-[9px] text-[#888]">%</span>
                  </div>
                  <label
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white/60 px-1.5 py-1 text-[9px] text-[#555] backdrop-blur-sm"
                    title="Route this portion to a yield vault instead of your wallet"
                  >
                    <input
                      type="checkbox"
                      data-demo={`request-split-yield-${i}`}
                      checked={row.yield}
                      onChange={(e) => updateSplit(i, { yield: e.target.checked })}
                    />
                    Yield
                  </label>
                  <button
                    type="button"
                    onClick={() => setSplits((s) => s.filter((_, j) => j !== i))}
                    className="shrink-0 px-1 text-[#c0533a]"
                    aria-label="Remove split"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                data-demo-action="request-add-split"
                onClick={() =>
                  setSplits((s) => [
                    ...s,
                    { label: "Destination", address: "", pct: 0, yield: false },
                  ])
                }
                className="self-start rounded-lg border border-black/15 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444] backdrop-blur-sm"
              >
                + add destination
              </button>
            </div>
          </PhoneToggleRow>

          <PhoneField label="Note (optional)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Design + implementation"
              className={phoneInputClass}
            />
          </PhoneField>
        </>
      )}

      {stepError && <p className="text-center text-[11px] text-[#c0533a]">{stepError}</p>}
    </RequestPageShell>
  );
}

function RequestPageShell({
  step,
  title,
  children,
  footer,
}: {
  step: RequestStep;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-1 pb-2 pt-1">
        <StepIndicator step={step} />
        <h2 className="mt-4 text-center text-[1.5rem] font-bold leading-tight tracking-tight text-[#111]">
          {title}
        </h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <div className="sl-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-1 pb-2">
          <div className="flex flex-col justify-end gap-4 pt-2">{children}</div>
        </div>
      </div>

      <footer className={phoneFlowFooter}>{footer}</footer>
    </div>
  );
}

function StepIndicator({ step }: { step: RequestStep }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Step ${step} of 3`}>
      {([1, 2, 3] as const).map((n) => (
        <div key={n} className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
              n === step
                ? "bg-[#111] text-white"
                : n < step
                  ? "bg-[#111]/15 text-[#111]"
                  : "bg-black/6 text-[#999]"
            }`}
          >
            {n}
          </span>
          {n < 3 && (
            <span
              className={`h-px w-8 ${n < step ? "bg-[#111]/30" : "bg-black/10"}`}
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
