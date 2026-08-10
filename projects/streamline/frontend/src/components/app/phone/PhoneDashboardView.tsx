"use client";

import type { ReactNode } from "react";

import type { UserActivityItem } from "@/lib/user-activity";
import { useSuiClientContext } from "@mysten/dapp-kit";
import { isOnrampUiAvailable } from "@/components/wallet/OnramperWidget";

const SECTION_GAP = "mb-5";

export const PHONE_QUICK_ACTIONS = [
  {
    id: "request",
    label: "Request",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    ),
  },
  {
    id: "create",
    label: "Create",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    ),
  },
  {
    id: "transfer",
    label: "Transfer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </svg>
    ),
  },
  {
    // On-ramp (fiat → USDC). Only shown when Onramper is configured.
    // Off-ramp lives under Transfer → Bank (no separate Cash out tile).
    id: "buy",
    label: "Buy",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
] as const;

export type PhoneActivityItem = UserActivityItem;

export type StreamCardData = {
  id: string;
  label: string;
  amount?: string;
  subtitle?: string;
  meta?: string;
  isLive?: boolean;
  /** Dripping pay stream (outgoing) — live outflow styling */
  liveOutgoing?: boolean;
  /** Amount ticks down (remaining / net outflow) vs up */
  amountDecreasing?: boolean;
  empty?: boolean;
};

export type PhoneTopStat = {
  label: string;
  value: string;
  /** Net positive drip rate */
  live?: boolean;
  /** Net negative drip rate */
  negative?: boolean;
};

type PhoneDashboardViewProps = {
  cards: StreamCardData[];
  activeCardIndex?: number;
  topStats?: readonly PhoneTopStat[];
  activity: readonly PhoneActivityItem[];
  activityLoading?: boolean;
  /** Landing hero phone only — macro layout + subtitle under balance amount. */
  heroPreview?: boolean;
  onQuickAction?: (id: string) => void;
  onActivityClick?: (item: PhoneActivityItem) => void;
  onShiftCards?: () => void;
  onPrimaryCardClick?: () => void;
  onPrimaryCardDetails?: () => void;
  trailing?: ReactNode;
};

function isBalanceCard(card: StreamCardData) {
  return card.id === "macro" || card.id === "demo-macro";
}

const CARD_MIN_H = "min-h-[9.5rem]";
/** Glass surface only — outer lift lives on SoftLift (backdrop-blur clips box-shadow). */
const CARD_FACE =
  "relative rounded-[1.25rem] border border-white/60 bg-gradient-to-br from-white/78 via-white/52 to-white/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl";

/** Insets relative to the card stack frame. */
const BACK_OFFSETS = [
  { inset: "mx-4", top: 8, tone: "border-white/30 bg-white/22" },
  { inset: "mx-1.5", top: 28, tone: "border-white/40 bg-white/36" },
] as const;

/**
 * Ambient depth behind glass. Blurred layers sit slightly inset so the soft edge
 * fades inside the phone stage instead of being hard-clipped by overflow.
 */
function SoftLift({
  children,
  className = "",
  tone = "card",
}: {
  children: ReactNode;
  className?: string;
  tone?: "card" | "action" | "panel";
}) {
  const glow =
    tone === "action"
      ? "left-[14%] right-[14%] top-[42%] bottom-[2%] rounded-[0.85rem] bg-black/[0.09] blur-[8px]"
      : tone === "panel"
        ? "left-[8%] right-[8%] top-[48%] bottom-[0%] rounded-[1.15rem] bg-black/[0.09] blur-[12px]"
        : "left-[7%] right-[7%] top-[22%] bottom-[2%] rounded-[1.5rem] bg-black/[0.1] blur-[14px]";
  const wash =
    tone === "action"
      ? "left-[28%] right-[28%] top-[68%] bottom-[4%] rounded-full bg-black/[0.04] blur-[8px]"
      : tone === "panel"
        ? "left-[22%] right-[22%] top-[70%] bottom-[-2%] rounded-full bg-black/[0.05] blur-[14px]"
        : "left-[20%] right-[20%] top-[58%] bottom-[4%] rounded-full bg-black/[0.045] blur-[14px]";

  return (
    <div className={`relative isolate ${className}`}>
      <div aria-hidden className={`pointer-events-none absolute -z-10 ${glow}`} />
      <div aria-hidden className={`pointer-events-none absolute -z-10 ${wash}`} />
      {children}
    </div>
  );
}

