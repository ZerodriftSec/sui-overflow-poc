"use client";

import { QRCodeSVG } from "qrcode.react";

const IOS_URL = "https://streamline.app/download/ios";
const ANDROID_URL = "https://streamline.app/download/android";

export type StorePlatform = "apple" | "google";

function AppleBadge({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`flex w-full items-center justify-center gap-2 rounded-lg bg-[#111] text-white shadow-sm ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0"}
        fill="currentColor"
        aria-hidden
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.63 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <div className="min-w-0 text-center leading-none">
        <p className={`font-medium text-white/70 ${compact ? "text-[7px]" : "text-[8px]"}`}>
          Download on the
        </p>
        <p className={`mt-0.5 font-semibold tracking-tight ${compact ? "text-[10px]" : "text-[11px]"}`}>
          App Store
        </p>
      </div>
    </div>
  );
}

function GoogleBadge({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`flex w-full items-center justify-center gap-2 rounded-lg bg-[#111] text-white shadow-sm ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0"}
        aria-hidden
      >
        <path fill="#EA4335" d="M3.6 1.8l13.2 7.6c.5.3.5 1 0 1.3L3.6 18.2c-.6.3-1.3-.1-1.3-.8V2.6c0-.7.7-1.1 1.3-.8z" />
        <path fill="#FBBC04" d="M16.8 12 3.6 18.2V12l6.6 3.8L16.8 12z" opacity="0.9" />
        <path fill="#34A853" d="M3.6 5.8 16.8 12 10.2 15.8 3.6 12V5.8z" opacity="0.85" />
        <path fill="#4285F4" d="M10.2 8.2 16.8 12 10.2 15.8 3.6 12l6.6-3.8z" opacity="0.75" />
      </svg>
      <div className="min-w-0 text-center leading-none">
        <p className={`font-medium text-white/70 ${compact ? "text-[7px]" : "text-[8px]"}`}>
          Get it on
        </p>
        <p className={`mt-0.5 font-semibold tracking-tight ${compact ? "text-[10px]" : "text-[11px]"}`}>
          Google Play
        </p>
      </div>
    </div>
  );
}

type StoreDownloadCardProps = {
  store: StorePlatform;
  size?: "sm" | "md";
  className?: string;
};

export function StoreDownloadCard({
  store,
  size = "md",
  className = "",
}: StoreDownloadCardProps) {
  const compact = size === "sm";
  const qrSize = compact ? 104 : 132;
  const isApple = store === "apple";
  const url = isApple ? IOS_URL : ANDROID_URL;

  return (
    <div
      className={`flex w-full max-w-[180px] flex-col gap-2.5 rounded-xl border border-black/10 bg-white/70 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.05)] backdrop-blur-sm ${className}`}
    >
      {isApple ? <AppleBadge compact={compact} /> : <GoogleBadge compact={compact} />}
      <div className="relative w-full overflow-hidden rounded-lg border border-black/8 bg-white p-2">
        <QRCodeSVG
          value={url}
          size={qrSize}
          level="M"
          marginSize={1}
          bgColor="#ffffff"
          fgColor="#111111"
          className="mx-auto block h-auto w-full max-w-full"
          title={isApple ? "App Store download QR code" : "Google Play download QR code"}
        />
      </div>
    </div>
  );
}
