"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { ConnectModal } from "@/components/wallet/ConnectModal";
import { OnboardingConnectActions } from "@/components/wallet/OnboardingConnectActions";
import { OnboardingChooseName } from "@/components/app/OnboardingChooseName";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";
import { useStickyAccount } from "@/lib/use-sticky-account";
import { enterProDemoMode } from "@/lib/pro-demo-mode";

type Step = 0 | 1 | 2 | 3;

const HEADLINE = {
  embedded: "text-[clamp(40px,12.5vw,52px)]",
  desktop: "text-[clamp(48px,8vw,72px)]",
} as const;

const HEADLINE_HERO = {
  embedded: "text-[clamp(48px,15vw,64px)]",
  desktop: "text-[clamp(56px,9.5vw,88px)]",
} as const;

const WAVE_BARS = 20;

type WaveVariant = "single" | "multi" | "scale" | "ripple";

function WaveBackdrop({ variant = "single" }: { variant?: WaveVariant }) {
  const gridMod =
    variant === "multi"
      ? "sl-pro-wave-grid--multi"
      : variant === "scale"
        ? "sl-pro-wave-grid--scale"
        : variant === "ripple"
          ? "sl-pro-wave-grid--ripple"
          : "";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#050505]" />
      <div className="absolute inset-x-0 top-[2%] h-[48%] overflow-hidden pt-5 sm:top-[2.5%] sm:pt-6">
        <div className={`sl-pro-wave-grid h-full w-full ${gridMod}`}>
          {Array.from({ length: WAVE_BARS }, (_, i) => (
            <span key={i} className="sl-pro-wave-line" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

function OnboardingFrame({
  shell,
  backdrop,
  actions,
  overlay,
  topRight,
  children,
}: {
  shell: string;
  backdrop: ReactNode;
  actions: ReactNode;
  /** Portaled UI that must fill the phone shell (e.g. connect sheet). */
  overlay?: ReactNode;
  /** Desktop-only corner control (phone uses shell header). */
  topRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden font-[family-name:var(--font-inter)] ${shell}`}
      data-sl-cursor="on-dark"
    >
      {backdrop}
      {topRight ? (
        <div className="absolute right-5 top-[18px] z-20 md:right-6">{topRight}</div>
      ) : null}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-1 pb-2 pt-2 sm:px-2 sm:pb-3 sm:pt-3">
        <div className="flex min-h-0 flex-1 flex-col justify-end">{children}</div>
        {actions ? <div className="mt-7 shrink-0 sm:mt-8">{actions}</div> : null}
      </div>
      {overlay}
    </div>
  );
}

function BackCircle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a] text-white ring-1 ring-white/10 transition-colors hover:bg-[#222] active:scale-95"
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
}

function ActionRow({
  label,
  onContinue,
  onBack,
}: {
  label: string;
  onContinue: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? <BackCircle onClick={onBack} /> : null}
      <button
        type="button"
        onClick={onContinue}
        data-demo-action="onboard-continue"
        className="flex h-12 flex-1 items-center justify-center rounded-full bg-[#1a1a1a] text-[14px] font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-[#222] active:scale-[0.99]"
      >
        {label}
      </button>
    </div>
  );
}

type ProOnboardingProps = {
  /** Phone embed uses tighter spacing; desktop gets more air. */
  embedded?: boolean;
};

function onboardingShell(embedded: boolean) {
  return embedded
    ? "absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden isolate"
    : "fixed inset-0 z-[80] flex h-[100dvh] w-full flex-col overflow-hidden";
}

function headlineClass(embedded: boolean) {
  return `font-semibold leading-[1.02] tracking-[-0.04em] text-white ${
    embedded ? HEADLINE.embedded : HEADLINE.desktop
  }`;
}

export function ProOnboarding({ embedded = false }: ProOnboardingProps) {
  const liveAccount = useCurrentAccount();
  const account = useStickyAccount();
  const { needsStep, showNameStep, checking, complete } =
    useNeedsHandleOnboarding();
  const [step, setStep] = useState<Step>(0);
  const [connectOpen, setConnectOpen] = useState(false);
  const shell = onboardingShell(embedded);

  // Login (2) → Name (3) once the wallet is connected. Never show login twice.
  useEffect(() => {
    if (step === 2 && liveAccount) setStep(3);
  }, [step, liveAccount]);

  useEffect(() => {
    if (step === 3 && !account && !liveAccount) setStep(2);
  }, [step, account, liveAccount]);

  if (step === 0) {
    return (
      <OnboardingFrame
        shell={shell}
        backdrop={<WaveBackdrop variant="single" />}
        actions={<ActionRow label="Continue" onContinue={() => setStep(1)} />}
      >
        <div className="text-left">
          <h1
            className={`font-semibold leading-[1.0] tracking-[-0.045em] text-white ${
              embedded ? HEADLINE_HERO.embedded : HEADLINE_HERO.desktop
            }`}
          >
            <span className="block">Plan.</span>
            <span className="block">Manage.</span>
            <span className="block">Track.</span>
            <span className="relative block">
              <span
                className="absolute inset-0 text-[#fbbf24] opacity-55 blur-lg"
                aria-hidden
              >
                Pay.
              </span>
              <span className="sl-shiny sl-shiny-dark animate-shiny relative">
                Pay.
              </span>
            </span>
          </h1>
        </div>
      </OnboardingFrame>
    );
  }

  if (step === 1) {
    return (
      <OnboardingFrame
        shell={shell}
        backdrop={<WaveBackdrop variant="multi" />}
        actions={
          <ActionRow
            label="Continue"
            onContinue={() => setStep(liveAccount ? 3 : 2)}
            onBack={() => setStep(0)}
          />
        }
      >
        <div className="text-left">
          <h1 className={`${headlineClass(embedded)} max-w-[12ch]`}>
            One console for every payee.
          </h1>
          <p
            className={`mt-4 max-w-sm leading-relaxed text-white/55 ${
              embedded ? "text-[13px]" : "text-[15px]"
            }`}
          >
            Fund once, drip to many. Yield on idle capital. Private rails when
            you need them.
          </p>
        </div>
      </OnboardingFrame>
    );
  }

  if (step === 3) {
    // Skip / existing handle — parent shell is exiting onboarding; don't flash a wait state.
    if (!needsStep && liveAccount) {
      return null;
    }
    return (
      <OnboardingFrame
        shell={shell}
        backdrop={<WaveBackdrop variant="ripple" />}
        actions={null}
      >
        {showNameStep && liveAccount ? (
          <OnboardingChooseName
            variant="pro"
            embedded={embedded}
            onComplete={complete}
            BackCircle={BackCircle}
          />
        ) : (
          <div className="text-left">
            <h1 className={`${headlineClass(embedded)} max-w-[12ch]`}>
              One moment…
            </h1>
            <p
              className={`mt-4 max-w-sm leading-relaxed text-white/55 ${
                embedded ? "text-[13px]" : "text-[15px]"
              }`}
            >
              Finishing sign-in and checking your StreamLine name.
            </p>
          </div>
        )}
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      shell={shell}
      backdrop={<WaveBackdrop variant="scale" />}
      topRight={
        embedded ? undefined : (
          <button
            type="button"
            onClick={() => enterProDemoMode()}
            className="text-[12px] font-medium tracking-tight text-white/45 transition-colors hover:text-white/80"
          >
            Explore demo
          </button>
        )
      }
      overlay={
        <ConnectModal
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          variant="pro"
          contained
        />
      }
      actions={
        <OnboardingConnectActions
          variant="pro"
          onOpenWalletModal={() => setConnectOpen(true)}
        />
      }
    >
      <div className="text-left">
        <h1 className={`${headlineClass(embedded)} max-w-[11ch]`}>
          Open your payroll console
        </h1>
        <p
          className={`mt-4 max-w-sm leading-relaxed text-white/55 ${
            embedded ? "text-[13px]" : "text-[15px]"
          }`}
        >
          Sign in with Google to manage streams, people, and treasury.
        </p>
      </div>
    </OnboardingFrame>
  );
}
