"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { ConnectModal } from "@/components/wallet/ConnectModal";
import { OnboardingConnectActions } from "@/components/wallet/OnboardingConnectActions";
import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import { OnboardingChooseName } from "@/components/app/OnboardingChooseName";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";
import { useStickyAccount } from "@/lib/use-sticky-account";

type Step = 0 | 1 | 2 | 3;

const HEADLINE = {
  embedded: "text-[clamp(40px,12.5vw,52px)]",
  desktop: "text-[clamp(48px,8vw,72px)]",
} as const;

const HEADLINE_HERO = {
  embedded: "text-[clamp(48px,15vw,64px)]",
  desktop: "text-[clamp(56px,9.5vw,88px)]",
} as const;

const SPIN_ROWS = 5;
const SPIN_COLS = 12;
/** One shiny accent bar — middle of the grid. */
const SHINY_ROW = 2;
const SHINY_COL = 5;

function colClass(row: number, col: number, extra = "") {
  const shiny = row === SHINY_ROW && col === SHINY_COL ? "sl-user-spin-col--shiny" : "";
  return ["sl-user-spin-col", shiny, extra].filter(Boolean).join(" ");
}

function SpinBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-[-2%] flex h-[52%] items-center justify-center overflow-visible">
        <div className="sl-user-spin-wrap">
          <div className="sl-user-spin">
            {Array.from({ length: SPIN_ROWS }, (_, row) => (
              <div key={row} className={`sl-user-spin-row sl-user-spin-row--${row + 1}`}>
                {Array.from({ length: SPIN_COLS }, (_, col) => (
                  <div
                    key={col}
                    className={colClass(row, col)}
                    style={{ animationDelay: `${col * 0.25}s` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Same grid as spin — bars fall downward in a clean column cascade. */
function FlowBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-[-2%] flex h-[52%] items-center justify-center overflow-hidden">
        <div className="sl-user-spin-wrap">
          <div className="sl-user-spin sl-user-fall">
            {Array.from({ length: SPIN_ROWS }, (_, row) => (
              <div key={row} className={`sl-user-spin-row sl-user-spin-row--${row + 1}`}>
                {Array.from({ length: SPIN_COLS }, (_, col) => (
                  <div
                    key={col}
                    className={colClass(row, col, "sl-user-fall-col")}
                    style={{
                      animationDelay: `${col * 0.12 + row * 0.08}s`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Wormhole zoom — used on connect step. */
const WARP_RAYS = 14;
const WARP_PIECES = 4;
const WARP_ACCENT_RAY = 3;

const NAME_LINES = 8;
const NAME_ACCENT = 3;

function ZoomBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden sl-user-warp-fade-in"
      aria-hidden
    >
      <div className="sl-user-warp">
        {Array.from({ length: WARP_RAYS }, (_, ray) =>
          Array.from({ length: WARP_PIECES }, (_, piece) => (
            <div
              key={`${ray}-${piece}`}
              className={`sl-user-warp-piece${
                ray === WARP_ACCENT_RAY ? " sl-user-warp-piece--accent" : ""
              }`}
              style={
                {
                  "--warp-ang": `${(ray / WARP_RAYS) * 360}deg`,
                  "--warp-start": `${12 + piece * 52}px`,
                  "--warp-travel": "200px",
                  animationDelay: `${((ray * 0.12 + piece * 0.35) % 5.5).toFixed(2)}s`,
                } as CSSProperties
              }
            />
          )),
        )}
      </div>
    </div>
  );
}

/** Choose-name step — horizontal signature lines. */
function NameLinesBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="sl-user-name-lines">
        {Array.from({ length: NAME_LINES }, (_, i) => (
          <div
            key={i}
            className={`sl-user-name-line${
              i === NAME_ACCENT ? " sl-user-name-line--accent" : ""
            }`}
          />
        ))}
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

function BackCircle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-[#111] shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-colors hover:bg-[#f8f8f8] active:scale-95"
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
        className="flex h-12 flex-1 items-center justify-center rounded-full bg-[#111] text-[14px] font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.99]"
      >
        {label}
      </button>
    </div>
  );
}

function MacroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[#f7f8f9]" />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(61,129,227,0.12), transparent 60%), radial-gradient(ellipse 50% 40% at 20% 70%, rgba(61,129,227,0.06), transparent 55%)",
        }}
      />
    </div>
  );
}

function OnboardingFrame({
  shell,
  backdrop,
  actions,
  overlay,
  children,
}: {
  shell: string;
  backdrop: ReactNode;
  actions: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden font-[family-name:var(--font-poppins)] ${shell}`}
      data-sl-cursor="on-light"
    >
      <MacroBackground />
      {backdrop}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-1 pb-2 pt-2 sm:px-2 sm:pb-3 sm:pt-3">
        <div className="flex min-h-0 flex-1 flex-col justify-end">{children}</div>
        {actions ? <div className="mt-7 shrink-0 sm:mt-8">{actions}</div> : null}
      </div>
      {overlay}
    </div>
  );
}

function onboardingShell(embedded: boolean) {
  return embedded
    ? "absolute inset-0 z-30 flex h-full w-full flex-col overflow-hidden isolate"
    : "fixed inset-0 z-[80] flex h-[100dvh] w-full flex-col overflow-hidden";
}

function headlineClass(embedded: boolean) {
  return `font-bold leading-[1.02] tracking-[-0.04em] text-[#111] ${
    embedded ? HEADLINE.embedded : HEADLINE.desktop
  }`;
}

export function UserOnboarding({ embedded = false }: { embedded?: boolean }) {
  const phoneEmbedded = usePhoneEmbedded();
  const isEmbedded = embedded || phoneEmbedded;
  const liveAccount = useCurrentAccount();
  const account = useStickyAccount();
  const { needsStep, showNameStep, checking, complete } =
    useNeedsHandleOnboarding();
  const [step, setStep] = useState<Step>(0);
  const [connectOpen, setConnectOpen] = useState(false);
  const shell = onboardingShell(isEmbedded);

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
        backdrop={<SpinBackdrop />}
        actions={<ActionRow label="Continue" onContinue={() => setStep(1)} />}
      >
        <div className="text-left">
          <h1
            className={`font-bold leading-[1.0] tracking-[-0.045em] text-[#111] ${
              isEmbedded ? HEADLINE_HERO.embedded : HEADLINE_HERO.desktop
            }`}
          >
            <span className="block">Receive.</span>
            <span className="block">Stream.</span>
            <span className="block relative">
              <span className="sl-shiny animate-shiny relative">Earn.</span>
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
        backdrop={<FlowBackdrop />}
        actions={
          <ActionRow
            label="Continue"
            onContinue={() => setStep(liveAccount ? 3 : 2)}
            onBack={() => setStep(0)}
          />
        }
      >
        <div className="text-left">
          <h1 className={`${headlineClass(isEmbedded)} max-w-[12ch]`}>
            Money that moves with the work.
          </h1>
          <p
            className={`mt-4 max-w-sm leading-relaxed text-[#555] ${
              isEmbedded ? "text-[13px]" : "text-[15px]"
            }`}
          >
            Get paid continuously, split to yield, and keep private rails when
            you need them.
          </p>
        </div>
      </OnboardingFrame>
    );
  }

  // Step 3 — choose name (only after login).
  if (step === 3) {
    // Skip / existing handle — parent shell is exiting onboarding; don't flash a wait state.
    if (!needsStep && liveAccount) {
      return null;
    }
    return (
      <OnboardingFrame
        shell={shell}
        backdrop={<NameLinesBackdrop />}
        actions={null}
      >
        {showNameStep && liveAccount ? (
          <OnboardingChooseName
            variant="user"
            embedded={isEmbedded}
            onComplete={complete}
            BackCircle={BackCircle}
          />
        ) : (
          <div className="text-left">
            <h1 className={`${headlineClass(isEmbedded)} max-w-[12ch]`}>
              One moment…
            </h1>
            <p
              className={`mt-4 max-w-sm leading-relaxed text-[#555] ${
                isEmbedded ? "text-[13px]" : "text-[15px]"
              }`}
            >
              Finishing sign-in and checking your StreamLine name.
            </p>
          </div>
        )}
      </OnboardingFrame>
    );
  }

  // Step 2 — login only (no name UI here).
  return (
    <OnboardingFrame
      shell={shell}
      backdrop={<ZoomBackdrop />}
      overlay={
        <ConnectModal
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          variant="default"
          contained
        />
      }
      actions={
        <OnboardingConnectActions
          variant="user"
          onOpenWalletModal={() => setConnectOpen(true)}
        />
      }
    >
      <div className="text-left">
        <h1 className={`${headlineClass(isEmbedded)} max-w-[11ch]`}>
          Open your StreamLine wallet
        </h1>
        <p
          className={`mt-4 max-w-sm leading-relaxed text-[#555] ${
            isEmbedded ? "text-[13px]" : "text-[15px]"
          }`}
        >
          Sign in with Google to get a wallet — no seed phrase, free to start.
        </p>
      </div>
    </OnboardingFrame>
  );
}
