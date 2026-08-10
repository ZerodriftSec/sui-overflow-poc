"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { ConnectModal } from "./ConnectModal";
import { AccountMenu, DemoProfileMenu } from "./AccountMenu";

/**
 * StreamLine wallet entry point. Shows the connected account menu when a
 * wallet / zkLogin session is active, otherwise a button that opens our custom
 * connect modal. Mount-gated so SSR and hydration agree on the connection state.
 */
export function WalletButton({
  className,
  showFaucetInMenu = false,
  faucetAmount,
  variant = "default",
  profilePro = false,
  label,
  connectModal = "default",
  containedModal = false,
  onExportActivity,
  onCompliance,
  onExitDemo,
}: {
  className?: string;
  showFaucetInMenu?: boolean;
  faucetAmount?: number;
  variant?: "default" | "profile";
  profilePro?: boolean;
  /** Override the disconnected CTA label (e.g. "Continue with Google"). */
  label?: string;
  /** Connect modal look — Pro uses dark styling. */
  connectModal?: "default" | "pro";
  /** Keep the modal inside the phone / Pro shell instead of document.body. */
  containedModal?: boolean;
  onExportActivity?: () => void;
  onCompliance?: () => void;
  /** Pro explore-demo: show profile menu with Exit demo instead of Connect. */
  onExitDemo?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const account = useCurrentAccount();

  useEffect(() => setMounted(true), []);

  const buttonClass =
    className ??
    "inline-flex items-center bg-[#2b2a5e] px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-white transition-opacity hover:opacity-90";

  const connectClass =
    variant === "profile"
      ? className?.includes("sl-glass-btn-dark")
        ? "sl-glass-btn-dark shrink-0 !px-2.5 !py-1 !text-[8px]"
        : "inline-flex shrink-0 items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-[8px] font-medium uppercase tracking-[0.12em] text-[#111] transition-colors hover:bg-[#f8f8f8]"
      : buttonClass;

  const connectLabel = label ?? "connect wallet";

  if (!mounted) {
    return <span className={connectClass}>{label ?? "connect"}</span>;
  }

  if (account) {
    return (
      <AccountMenu
        className={className}
        showFaucet={showFaucetInMenu}
        faucetAmount={faucetAmount}
        variant={variant}
        profilePro={profilePro}
        onExportActivity={onExportActivity}
        onCompliance={onCompliance}
      />
    );
  }

  if (onExitDemo) {
    return (
      <>
        <DemoProfileMenu
          profilePro={profilePro || variant === "profile"}
          onExitDemo={onExitDemo}
          onSignIn={() => setOpen(true)}
        />
        <ConnectModal
          open={open}
          onClose={() => setOpen(false)}
          variant={connectModal}
          contained={containedModal}
        />
      </>
    );
  }

  return (
    <>
      <button className={connectClass} onClick={() => setOpen(true)}>
        {connectLabel}
      </button>
      <ConnectModal
        open={open}
        onClose={() => setOpen(false)}
        variant={connectModal}
        contained={containedModal}
      />
    </>
  );
}
