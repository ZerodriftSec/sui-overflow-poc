"use client";

import { useEffect, useRef, useState } from "react";
import {
  useCurrentAccount,
  useCurrentWallet,
  useDisconnectWallet,
  useAccounts,
  useSwitchAccount,
  useSuiClientContext,
} from "@mysten/dapp-kit";

import {
  shortAddress,
  explorerUrl,
  copyToClipboard,
} from "@/lib/format";
import type { NetworkName } from "@/lib/networks";
import { useMyHandle } from "@/lib/use-handle";
import { pk } from "@/lib/shielded";
import { getSpendKey } from "@/lib/shielded-store";
import { myShieldedAddress } from "@/lib/shielded-address";
import { FaucetButton } from "./FaucetButton";
import { ClaimHandleModal } from "./ClaimHandleModal";
import {
  ProfileIcon,
  profileIconButtonClass,
} from "@/components/app/phone/PhoneHeaderActions";

function profileBtnPrimary(dark: boolean) {
  return dark
    ? "w-full rounded-2xl bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111] transition-opacity hover:opacity-90 disabled:opacity-40"
    : "w-full rounded-2xl bg-[#111] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-40";
}

function profileBtnSecondary(dark: boolean) {
  return dark
    ? "w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-white/10"
    : "w-full rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111] transition-colors hover:bg-[#fafafa]";
}

/**
 * Connected-state control: shows the active address with a dropdown for copy,
 * explorer, account switching, and disconnect. Replaces the connect button
 * once a wallet/zkLogin session is active.
 */
