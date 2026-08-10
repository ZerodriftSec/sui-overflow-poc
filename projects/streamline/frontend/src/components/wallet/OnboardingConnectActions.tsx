"use client";

import { useState } from "react";
import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";

import { phoneToast } from "@/lib/phone-toast";
import { filterConnectableSuiWallets } from "@/lib/sui-wallets";

type Variant = "user" | "pro";

type Props = {
  variant: Variant;
  onOpenWalletModal: () => void;
};

function findWallet(
  wallets: WalletWithRequiredFeatures[],
  pattern: RegExp
): WalletWithRequiredFeatures | undefined {
  return wallets.find((w) => pattern.test(w.name));
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.72 12.71c.03 3.06 2.68 4.08 2.71 4.1-.02.07-.42 1.46-1.4 2.89-.84 1.24-1.72 2.47-3.1 2.5-1.35.02-1.79-1.01-3.34-1.01s-2.07 1.01-3.37.98c-1.36-.03-2.4-1.42-3.25-2.65-1.74-2.52-3.07-7.12-1.28-10.24.88-1.55 2.47-2.53 4.18-2.56 1.31-.03 2.54.88 3.34.88s2.52-1.09 4.25-.93c.72.03 2.75.29 4.05 2.2-.1.07-2.42 1.41-2.39 4.24zM14.18 4.22c.71-.86 1.19-2.05 1.06-3.24-1.02.04-2.26.68-3 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.31-.58 3.02-1.45z" />
    </svg>
  );
}

function WalletGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-14a1.5 1.5 0 0 1-1.5-1.5v-11A2 2 0 0 1 4 5h13" />
      <path d="M16.5 13.5h.01" />
    </svg>
  );
}

/**
 * Onboarding sign-in: Google primary; Apple + Sui wallet as equal secondary cards.
 * Apple stays gated until Enoki ships an `apple` AuthProvider.
 */
export function OnboardingConnectActions({
  variant,
  onOpenWalletModal,
}: Props) {
  const wallets = useWallets();
  const { mutate: connect, isPending } = useConnectWallet();
  const [pending, setPending] = useState<"google" | null>(null);

  const list = filterConnectableSuiWallets(
    wallets as WalletWithRequiredFeatures[]
  );
  const google = findWallet(list, /google/i);
  const apple = findWallet(list, /apple/i);
  const pro = variant === "pro";

  const onGoogle = () => {
    if (!google) {
      phoneToast.error(
        "Google sign-in isn’t configured yet. Set Enoki + Google client env, or use a Sui wallet."
      );
      return;
    }
    setPending("google");
    connect(
      { wallet: google },
      {
        onError: (e) =>
          phoneToast.error(e.message ?? "Failed to connect with Google"),
        onSettled: () => setPending(null),
      }
    );
  };

  const primaryBtn = pro
    ? "flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-4 text-[14px] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
    : "flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#111] px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50";

  const cardBtn = pro
    ? "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
    : "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-black/12 bg-white px-2.5 text-[12px] font-semibold text-[#111] transition-colors hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-45";

  const iconTone = pro ? "text-white" : "text-[#111]";

  return (
    <div className="flex w-full flex-col gap-2.5">
      <button
        type="button"
        disabled={isPending}
        onClick={onGoogle}
        className={primaryBtn}
      >
        <GoogleGlyph className="h-[18px] w-[18px] shrink-0" />
        {pending === "google" ? "Connecting…" : "Continue with Google"}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!apple || isPending}
          onClick={() => {
            if (!apple) return;
            connect(
              { wallet: apple },
              {
                onError: (e) =>
                  phoneToast.error(e.message ?? "Failed to connect with Apple"),
              }
            );
          }}
          title="Login with Apple"
          className={cardBtn}
        >
          <AppleGlyph className={`h-[15px] w-[15px] shrink-0 ${iconTone}`} />
          <span className="truncate">Login with Apple</span>
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onOpenWalletModal}
          data-demo-action="connect-sui"
          className={cardBtn}
        >
          <WalletGlyph className={`h-4 w-4 shrink-0 ${iconTone}`} />
          <span className="truncate">Sui wallet</span>
        </button>
      </div>
    </div>
  );
}
