"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallets, useConnectWallet } from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";

import { filterConnectableSuiWallets, sortWalletsForConnect } from "@/lib/sui-wallets";
import { phoneToast } from "@/lib/phone-toast";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Dark Pro styling vs light landing modal. */
  variant?: "default" | "pro";
  /**
   * Render inside the phone screen stage (full glass) when available,
   * otherwise the nearest positioned ancestor.
   */
  contained?: boolean;
};

/**
 * StreamLine's own connect modal — lists detected Sui wallets and connects via
 * dApp Kit. Default: sharp corners + cream (landing). Pro: dark glass inside
 * the app / phone onboarding.
 */
export function ConnectModal({
  open,
  onClose,
  variant = "default",
  contained = false,
}: Props) {
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const [pendingName, setPendingName] = useState<string | null>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const [phoneStage, setPhoneStage] = useState<HTMLElement | null>(null);
  const pro = variant === "pro";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !contained) {
      setPhoneStage(null);
      return;
    }
    const stage = markerRef.current?.closest(
      "[data-sl-phone-stage]",
    ) as HTMLElement | null;
    setPhoneStage(stage);
  }, [open, contained]);

  if (!open) return null;

  const standardWallets = sortWalletsForConnect(
    filterConnectableSuiWallets(wallets as WalletWithRequiredFeatures[])
  );

  const onConnect = (wallet: WalletWithRequiredFeatures) => {
    setPendingName(wallet.name);
    connect(
      { wallet },
      {
        onSuccess: () => onClose(),
        onError: (e) => {
          const message = e.message ?? "Failed to connect";
          phoneToast.error(
            /phantom/i.test(wallet.name)
              ? "Couldn't connect Phantom. Enable Sui in Phantom and set the network to Testnet."
              : message
          );
        },
        onSettled: () => setPendingName(null),
      }
    );
  };

  const overlay = (
    <div
      className={
        contained && pro
          ? "absolute inset-0 z-50 flex items-center justify-center overflow-hidden px-4 font-[family-name:var(--font-inter)]"
          : contained
            ? "absolute inset-0 z-50 flex items-center justify-center overflow-hidden p-3 font-[family-name:var(--font-inter)]"
            : "fixed inset-0 z-[300] flex items-center justify-center p-4"
      }
      data-sl-cursor={pro ? "on-dark" : "on-light"}
    >
      <button
        aria-label="Close"
        className={`absolute inset-0 ${
          pro
            ? // Solid dim only — backdrop-blur paints outside the phone glass
              "bg-[#050505]/88"
            : contained
              ? "bg-[#111]/20"
              : "bg-[#1d1c44]/70 backdrop-blur-sm"
        }`}
        onClick={onClose}
      />

      <div
        className={`relative z-10 w-full overflow-hidden ${
          contained && pro
            ? "max-w-[280px] rounded-[1.35rem] border border-white/10 bg-[#141414] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
            : contained
              ? "max-w-[280px] rounded-[1.35rem] border border-black/8 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.12)]"
            : pro
              ? "max-w-[340px] rounded-3xl border border-white/10 bg-[#121212] shadow-2xl"
              : "max-w-md border border-[#2b2a5e]/15 bg-[#f1efe9] shadow-2xl"
        }`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3.5 ${
            pro
              ? "border-b border-white/10"
              : contained
                ? "border-b border-black/8"
                : "border-b border-[#2b2a5e]/15 bg-[#2b2a5e] px-5 py-4 text-white"
          }`}
        >
          <span
            className={
              pro
                ? "text-[13px] font-medium tracking-tight text-white"
                : contained
                  ? "text-[13px] font-semibold tracking-tight text-[#111]"
                  : "text-[11px] uppercase tracking-[0.2em]"
            }
          >
            {pro || contained ? "Sign in" : "Connect to StreamLine"}
          </span>
          <button
            onClick={onClose}
            className={`leading-none transition-opacity hover:opacity-60 ${
              pro
                ? "text-[22px] text-white/45"
                : contained
                  ? "text-[22px] text-[#111]/40"
                  : "text-[18px]"
            }`}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          className={`flex flex-col gap-3 ${
            pro || contained ? "p-3.5 pb-4" : "gap-5 p-5"
          }`}
        >
          <div className="flex flex-col gap-2">
            {!pro && !contained && (
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#2b2a5e]/50">
                Google or a Sui wallet
              </p>
            )}
            {standardWallets.length === 0 ? (
              <a
                href="https://slush.app"
                target="_blank"
                rel="noreferrer"
                className={
                  pro
                    ? "rounded-2xl border border-dashed border-white/15 px-4 py-3.5 text-[12px] text-white/55 transition-colors hover:border-[#fbbf24]/45 hover:text-white/80"
                    : contained
                      ? "rounded-2xl border border-dashed border-black/12 px-4 py-3.5 text-[12px] text-[#555] transition-colors hover:border-[#3d81e3]/50 hover:text-[#111]"
                      : "border border-dashed border-[#2b2a5e]/25 px-4 py-3 text-[12px] text-[#2b2a5e]/60 hover:border-[#5b54e6]"
                }
              >
                No wallets detected — install Slush, or set Google zkLogin env →
              </a>
            ) : (
              standardWallets.map((w, i) => (
                <button
                  key={w.name}
                  type="button"
                  disabled={isPending}
                  onClick={() => onConnect(w)}
                  data-demo-action={`connect-wallet-${i}`}
                  data-demo-wallet={
                    /slush/i.test(w.name)
                      ? "slush"
                      : /sui/i.test(w.name)
                        ? "sui"
                        : undefined
                  }
                  className={
                    pro
                      ? "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left text-[13px] text-white transition-colors hover:border-[#fbbf24]/40 hover:bg-white/[0.07] disabled:opacity-50"
                      : contained
                        ? "flex items-center gap-3 rounded-2xl border border-black/8 bg-[#f7f8f9] px-3.5 py-3 text-left text-[13px] text-[#111] transition-colors hover:border-[#3d81e3]/45 hover:bg-white disabled:opacity-50"
                        : "flex items-center gap-3 border border-[#2b2a5e]/20 bg-white px-4 py-3 text-left text-[13px] transition-colors hover:border-[#5b54e6] disabled:opacity-50"
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.icon} alt="" className="h-5 w-5 rounded-md" />
                  <span className="font-medium">{w.name}</span>
                  {pendingName === w.name && (
                    <span
                      className={`ml-auto text-[11px] ${
                        pro ? "text-white/40" : "text-[#888]"
                      }`}
                    >
                      …
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {!pro && !contained && (
            <p className="text-[11px] leading-relaxed text-[#2b2a5e]/50">
              Prefer <strong>Sign in with Google</strong> (zkLogin). Extension
              wallets like <strong>Slush</strong> or <strong>Phantom</strong>{" "}
              also work — set them to <strong>Testnet</strong>.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (contained) {
    return (
      <>
        <span ref={markerRef} className="hidden" aria-hidden />
        {phoneStage ? createPortal(overlay, phoneStage) : overlay}
      </>
    );
  }

  if (typeof document === "undefined") return null;

  // Portal to <body> so the modal escapes the header's backdrop-filter, which
  // would otherwise become the containing block for this fixed element.
  return createPortal(overlay, document.body);
}