export function AccountMenu({
  className,
  showFaucet = false,
  faucetAmount = 1000,
  variant = "default",
  profilePro = false,
  onExportActivity,
  onCompliance,
}: {
  className?: string;
  showFaucet?: boolean;
  faucetAmount?: number;
  variant?: "default" | "profile";
  profilePro?: boolean;
  /** Opens in-phone export flow (User app). */
  onExportActivity?: () => void;
  /** Opens Pro compliance / reports. */
  onCompliance?: () => void;
}) {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const accounts = useAccounts();
  const { mutate: switchAccount } = useSwitchAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { network } = useSuiClientContext();
  const { handle, configured: suinsReady } = useMyHandle();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [sl, setSl] = useState("");
  const [slCopied, setSlCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Derive the wallet's sl1 shielded receive address from its local spend key.
  useEffect(() => {
    const addr = account?.address;
    if (!addr) {
      setSl("");
      return;
    }
    const sk = getSpendKey(addr);
    let cancelled = false;
    pk(sk).then((pkv) => {
      if (!cancelled) setSl(myShieldedAddress(sk, pkv));
    });
    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  if (!account) return null;

  const onCopy = async () => {
    if (await copyToClipboard(account.address)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const onCopySl = async () => {
    if (sl && (await copyToClipboard(sl))) {
      setSlCopied(true);
      setTimeout(() => setSlCopied(false), 1200);
    }
  };

  const isProfile = variant === "profile";
  const dark = isProfile && profilePro;

  return (
    <div
      className="relative"
      ref={ref}
      data-sl-cursor={isProfile ? (profilePro ? "on-dark" : "on-light") : className ? "on-light" : "on-dark"}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          isProfile
            ? profileIconButtonClass(profilePro)
            : `flex items-center gap-2 transition-opacity ${
                className ??
                "border border-white/20 bg-[#2b2a5e] px-4 py-2.5 text-[12px] text-white hover:opacity-90"
              }`
        }
        aria-label="Account menu"
        aria-expanded={open}
      >
        {isProfile ? <ProfileIcon /> : (
          <>
            {currentWallet?.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentWallet.icon} alt="" className="h-[1.1em] w-[1.1em] shrink-0" />
            )}
            <span className="tabular truncate">
              {handle ?? account.label ?? shortAddress(account.address)}
            </span>
            <span className="text-[0.8em] opacity-60">▼</span>
          </>
        )}
      </button>

      {open && isProfile && (
        <div
          className={`absolute right-0 z-[120] mt-2 w-[min(17.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border shadow-[0_12px_40px_rgba(0,0,0,0.14)] ${
            dark
              ? "border-white/10 bg-[#161616] text-white"
              : "border-black/10 bg-white text-[#111]"
          }`}
        >
          <div className="p-3.5">
            <p
              className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${
                dark ? "text-white/45" : "text-[#888]"
              }`}
            >
              Wallet
            </p>

            <div className="mt-2.5 flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                  dark
                    ? "border-white/10 bg-white/8"
                    : "border-black/8 bg-[#fafafa]"
                }`}
              >
                {currentWallet?.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentWallet.icon} alt="" className="h-5 w-5" />
                ) : (
                  <ProfileIcon />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold tracking-tight">
                  {currentWallet?.name ?? "Connected"}
                </p>
                <p
                  className={`mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] ${
                    dark ? "text-white/40" : "text-[#888]"
                  }`}
                >
                  {network}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  dark
                    ? "border-white/10 text-white/50 hover:border-[#f87171]/40 hover:bg-[#f87171]/10 hover:text-[#f87171]"
                    : "border-black/8 text-[#999] hover:border-[#c0533a]/35 hover:bg-[#c0533a]/08 hover:text-[#c0533a]"
                }`}
                aria-label="Disconnect"
                title="Disconnect"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>

            <div
              className={`mt-3 flex items-stretch gap-2 rounded-xl border px-3 py-2.5 ${
                dark
                  ? "border-white/10 bg-white/[0.04]"
                  : "border-black/10 bg-[#fafafa]"
              }`}
            >
              <div className="min-w-0 flex-1 text-left">
                {handle ? (
                  <>
                    <p
                      className={`truncate text-[12px] font-semibold tracking-tight ${
                        dark ? "text-white" : "text-[#111]"
                      }`}
                    >
                      {handle}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-[9px] ${
                        dark ? "text-white/40" : "text-[#999]"
                      }`}
                    >
                      {shortAddress(account.address, 8, 6)}
                    </p>
                    {suinsReady && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setClaimOpen(true);
                        }}
                        className={`mt-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] ${
                          dark
                            ? "text-white/45 hover:text-white/70"
                            : "text-[#888] hover:text-[#555]"
                        }`}
                      >
                        Manage
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p
                      className={`font-mono text-[10px] leading-relaxed ${
                        dark ? "text-white/75" : "text-[#333]"
                      }`}
                    >
                      {shortAddress(account.address, 8, 6)}
                    </p>
                    {suinsReady ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setClaimOpen(true);
                        }}
                        className={`mt-1.5 text-[10px] font-semibold tracking-tight ${
                          dark
                            ? "text-white hover:text-white/80"
                            : "text-[#111] hover:text-[#444]"
                        }`}
                      >
                        Claim @handle
                      </button>
                    ) : (
                      <p
                        className={`mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] ${
                          dark ? "text-white/35" : "text-[#aaa]"
                        }`}
                      >
                        Address
                      </p>
                    )}
                  </>
                )}
                {copied && (
                  <p
                    className={`mt-1 text-[9px] font-medium ${
                      dark ? "text-[#4ade80]" : "text-[#1a5c38]"
                    }`}
                  >
                    Address copied
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void onCopy()}
                className={`flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-xl border transition-colors ${
                  copied
                    ? dark
                      ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]"
                      : "border-[#1a5c38]/30 bg-[#1a5c38]/08 text-[#1a5c38]"
                    : dark
                      ? "border-white/10 text-white/50 hover:bg-white/[0.08] hover:text-white"
                      : "border-black/8 text-[#999] hover:bg-black/[0.04] hover:text-[#111]"
                }`}
                aria-label="Copy address"
                title="Copy address"
              >
                {copied ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            {sl && (
              <div
                className={`mt-2 flex items-stretch gap-2 rounded-xl border px-3 py-2.5 ${
                  dark
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-black/10 bg-[#fafafa]"
                }`}
              >
                <div className="min-w-0 flex-1 text-left">
                  <p
                    className={`text-[8px] font-semibold uppercase tracking-[0.12em] ${
                      dark ? "text-white/40" : "text-[#999]"
                    }`}
                  >
                    Private receive address
                  </p>
                  <p
                    className={`mt-0.5 truncate font-mono text-[9px] ${
                      dark ? "text-white/70" : "text-[#333]"
                    }`}
                  >
                    {sl}
                  </p>
                  {slCopied && (
                    <p
                      className={`mt-1 text-[9px] font-medium ${
                        dark ? "text-[#4ade80]" : "text-[#1a5c38]"
                      }`}
                    >
                      Copied
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onCopySl()}
                  className={`flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-xl border transition-colors ${
                    slCopied
                      ? dark
                        ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]"
                        : "border-[#1a5c38]/30 bg-[#1a5c38]/[0.08] text-[#1a5c38]"
                      : dark
                        ? "border-white/10 text-white/50 hover:bg-white/[0.08] hover:text-white"
                        : "border-black/8 text-[#999] hover:bg-black/[0.04] hover:text-[#111]"
                  }`}
                  aria-label="Copy private receive address"
                  title="Copy sl1 receive address"
                >
                  {slCopied ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          <div
            className={`flex flex-col gap-2 border-t px-3 py-3 ${
              dark ? "border-white/8" : "border-black/6"
            }`}
          >
            {!profilePro && onExportActivity && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onExportActivity();
                }}
                className={profileBtnPrimary(dark)}
              >
                Export activity
              </button>
            )}

            {showFaucet && (
              <FaucetButton
                amount={faucetAmount}
                label={`Mint ${faucetAmount.toLocaleString()} USDC`}
                className={
                  !profilePro && onExportActivity
                    ? profileBtnSecondary(dark)
                    : profileBtnPrimary(dark)
                }
              />
            )}

            {accounts.length > 1 && (
              <div className="flex flex-col gap-1.5 pt-1">
                <p
                  className={`px-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${
                    dark ? "text-white/35" : "text-[#aaa]"
                  }`}
                >
                  Switch account
                </p>
                {accounts
                  .filter((a) => a.address !== account.address)
                  .map((a) => (
                    <button
                      key={a.address}
                      type="button"
                      onClick={() => {
                        switchAccount({ account: a });
                        setOpen(false);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left font-mono text-[10px] transition-colors ${
                        dark
                          ? "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                          : "border-black/8 bg-[#fafafa] text-[#444] hover:bg-[#f3f3f3]"
                      }`}
                    >
                      {shortAddress(a.address, 8, 6)}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {open && !isProfile && (
        <div className="absolute right-0 z-[120] mt-2 w-64 border border-[#2b2a5e]/15 bg-[#f1efe9] text-[#2b2a5e] shadow-2xl">
          <div className="border-b border-[#2b2a5e]/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#2b2a5e]/50">
              {currentWallet?.name ?? "Wallet"} · {network}
            </p>
            {handle && (
              <p className="mt-1 text-[13px] font-semibold tracking-tight">
                {handle}
              </p>
            )}
            <p className="mt-1 break-all font-mono text-[12px]">
              {shortAddress(account.address, 10, 6)}
            </p>
          </div>

          <div className="flex flex-col py-1 text-[12px]">
            {suinsReady && (
              <button
                onClick={() => {
                  setOpen(false);
                  setClaimOpen(true);
                }}
                className="px-4 py-2 text-left hover:bg-[#2b2a5e]/[0.05]"
              >
                {handle ? "Manage handle" : "Claim @handle"}
              </button>
            )}
            <button
              onClick={onCopy}
              className="px-4 py-2 text-left hover:bg-[#2b2a5e]/[0.05]"
            >
              {copied ? "Copied ✓" : "Copy address"}
            </button>
            <a
              href={explorerUrl(network as NetworkName, "account", account.address)}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 hover:bg-[#2b2a5e]/[0.05]"
            >
              View on explorer ↗
            </a>
          </div>

          {showFaucet && (
            <div className="border-t border-[#2b2a5e]/10 px-3 py-2">
              <FaucetButton
                amount={faucetAmount}
                label={`Mint ${faucetAmount.toLocaleString()} USDC`}
                className="w-full rounded-xl border border-[#2b2a5e]/20 bg-white px-3 py-2 text-[11px] font-medium text-[#2b2a5e]/85 transition-colors hover:border-[#5b54e6] hover:bg-[#2b2a5e]/[0.03] disabled:opacity-40"
              />
            </div>
          )}

          {accounts.length > 1 && (
            <div className="border-t border-[#2b2a5e]/10 py-1">
              <p className="px-4 py-1 text-[10px] uppercase tracking-[0.16em] text-[#2b2a5e]/40">
                Switch account
              </p>
              {accounts
                .filter((a) => a.address !== account.address)
                .map((a) => (
                  <button
                    key={a.address}
                    onClick={() => {
                      switchAccount({ account: a });
                      setOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left font-mono text-[12px] hover:bg-[#2b2a5e]/[0.05]"
                  >
                    {shortAddress(a.address)}
                  </button>
                ))}
            </div>
          )}

          <div className="border-t border-[#2b2a5e]/10 py-1">
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-[12px] text-[#c0533a] hover:bg-[#c0533a]/[0.08]"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      <ClaimHandleModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        dark={dark}
      />
    </div>
  );
}

/** Profile icon menu while exploring Pro demo (no wallet). */
export function DemoProfileMenu({
  profilePro = true,
  onExitDemo,
  onSignIn,
}: {
  profilePro?: boolean;
  onExitDemo: () => void;
  onSignIn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dark = profilePro;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div
      className="relative"
      ref={ref}
      data-sl-cursor={profilePro ? "on-dark" : "on-light"}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={profileIconButtonClass(profilePro)}
        aria-label="Demo profile"
        aria-expanded={open}
      >
        <ProfileIcon />
      </button>

      {open ? (
        <div
          className={`absolute right-0 z-50 mt-2 w-[220px] overflow-hidden rounded-2xl border shadow-xl ${
            dark
              ? "border-white/10 bg-[#141414] text-white"
              : "border-black/10 bg-white text-[#111]"
          }`}
        >
          <div className="px-3 py-3">
            <p
              className={`text-[8px] font-medium uppercase tracking-[0.16em] ${
                dark ? "text-white/40" : "text-[#888]"
              }`}
            >
              Demo
            </p>
            <p
              className={`mt-1 text-[13px] font-semibold tracking-tight ${
                dark ? "text-white" : "text-[#111]"
              }`}
            >
              Sample payroll
            </p>
            <p
              className={`mt-0.5 text-[10px] leading-snug ${
                dark ? "text-white/40" : "text-[#888]"
              }`}
            >
              Explore without a wallet. Sign in anytime to start fresh.
            </p>
          </div>
          <div
            className={`flex flex-col gap-2 border-t px-3 py-3 ${
              dark ? "border-white/8" : "border-black/6"
            }`}
          >
            {onSignIn ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignIn();
                }}
                className={profileBtnSecondary(dark)}
              >
                Sign in
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onExitDemo();
              }}
              className={profileBtnPrimary(dark)}
            >
              Exit demo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

