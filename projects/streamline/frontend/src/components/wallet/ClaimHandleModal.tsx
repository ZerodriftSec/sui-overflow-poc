"use client";

import { useState } from "react";

import { formatHandle, suinsBrand, suinsConfigured } from "@/lib/handle";
import { useHandleAvailability, useMyHandle } from "@/lib/use-handle";

type ClaimHandleModalProps = {
  open: boolean;
  onClose: () => void;
  /** Dark styling for Pro phone shell. */
  dark?: boolean;
};

/**
 * Claim a StreamLine SuiNS subname (`alice@streamline`) via Enoki.
 */
export function ClaimHandleModal({
  open,
  onClose,
  dark = false,
}: ClaimHandleModalProps) {
  const { handle, claim, error, setError } = useMyHandle();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const availability = useHandleAvailability(raw);

  if (!open) return null;

  const brand = suinsBrand();
  const panel = dark
    ? "border-white/10 bg-[#161616] text-white"
    : "border-black/10 bg-white text-[#111]";
  const muted = dark ? "text-white/45" : "text-[#888]";
  const input = dark
    ? "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
    : "w-full rounded-xl border border-black/12 bg-[#fafafa] px-3 py-2.5 text-[13px] text-[#111] outline-none placeholder:text-[#aaa] focus:border-black/25";
  const primary = dark
    ? "w-full rounded-2xl bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111] disabled:opacity-40"
    : "w-full rounded-2xl bg-[#111] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";
  const secondary = dark
    ? "w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white"
    : "w-full rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111]";

  const onClaim = async () => {
    if (!availability.handle || availability.available === false) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await claim(availability.handle);
      setDone(result.displayName);
      setChanging(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative z-10 mx-3 mb-3 w-full max-w-sm overflow-hidden rounded-[1.5rem] border shadow-[0_20px_50px_rgba(0,0,0,0.25)] sm:mb-0 ${panel}`}
      >
        <div className="p-4">
          <p
            className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${muted}`}
          >
            StreamLine name
          </p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-tight">
            {changing
              ? "Use a different name"
              : handle || done
                ? "Your handle"
                : `Claim @${brand}`}
          </h2>
          <p className={`mt-1.5 text-[12px] leading-snug ${muted}`}>
            A portable SuiNS identity. Others can pay and stream to you by name.
          </p>

          {(handle || done) && !changing && (
            <div
              className={`mt-4 rounded-xl border px-3 py-3 ${
                dark
                  ? "border-white/10 bg-white/[0.04]"
                  : "border-black/8 bg-[#fafafa]"
              }`}
            >
              <p className="text-[15px] font-semibold tracking-tight">
                {done ?? handle}
              </p>
              <p className={`mt-1 text-[11px] ${muted}`}>
                Resolves on-chain via SuiNS
              </p>
              {handle && !done && (
                <button
                  type="button"
                  onClick={() => {
                    setChanging(true);
                    setRaw("");
                    setError(null);
                  }}
                  className={`mt-2 text-[11px] font-semibold ${
                    dark ? "text-white/70" : "text-[#5b54e6]"
                  }`}
                >
                  Use a different name
                </button>
              )}
            </div>
          )}

          {(!handle || changing) && !done && (
            <div className="mt-4 space-y-2">
              <label className={`block text-[9px] font-semibold uppercase tracking-[0.14em] ${muted}`}>
                Choose a name
              </label>
              <div className="relative">
                <input
                  className={input}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value.toLowerCase())}
                  placeholder="alice"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <span
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] ${muted}`}
                >
                  @{brand}
                </span>
              </div>
              {availability.message && (
                <p
                  className={`text-[11px] ${
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
            </div>
          )}

          {(error) && (
            <p className="mt-3 text-[11px] leading-snug text-[#c0533a]">
              {error}
            </p>
          )}
        </div>

        <div
          className={`flex flex-col gap-2 border-t px-4 py-3 ${
            dark ? "border-white/8" : "border-black/6"
          }`}
        >
          {(!handle || changing) && !done && (
            <button
              type="button"
              className={primary}
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
                  : "Claim handle"}
            </button>
          )}
          <button type="button" className={secondary} onClick={onClose}>
            {handle || done ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClaimHandleButton({
  dark = false,
  className,
}: {
  dark?: boolean;
  className?: string;
}) {
  const { handle, loading } = useMyHandle();
  const [open, setOpen] = useState(false);

  const label = loading
    ? "…"
    : handle
      ? handle
      : `Claim @${suinsBrand()}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </button>
      <ClaimHandleModal
        open={open}
        onClose={() => setOpen(false)}
        dark={dark}
      />
    </>
  );
}

export { suinsConfigured };
