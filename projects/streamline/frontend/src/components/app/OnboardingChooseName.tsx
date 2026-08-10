"use client";

import { useState, type ReactNode } from "react";

import { formatHandle, suinsBrand } from "@/lib/handle";
import { phoneToast } from "@/lib/phone-toast";
import { useHandleAvailability, useMyHandle } from "@/lib/use-handle";

type OnboardingChooseNameProps = {
  /** Pro = dark; user = light. */
  variant: "user" | "pro";
  embedded?: boolean;
  onComplete: () => void;
  onBack?: () => void;
  BackCircle: (props: { onClick: () => void }) => ReactNode;
};

/**
 * Shared "choose your @handle" onboarding step — claim or skip.
 */
export function OnboardingChooseName({
  variant,
  embedded = false,
  onComplete,
  onBack,
  BackCircle,
}: OnboardingChooseNameProps) {
  const dark = variant === "pro";
  const brand = suinsBrand();
  const { claim, setError, handle } = useMyHandle();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const availability = useHandleAvailability(raw);

  const muted = dark ? "text-white/55" : "text-[#555]";
  const input = dark
    ? "w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 pr-28 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
    : "w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 pr-28 text-[15px] text-[#111] outline-none placeholder:text-[#aaa] focus:border-black/20 shadow-[0_4px_16px_rgba(0,0,0,0.04)]";
  const primaryBtn = dark
    ? "flex h-12 flex-1 items-center justify-center rounded-full bg-white px-4 text-[14px] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-95 active:scale-[0.99] disabled:opacity-40"
    : "flex h-12 flex-1 items-center justify-center rounded-full bg-[#111] px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-40";
  const skipBtn = dark
    ? "text-[12px] font-medium text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
    : "text-[12px] font-medium text-[#888] underline-offset-2 hover:text-[#555] hover:underline";

  const onClaim = async () => {
    if (!availability.handle || availability.available === false) return;
    setBusy(true);
    setError(null);
    try {
      await claim(availability.handle);
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      phoneToast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const copy =
    variant === "pro"
      ? {
          title: "Name your company",
          body: `Pick @${brand} as your workspace identity — payees recognize who they’re paid by.`,
          claimedTitle: (h: string) => `You're ${h}`,
          claimedBody: "Your company handle shows on streams and payroll you send.",
          placeholder: "acme",
        }
      : {
          title: "Choose your name",
          body: `Pick @${brand} so people can pay and stream to you without a long address.`,
          claimedTitle: (h: string) => `You're ${h}`,
          claimedBody: "Others can stream and pay you by name.",
          placeholder: "alice",
        };

  // Already claimed in another tab / race
  if (handle) {
    return (
      <div className="text-left">
        <h1
          className={`font-semibold leading-[1.02] tracking-[-0.04em] max-w-[12ch] ${
            dark ? "text-white" : "text-[#111]"
          } ${embedded ? "text-[clamp(40px,12.5vw,52px)]" : "text-[clamp(48px,8vw,72px)]"}`}
        >
          {copy.claimedTitle(handle)}
        </h1>
        <p className={`mt-4 max-w-sm leading-relaxed ${muted} ${embedded ? "text-[13px]" : "text-[15px]"}`}>
          {copy.claimedBody}
        </p>
        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            className={primaryBtn}
            data-demo-action="onboard-claim-continue"
            onClick={onComplete}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-left">
      <h1
        className={`font-semibold leading-[1.02] tracking-[-0.04em] max-w-[11ch] ${
          dark ? "text-white" : "text-[#111]"
        } ${embedded ? "text-[clamp(40px,12.5vw,52px)]" : "text-[clamp(48px,8vw,72px)]"}`}
      >
        {copy.title}
      </h1>
      <p
        className={`mt-4 max-w-sm leading-relaxed ${muted} ${
          embedded ? "text-[13px]" : "text-[15px]"
        }`}
      >
        {copy.body}
      </p>

      <div className="relative mt-8 max-w-md">
        <input
          data-demo="onboard-handle"
          className={input}
          value={raw}
          onChange={(e) => setRaw(e.target.value.toLowerCase())}
          placeholder={copy.placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          autoFocus
        />
        <span
          className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] ${
            dark ? "text-white/40" : "text-[#999]"
          }`}
        >
          @{brand}
        </span>
      </div>

      {availability.message && (
        <p
          className={`mt-2.5 text-[12px] ${
            availability.available === false
              ? "text-[#c0533a]"
              : availability.available
                ? dark
                  ? "text-emerald-400/90"
                  : "text-emerald-700"
                : muted
          }`}
        >
          {availability.checking ? "Checking…" : availability.message}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {onBack ? <BackCircle onClick={onBack} /> : null}
          <button
            type="button"
            className={primaryBtn}
            data-demo-action="onboard-claim-name"
            disabled={
              busy ||
              availability.checking ||
              availability.available !== true ||
              !availability.handle
            }
            onClick={() => void onClaim()}
          >
            {busy
              ? "Claiming…"
              : availability.handle
                ? `Claim ${formatHandle(availability.handle)}`
                : "Claim name"}
          </button>
        </div>
        <button
          type="button"
          className={`self-center ${skipBtn}`}
          onClick={onComplete}
          data-demo-action="onboard-skip-name"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
