import { formatAddress } from "@mysten/sui/utils";
import { useMemo } from "react";
import type { WalletOAuthProvider } from "../lib/wallet-oauth";
import { cn } from "../lib/utils";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function OAuthBadge({ provider }: { provider: WalletOAuthProvider }) {
  if (provider !== "google") {
    return null;
  }

  return (
    <span
      className="absolute -bottom-px -right-px flex h-[44%] w-[44%] min-h-[9px] min-w-[9px] max-h-[13px] max-w-[13px] items-center justify-center rounded-full border border-bg-panel bg-white p-px shadow-sm"
      title="Signed in with Google"
    >
      <GoogleIcon className="h-full w-full" />
    </span>
  );
}

function hashAddress(address: string): number {
  const normalized = address.toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = normalized.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getAddressGradient(address: string): string {
  const hash = hashAddress(address);
  const hueA = hash % 360;
  const hueB = (hueA + 40 + (hash % 80)) % 360;
  const chromaA = 0.14 + (hash % 10) / 100;
  const chromaB = 0.12 + ((hash >> 4) % 10) / 100;

  return `linear-gradient(135deg, oklch(0.62 ${chromaA} ${hueA}), oklch(0.48 ${chromaB} ${hueB}))`;
}

function isAddressLikeLabel(label: string, address: string): boolean {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedAddress = address.toLowerCase();

  return (
    normalizedLabel.startsWith("0x") ||
    normalizedLabel === normalizedAddress ||
    normalizedLabel === formatAddress(address).toLowerCase()
  );
}

export function getAccountIdentityLabel(
  label: string | undefined,
  address: string,
): string | null {
  if (!label?.trim() || isAddressLikeLabel(label, address)) {
    return null;
  }
  return label.trim();
}

interface AddressAvatarProps {
  address: string;
  className?: string;
  oauthProvider?: WalletOAuthProvider | null;
}

export function AddressAvatar({
  address,
  className,
  oauthProvider,
}: AddressAvatarProps) {
  const background = useMemo(() => getAddressGradient(address), [address]);

  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        className={cn("inline-block rounded-full", className)}
        style={{ background }}
      />
      {oauthProvider ? <OAuthBadge provider={oauthProvider} /> : null}
    </span>
  );
}
