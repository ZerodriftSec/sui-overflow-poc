import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDAppKit, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { formatAddress } from "@mysten/sui/utils";
import {
  Check,
  ChevronDown,
  Copy,
  LogOut,
  Wallet,
} from "lucide-react";
import { useSuiNSName } from "../hooks/useSuiNSName";
import { getWalletOAuthProvider } from "../lib/wallet-oauth";
import {
  AddressAvatar,
  getAccountIdentityLabel,
} from "./AddressAvatar";
import { cn } from "../lib/utils";

type ConnectModalElement = HTMLElementTagNameMap["mysten-dapp-kit-connect-modal"];

interface WalletConnectControlProps {
  size?: "compact" | "cta";
  className?: string;
  connectLabel?: string;
}

export function WalletConnectControl({
  size = "compact",
  className,
  connectLabel = "Connect wallet",
}: WalletConnectControlProps) {
  const dAppKit = useDAppKit();
  const connection = useWalletConnection();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectModalKey, setConnectModalKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldShowConnectModalRef = useRef(false);

  const account = connection.account;
  const wallet = connection.wallet;
  const isConnected =
    connection.isConnected && account !== null && wallet !== null;
  const { data: suinsName } = useSuiNSName(account?.address);

  function getConnectModal(): ConnectModalElement | null {
    return (
      rootRef.current?.querySelector("mysten-dapp-kit-connect-modal") ?? null
    );
  }

  function openConnectModal() {
    // Remount so a prior connecting/error view for another wallet is cleared.
    shouldShowConnectModalRef.current = true;
    setConnectModalKey((key) => key + 1);
  }

  useLayoutEffect(() => {
    if (!shouldShowConnectModalRef.current) return;
    shouldShowConnectModalRef.current = false;
    void getConnectModal()?.show();
  }, [connectModalKey]);

  useEffect(() => {
    if (!isConnected) return;
    void getConnectModal()?.close();
  }, [isConnected]);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleCopyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access may be blocked.
    }
  }

  async function handleDisconnect() {
    setMenuOpen(false);
    await dAppKit.disconnectWallet();
  }

  if (!isConnected) {
    return (
      <div ref={rootRef} className={cn("dapp-kit-themed", className)}>
        <button
          type="button"
          onClick={openConnectModal}
          className={cn(
            "inline-flex items-center transition-colors",
            size === "compact" &&
              "max-w-[180px] gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-2 py-1 text-[11px] font-medium text-foreground hover:border-border-focus hover:bg-bg-raised",
            size === "cta" &&
              "gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-brand-foreground shadow-[0_10px_25px_-5px_oklch(0.75_0.18_55_/_0.25)] hover:bg-[oklch(0.7_0.18_55)]",
          )}
        >
          <Wallet className={size === "compact" ? "h-3 w-3 shrink-0" : "h-4 w-4"} />
          <span className="truncate">{connectLabel}</span>
        </button>
        {connectModalKey > 0 ? <ConnectModal key={connectModalKey} /> : null}
      </div>
    );
  }

  const shortAddress = formatAddress(account.address);
  const identityLabel = getAccountIdentityLabel(account.label, account.address);
  const triggerLabel = suinsName ?? identityLabel ?? shortAddress;
  const oauthProvider = getWalletOAuthProvider(wallet.name);
  const hasMultipleAccounts = wallet.accounts.length > 1;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className={cn(
          "inline-flex max-w-[200px] items-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel text-[11px] font-medium text-foreground transition-colors hover:border-border-focus hover:bg-bg-raised",
          size === "compact" ? "px-2 py-1" : "px-2.5 py-1.5 text-[12px]",
        )}
      >
        <AddressAvatar
          address={account.address}
          oauthProvider={oauthProvider}
          className={size === "compact" ? "h-4 w-4" : "h-5 w-5"}
        />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-text-secondary transition-transform",
            menuOpen && "rotate-180",
          )}
        />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-lg border border-border-subtle bg-bg-panel shadow-xl"
        >
          <div className="border-b border-border-subtle px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Account
            </p>
          </div>

          <div className="flex items-center gap-2.5 px-3 py-3">
            <AddressAvatar
              address={account.address}
              oauthProvider={oauthProvider}
              className="h-7 w-7"
            />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <p className="truncate font-mono text-[12px] leading-none text-foreground">
                {shortAddress}
              </p>
              <button
                type="button"
                aria-label={copied ? "Address copied" : "Copy address"}
                onClick={() => void handleCopyAddress(account.address)}
                className="inline-flex shrink-0 items-center justify-center rounded p-1 text-text-secondary transition-colors hover:bg-bg-raised hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-status-approved" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {hasMultipleAccounts ? (
            <div className="border-t border-border-subtle px-2 pb-2">
              <p className="px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Switch account
              </p>
              <ul className="space-y-0.5">
                {wallet.accounts.map((walletAccount) => {
                  const selected = walletAccount.address === account.address;
                  const label = formatAddress(walletAccount.address);

                  return (
                    <li key={walletAccount.address}>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          dAppKit.switchAccount({ account: walletAccount });
                          setMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                          selected
                            ? "bg-resolve-accent/15 text-foreground"
                            : "text-foreground hover:bg-bg-raised",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                            selected
                              ? "border-resolve-accent bg-resolve-accent text-bg-app"
                              : "border-border-subtle text-transparent",
                          )}
                        >
                          <Check className="h-2 w-2" />
                        </span>
                        <AddressAvatar
                          address={walletAccount.address}
                          className="h-4 w-4"
                        />
                        <span className="min-w-0 truncate font-mono">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-border-subtle p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleDisconnect()}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-[12px] text-destructive-foreground transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