function StreamCardFace({
  card,
  belowStats = [],
  className = "",
  primary = false,
  amountLive = false,
  liveOutgoing = false,
  amountDecreasing = false,
  macroSubtitle = false,
  onDetails,
}: {
  card: StreamCardData;
  belowStats?: readonly PhoneTopStat[];
  className?: string;
  /** Front / active card — same size and type scale as total balance */
  primary?: boolean;
  amountLive?: boolean;
  liveOutgoing?: boolean;
  amountDecreasing?: boolean;
  macroSubtitle?: boolean;
  onDetails?: () => void;
}) {
  const isBalance = card.id === "macro" || card.id === "demo-macro";
  const isStream = !isBalance && !card.empty;
  const liveUp = amountLive && !amountDecreasing && !isBalance;
  const liveDown = amountLive && amountDecreasing && !isBalance;
  const showFooter = primary && (belowStats.length > 0 || (isStream && card.meta) || macroSubtitle);

  return (
    <div
      className={`${CARD_FACE} p-5 ${
        primary ? `${CARD_MIN_H} flex flex-col` : ""
      } ${className}`}
    >
      <div className={`min-w-0 ${primary ? "flex flex-1 flex-col" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                card.empty ? "text-[#bbb]" : "text-[#7a7a7a]"
              }`}
            >
              {card.label}
            </p>
            {isStream && card.subtitle && !amountLive && !primary && (
              <p
                className={`mt-1 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                  liveDown || liveOutgoing
                    ? "text-[#c0533a]"
                    : liveUp
                      ? "text-[#1d9e75]"
                      : "text-[#666]"
                }`}
              >
                {amountLive && (
                  <span
                    className={`h-1.5 w-1.5 animate-pulse rounded-full ${
                      liveDown || liveOutgoing ? "bg-[#c0533a]" : "bg-[#1d9e75]"
                    }`}
                    aria-hidden
                  />
                )}
                {card.subtitle}
              </p>
            )}
          </div>
          {!!onDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDetails();
              }}
              className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#666]"
            >
              Details
            </button>
          )}
        </div>
        <p
          className={`mt-4 font-bold tabular-nums leading-none tracking-tight transition-[color] duration-300 ${
            primary ? "text-[2.05rem]" : "text-[1.45rem]"
          } ${
            card.empty
              ? "text-[#ccc]"
              : liveDown
                ? "text-[#9a3b28]"
                : liveUp
                  ? "text-[#1a5c38]"
                  : "text-[#111]"
          }`}
        >
          {card.amount ?? "$0.00"}
        </p>
        {primary && (
          <div className={`mt-auto pt-4 ${showFooter ? "" : "min-h-[1.35rem]"}`}>
            {belowStats.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                {belowStats.map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-1.5">
                    <span className="text-[7px] uppercase tracking-[0.14em] text-[#8a8a8a]">
                      {stat.label}
                    </span>
                    <span
                      className={`text-[10px] font-semibold tabular-nums ${
                        stat.negative
                          ? "text-[#9a3b28]"
                          : stat.live
                            ? "text-[#1a5c38]"
                            : "text-[#111]"
                      }`}
                    >
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {macroSubtitle && card.subtitle && (
              <p className="text-[10px] font-medium leading-snug text-[#555]">
                {card.subtitle}
              </p>
            )}
            {isStream && card.meta && belowStats.length === 0 && (
              <p className="text-[9px] font-medium leading-snug tracking-wide text-[#888]">
                {card.meta}
              </p>
            )}
          </div>
        )}
        {!primary && isStream && card.meta && (
          <p className="mt-2 text-[9px] font-medium tracking-wide text-[#888]">
            {card.meta}
          </p>
        )}
      </div>
    </div>
  );
}

function StackCardPeek({ card }: { card: StreamCardData }) {
  if (card.empty) return null;
  const isLive = !!card.isLive;
  const decreasing = !!card.amountDecreasing || !!card.liveOutgoing;
  return (
  <>
    <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#666]/80">
      {card.label}
    </p>
    {card.amount && (
      <p
        className={`mt-1 text-[13px] font-bold tabular-nums leading-none ${
          isLive
            ? decreasing
              ? "text-[#c0533a]/70"
              : "text-[#1d9e75]/70"
            : "text-[#111]/45"
        }`}
      >
        {card.amount}
      </p>
    )}
  </>
  );
}

