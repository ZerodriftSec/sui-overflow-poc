"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { WalletButton } from "@/components/wallet/WalletButton";
import { StreamLineMark } from "@/components/landing/StreamLineMark";
import type { StreamRequestParams } from "@/lib/request-link";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";
import { ScanIconButton } from "./PhoneHeaderActions";
import { ProTitleWithDemo } from "@/components/app/pro/ProHeaderExtras";
import {
  enterProDemoMode,
  exitProDemoMode,
  useProDemoMode,
} from "@/lib/pro-demo-mode";
import { PhoneLauncher } from "./PhoneLauncher";
import { PhoneUserApp } from "./PhoneUserApp";
import { PhoneProApp } from "./PhoneProApp";
import { PhoneScanView } from "./PhoneScanView";
import { PhoneFulfillRequestView } from "./PhoneFulfillRequestView";
import { PhoneRequestStreamView } from "./PhoneRequestStreamView";
import { PhoneCreateStreamView } from "./PhoneCreateStreamView";
import { PhoneClaimGiftCardView } from "./PhoneClaimGiftCardView";
import { PhoneExportActivityModal } from "./PhoneExportActivityModal";
import {
  DEMO_NAV_EVENT,
  type DemoNavigate,
} from "@/lib/app-demo-tour";
import type { PhoneAppRoute } from "./types";
import type { GiftCardParams } from "@/lib/giftcard";

type PhoneAppShellProps = {
  route: PhoneAppRoute;
  onNavigate: (route: PhoneAppRoute) => void;
};

// The confidential accept flow (Seal + ZK proof + wallet popup) is long enough
// that an in-memory pending request can be lost to a remount. Persist it so the
// fulfill screen survives the round-trip.
const REQUEST_KEY = "sl_pending_request";

function readStoredRequest(): StreamRequestParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REQUEST_KEY);
    return raw ? (JSON.parse(raw) as StreamRequestParams) : null;
  } catch {
    return null;
  }
}

