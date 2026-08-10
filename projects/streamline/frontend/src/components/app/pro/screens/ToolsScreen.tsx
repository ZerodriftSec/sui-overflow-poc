"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import { requestProAction } from "../pro-actions";
import { InvoicesScreen } from "./InvoicesScreen";
import { PosScreen } from "./PosScreen";
import { SubscriptionsScreen } from "./SubscriptionsScreen";
import { ProEyebrow } from "../ui";

type ToolPanel = "hub" | "pos" | "invoices" | "subscriptions";

export function ToolsScreen() {
  const embedded = usePhoneEmbedded();
  const router = useRouter();
  const [panel, setPanel] = useState<ToolPanel>("hub");

  const openCompliance = () => {
    if (embedded) requestProAction("compliance");
    else router.push("/app/pro/reports");
  };

  if (panel === "pos") {
    return (
      <ToolSubpanel onBack={() => setPanel("hub")}>
        <PosScreen />
      </ToolSubpanel>
    );
  }

  if (panel === "invoices") {
    return (
      <ToolSubpanel onBack={() => setPanel("hub")}>
        <InvoicesScreen />
      </ToolSubpanel>
    );
  }

  if (panel === "subscriptions") {
    return (
      <ToolSubpanel onBack={() => setPanel("hub")}>
        <SubscriptionsScreen />
      </ToolSubpanel>
    );
  }

  const shell = embedded
    ? "flex flex-col gap-2.5 px-0.5 pb-1 pt-0.5"
    : "mx-auto max-w-lg space-y-5";

  return (
    <div className={shell} data-demo="pro-tools-hub">
      {!embedded ? (
        <div>
          <ProEyebrow>Tools</ProEyebrow>
          <h1 className="mt-2 text-[clamp(26px,3.5vw,36px)] font-semibold tracking-tight text-white">
            Extras
          </h1>
          <p className="mt-1 text-[13px] text-white/45">
            Optional surfaces beside payroll — POS, invoices, and more.
          </p>
        </div>
      ) : (
        <div className="px-0.5 pb-0.5">
          <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-white/40">
            Tools
          </p>
          <p className="mt-1 text-[15px] font-semibold tracking-tight text-white">
            Extras
          </p>
          <p className="mt-0.5 text-[10px] text-white/40">
            Beyond payroll
          </p>
        </div>
      )}

      <div className={`grid ${embedded ? "gap-2" : "gap-3"}`}>
        <ToolCard
          embedded={embedded}
          title="POS"
          description="Payment QR codes — create, track uses and accumulated USDC."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="4"
                y="5"
                width="16"
                height="14"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M8 9h8M8 12.5h5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="16.5" cy="15.5" r="1.4" fill="currentColor" />
            </svg>
          }
          onClick={() => setPanel("pos")}
        />

        <ToolCard
          embedded={embedded}
          title="Invoices"
          description="Bill customers in USDC — share a link or QR, settle on-chain."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-3-1.5-3 1.5-3-1.5-3 1.5V5A1.5 1.5 0 0 1 7 3.5z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M9 8h6M9 11.5h6M9 15h3.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          }
          onClick={() => setPanel("invoices")}
        />

        <ToolCard
          embedded={embedded}
          title="Subscriptions"
          description="Customer-funded drip streams for retainers and plans."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 7h16M4 12h16M4 17h10"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="18" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          onClick={() => setPanel("subscriptions")}
        />

        <ToolCard
          embedded={embedded}
          title="Compliance"
          description="Reports, audit timeline, and auditor disclosure."
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 2v6h6M8 13h8M8 17h5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          onClick={openCompliance}
        />
      </div>
    </div>
  );
}

function ToolSubpanel({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-demo="pro-tools-subpanel">
      <button
        type="button"
        onClick={onBack}
        data-demo-action="pro-tools-back"
        className="self-start px-0.5 text-[11px] text-white/40 transition-colors hover:text-white/70"
        aria-label="Back"
      >
        ←
      </button>
      {children}
    </div>
  );
}

function ToolCard({
  embedded,
  title,
  description,
  icon,
  onClick,
}: {
  embedded: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-demo-action={
        title === "POS"
          ? "pro-tools-pos"
          : title === "Invoices"
            ? "pro-tools-invoices"
            : undefined
      }
      className={`sl-pro-tool-card ${
        embedded ? "px-3.5 py-3.5" : "px-5 py-5"
      }`}
    >
      <div className="relative z-[1] flex items-start gap-3">
        <span className="sl-pro-tool-card__icon">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold tracking-tight text-white">
              {title}
            </p>
            <span className="text-[12px] text-white/35">›</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-white/50">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}