export function PhoneDashboardView({
  cards,
  activeCardIndex = 0,
  topStats = [],
  activity,
  activityLoading = false,
  heroPreview = false,
  onQuickAction,
  onActivityClick,
  onShiftCards,
  onPrimaryCardClick,
  onPrimaryCardDetails,
  trailing,
}: PhoneDashboardViewProps) {
  const { network } = useSuiClientContext();
  const showBuy = isOnrampUiAvailable(network);
  const normalizedCards = cards.length
    ? cards
    : [{ id: "macro-empty", label: "Total balance", amount: "$0.00", subtitle: "" }];
  const n = normalizedCards.length;
  const active = ((activeCardIndex % n) + n) % n;
  const mainCard = normalizedCards[active];
  const peekNext = n > 1 ? normalizedCards[(active + 1) % n] : null;
  const decorativeCard: StreamCardData = {
    id: "decorative",
    label: "",
    empty: true,
  };
  const layers = BACK_OFFSETS.map((layer, i) => ({
    ...layer,
    card: i === 1 && peekNext ? peekNext : decorativeCard,
    clickable: i === 1 && n > 1,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-visible">
      <div className={`relative z-20 mt-2 shrink-0 overflow-visible pb-6 ${SECTION_GAP}`}>
        {layers.map((layer, i) => {
          const inner = (
            <SoftLift>
              <div
                className={`flex ${CARD_MIN_H} flex-col justify-start rounded-[1.25rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl ${layer.tone}`}
              >
                <StackCardPeek card={layer.card} />
              </div>
            </SoftLift>
          );
          return layer.clickable ? (
            <button
              key={`back-${i}-${layer.card.id}`}
              type="button"
              onClick={() => onShiftCards?.()}
              className={`absolute inset-x-3 ${layer.inset} text-left transition-transform active:scale-[0.99]`}
              style={{ top: `${layer.top}px`, zIndex: i + 1 }}
            >
              {inner}
            </button>
          ) : (
            <div
              key={`back-${i}-decorative`}
              className={`pointer-events-none absolute inset-x-3 ${layer.inset}`}
              style={{ top: `${layer.top}px`, zIndex: i + 1 }}
              aria-hidden
            >
              {inner}
            </div>
          );
        })}

        <SoftLift className="relative z-30 mx-3 mt-[64px]">
          <div
            role="button"
            tabIndex={0}
            onClick={onPrimaryCardClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPrimaryCardClick?.();
              }
            }}
            className="block cursor-pointer text-left"
          >
            <StreamCardFace
              primary
              macroSubtitle={heroPreview && isBalanceCard(mainCard)}
              amountLive={!isBalanceCard(mainCard) && !!mainCard.isLive}
              liveOutgoing={!isBalanceCard(mainCard) && !!mainCard.liveOutgoing}
              amountDecreasing={!isBalanceCard(mainCard) && !!mainCard.amountDecreasing}
              onDetails={onPrimaryCardDetails}
              belowStats={isBalanceCard(mainCard) ? topStats : []}
              card={mainCard}
            />
          </div>
        </SoftLift>
      </div>

      <div
        className={`relative z-10 mt-0.5 grid shrink-0 grid-cols-4 gap-1.5 px-0.5 ${SECTION_GAP}`}
        data-demo="home-quick"
      >
        {PHONE_QUICK_ACTIONS.filter(
          (a) => a.id !== "buy" || showBuy
        ).map((action) => (
          <SoftLift key={action.id} tone="action">
            <button
              type="button"
              data-demo-action={action.id}
              onClick={() => onQuickAction?.(action.id)}
              className="relative flex w-full flex-col items-center justify-center gap-1 rounded-[0.85rem] border border-white/60 bg-gradient-to-b from-white/78 to-white/42 px-1 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:from-white/92 hover:to-white/60 hover:border-white/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_14px_rgba(0,0,0,0.08)] active:translate-y-0 active:scale-[0.97] active:from-white/70 active:to-white/40"
            >
              <span className="flex h-6 w-6 items-center justify-center text-[#111]">
                {action.icon}
              </span>
              <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-[#222]">
                {action.label}
              </span>
            </button>
          </SoftLift>
        ))}
      </div>

      <div className="sl-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
      <SoftLift tone="panel">
      <div className="relative overflow-hidden rounded-xl border border-white/55 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-md">
        <p className="border-b border-black/6 px-3 py-2 text-[8px] font-semibold uppercase tracking-wider text-[#888]">
          Activity
        </p>
        <div className="divide-y divide-black/5">
          {activityLoading ? (
            <p className="px-3 py-3 text-[10px] text-[#999]">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="px-3 py-3 text-[10px] text-[#999]">No activity yet</p>
          ) : (
            activity.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onActivityClick?.(item)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.05]"
              >
              <div className="min-w-0">
                <p className="truncate text-[10px] font-medium text-[#111]">
                  {item.title}
                </p>
                <p className="text-[8px] text-[#999]">{item.time}</p>
              </div>
              {item.amount && (
                <p className="shrink-0 text-[10px] font-semibold tabular-nums text-[#111]">
                  {item.amount}
                </p>
              )}
            </button>
            ))
          )}
        </div>
      </div>
      </SoftLift>

      {trailing}
      </div>
    </div>
  );
}