export function PhoneAppShell({ route, onNavigate }: PhoneAppShellProps) {
  const account = useCurrentAccount();
  const { needsStep } = useNeedsHandleOnboarding();
  const proDemo = useProDemoMode();
  const isPro = route === "pro";
  const isScan = route === "scan";
  const isFulfill = route === "fulfill";
  const isClaimGift = route === "claim-gift";
  const isRequest = route === "request";
  const isCreate = route === "create";
  /** Full-bleed onboarding — hide shell chrome until wallet + name step done. */
  const proOnboarding = isPro && !proDemo && (!account || needsStep);
  const userOnboarding = route === "user" && (!account || needsStep);
  const appOnboarding = proOnboarding || userOnboarding;
  const inWorkspace =
    route !== "launcher" &&
    !isScan &&
    !isFulfill &&
    !isClaimGift &&
    !isRequest &&
    !isCreate &&
    !appOnboarding;
  const [scanReturnRoute, setScanReturnRoute] = useState<PhoneAppRoute>("user");
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingRequest, setPendingRequestState] =
    useState<StreamRequestParams | null>(readStoredRequest);
  const [pendingGift, setPendingGift] = useState<GiftCardParams | null>(null);

  const setPendingRequest = (req: StreamRequestParams | null) => {
    setPendingRequestState(req);
    try {
      if (req) window.sessionStorage.setItem(REQUEST_KEY, JSON.stringify(req));
      else window.sessionStorage.removeItem(REQUEST_KEY);
    } catch {
      /* sessionStorage unavailable — in-memory state still works */
    }
  };

  const openScan = () => {
    setScanReturnRoute(route === "launcher" ? "launcher" : route);
    onNavigate("scan");
  };

  const handleScanResult = (request: StreamRequestParams) => {
    setPendingRequest(request);
    onNavigate("fulfill");
  };

  const handleGiftCard = (gift: GiftCardParams) => {
    setPendingGift(gift);
    onNavigate("claim-gift");
  };

  const clearRequest = () => {
    setPendingRequest(null);
    onNavigate("user");
  };

  const clearGift = () => {
    setPendingGift(null);
    onNavigate("user");
  };

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<DemoNavigate>).detail;
      if (!detail || detail.kind !== "phone") return;
      onNavigate(detail.route);
    };
    window.addEventListener(DEMO_NAV_EVENT, onNav);
    return () => window.removeEventListener(DEMO_NAV_EVENT, onNav);
  }, [onNavigate]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between" data-demo="wallet">
        {isScan ? (
          <button
            type="button"
            onClick={() => onNavigate(scanReturnRoute)}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back"
          >
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              Scan
            </span>
          </button>
        ) : isFulfill ? (
          <button
            type="button"
            onClick={clearRequest}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back"
          >
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              Review
            </span>
          </button>
        ) : isClaimGift ? (
          <button
            type="button"
            onClick={clearGift}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back"
          >
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              Gift card
            </span>
          </button>
        ) : isRequest ? (
          <button
            type="button"
            onClick={() => onNavigate("user")}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back"
          >
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              Request
            </span>
          </button>
        ) : isCreate ? (
          <button
            type="button"
            onClick={() => onNavigate("user")}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back"
          >
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              Create
            </span>
          </button>
        ) : inWorkspace || appOnboarding ? (
          <button
            type="button"
            onClick={() => onNavigate("launcher")}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            aria-label="Back to apps"
          >
            <StreamLineMark size="sm" variant={isPro ? "pro" : "default"} />
            {isPro ? (
              <ProTitleWithDemo compact />
            ) : (
              <span className="truncate text-sm font-bold tracking-tight text-[#111]">
                StreamLine
              </span>
            )}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <StreamLineMark size="sm" variant="default" />
            <span className="truncate text-sm font-bold tracking-tight text-[#111]">
              StreamLine
            </span>
          </div>
        )}
        {appOnboarding && isPro && !account ? (
          <button
            type="button"
            onClick={() => enterProDemoMode()}
            className="shrink-0 text-[11px] font-medium tracking-tight text-white/45 transition-colors hover:text-white/80"
          >
            Explore demo
          </button>
        ) : !appOnboarding && route !== "launcher" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {!isPro &&
              !isScan &&
              !isFulfill &&
              !isClaimGift &&
              !isRequest &&
              !isCreate && (
              <ScanIconButton onClick={openScan} />
            )}
            <WalletButton
              variant="profile"
              showFaucetInMenu
              faucetAmount={isPro ? 10000 : 1000}
              profilePro={isPro}
              connectModal={isPro ? "pro" : "default"}
              containedModal
              onExportActivity={
                !isPro ? () => setExportOpen(true) : undefined
              }
              onExitDemo={
                isPro && proDemo && !account
                  ? () => exitProDemoMode()
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>

      <div
        className={`relative flex min-h-0 flex-1 flex-col ${
          appOnboarding
            ? "mt-1.5 overflow-hidden isolate"
            : isPro
              ? "mt-1.5 overflow-hidden"
              : "mt-2"
        }`}
      >
        {route === "launcher" && <PhoneLauncher onOpen={onNavigate} />}
        {route === "user" && (
          <PhoneUserApp onNavigate={onNavigate} />
        )}
        {route === "pro" && <PhoneProApp />}
        {route === "scan" && (
          <PhoneScanView
            onResult={handleScanResult}
            onGiftCard={handleGiftCard}
            onCancel={() => onNavigate(scanReturnRoute)}
          />
        )}
        {route === "fulfill" && pendingRequest && (
          <PhoneFulfillRequestView
            request={pendingRequest}
            onAccepted={clearRequest}
            onDecline={clearRequest}
          />
        )}
        {route === "claim-gift" && pendingGift && (
          <PhoneClaimGiftCardView gift={pendingGift} onDone={clearGift} />
        )}
        {route === "claim-gift" && !pendingGift && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[12px] leading-snug text-[#666]">
              No gift card loaded.
            </p>
            <button
              type="button"
              onClick={openScan}
              className="w-full max-w-[220px] rounded-2xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            >
              Scan a gift card
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user")}
              className="w-full max-w-[220px] rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              Back to wallet
            </button>
          </div>
        )}
        {route === "request" && (
          <PhoneRequestStreamView onClose={() => onNavigate("user")} />
        )}
        {route === "create" && (
          <PhoneCreateStreamView onClose={() => onNavigate("user")} />
        )}
        {route === "fulfill" && !pendingRequest && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[12px] leading-snug text-[#666]">
              No request loaded — it may have already been funded.
            </p>
            <button
              type="button"
              onClick={openScan}
              className="w-full max-w-[220px] rounded-2xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            >
              Scan a request
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user")}
              className="w-full max-w-[220px] rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              Back to wallet
            </button>
          </div>
        )}
      </div>
      <PhoneExportActivityModal
        open={exportOpen && !isPro}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
