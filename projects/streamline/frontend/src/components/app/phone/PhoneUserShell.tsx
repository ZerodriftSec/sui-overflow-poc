"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { PhoneHomeView } from "./PhoneHomeView";
import { PhoneTransferModal } from "./PhoneTransferModal";
import { OnramperModal } from "@/components/wallet/OnramperWidget";
import { UserOnboarding } from "./UserOnboarding";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";
import type { PhoneAppRoute } from "./types";

type PhoneUserShellProps = {
  onNavigate: (route: PhoneAppRoute) => void;
};

export function PhoneUserShell({ onNavigate }: PhoneUserShellProps) {
  const account = useCurrentAccount();
  const { needsStep } = useNeedsHandleOnboarding();
  const [showAllStreams, setShowAllStreams] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rampMode, setRampMode] = useState<"buy" | "sell" | null>(null);

  if (!account || needsStep) {
    return <UserOnboarding embedded />;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
      <PhoneHomeView
        showAllStreams={showAllStreams}
        onShowAllStreams={() => setShowAllStreams(true)}
        onBackToHome={() => setShowAllStreams(false)}
        onCreate={() => onNavigate("create")}
        onRequest={() => onNavigate("request")}
        onTransfer={() => setTransferOpen(true)}
        onBuy={() => setRampMode("buy")}
      />
      <PhoneTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
      />
      <OnramperModal
        open={rampMode !== null}
        mode={rampMode ?? "buy"}
        onClose={() => setRampMode(null)}
        contained
      />
    </div>
  );
}
