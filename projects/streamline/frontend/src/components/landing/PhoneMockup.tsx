"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { StreamLineMark } from "./StreamLineMark";
import { PhoneAppShell } from "@/components/app/phone/PhoneAppShell";
import { PhoneAppSplash } from "@/components/app/phone/PhoneAppSplash";
import { ScanIconButton } from "@/components/app/phone/PhoneHeaderActions";
import {
  PhoneDashboardView,
  type PhoneActivityItem,
} from "@/components/app/phone/PhoneDashboardView";
import type { PhoneAppRoute } from "@/components/app/phone/types";
import type { PhoneScene, SceneTheme } from "./heroScenes";
import { HowStepsTimeline } from "./HowStepsTimeline";
import { FinancePhonePreview } from "@/components/app/FinanceFlowViz";
import { PrivacyPhonePreview } from "./PrivacyPhonePreview";
import { ProPhonePreview } from "./ProPhonePreview";
import { NamesPhonePreview } from "./NamesPhonePreview";
import { WorkPhonePreview } from "./WorkPhonePreview";
import { ScalePhonePreview } from "./ScalePhonePreview";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";

/** iPhone 15 proportions: 393 × 852 pt → screen aspect 9:19.5 */
const SCREEN_ASPECT = "9 / 19.5";

type PhoneMockupProps = {
  scene: PhoneScene;
  sceneProgress?: number;
  transitioning?: boolean;
  theme?: SceneTheme;
  compact?: boolean;
  phoneApp?: PhoneAppRoute | null;
  onPhoneAppChange?: (route: PhoneAppRoute) => void;
  onCloseApp?: () => void;
  onLaunchApp?: () => void;
};

function PhoneWallpaper() {
  return (
    <div
      className="absolute inset-0 opacity-40"
      style={{
        backgroundImage: `radial-gradient(circle at 70% 30%, rgba(0,0,0,0.08) 0%, transparent 50%),
          radial-gradient(circle at 20% 80%, rgba(0,0,0,0.05) 0%, transparent 40%)`,
      }}
    />
  );
}

/** Full-screen light macro wash for user onboarding (edge-to-edge phone glass). */
function UserOnboardingWallpaper() {
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

function PhoneHeader({
  pro = false,
  trailing,
}: {
  pro?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <StreamLineMark size="sm" variant={pro ? "pro" : "default"} />
        <span
          className={`text-sm font-semibold tracking-tight ${
            pro
              ? "font-[family-name:var(--font-inter)] text-white"
              : "font-bold text-[#111]"
          }`}
        >
          streamline{pro && <span className="text-white/40">.pro</span>}
        </span>
      </div>
      {trailing}
    </div>
  );
}

const DASHBOARD_BASE_EARNED = 142.5;
const DASHBOARD_EARN_PER_SEC = 0.5;

const HERO_DASHBOARD_ACTIVITY: PhoneActivityItem[] = [
  {
    id: "hero-1",
    kind: "stream_dripped",
    title: "Drip received",
    time: "2m ago",
    timestampMs: Date.now() - 120_000,
    amount: "+$0.50",
    amountBase: 500_000,
    subjectId: null,
    counterparty: null,
    txDigest: null,
    module: "stream",
    metaJson: null,
  },
  {
    id: "hero-2",
    kind: "milestone_approved",
    title: "Milestone 3 approved",
    time: "1h ago",
    timestampMs: Date.now() - 3_600_000,
    amount: null,
    amountBase: null,
    subjectId: null,
    counterparty: null,
    txDigest: null,
    module: "stream",
    metaJson: null,
  },
  {
    id: "hero-3",
    kind: "stream_funded",
    title: "Split to yield wallet",
    time: "Yesterday",
    timestampMs: Date.now() - 86_400_000,
    amount: "$42.00",
    amountBase: 42_000_000,
    subjectId: null,
    counterparty: null,
    txDigest: null,
    module: "stream",
    metaJson: null,
  },
];

function DashboardScreen() {
  const [earned, setEarned] = useState(DASHBOARD_BASE_EARNED);

  useEffect(() => {
    const id = window.setInterval(() => {
      setEarned((prev) => prev + DASHBOARD_EARN_PER_SEC);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatted = earned.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="mt-1">
      <PhoneDashboardView
        heroPreview
        topStats={[
          { label: "Drip/min", value: "$0.50", live: true },
          { label: "Streams", value: "3" },
        ]}
        cards={[
          {
            id: "demo-macro",
            label: "Total balance",
            amount: formatted,
          },
          { id: "demo-work", label: "Work stream", amount: "$90.00", subtitle: "Active stream" },
          {
            id: "demo-private",
            label: "Private stream",
            amount: "$52.50",
            subtitle: "Stream details",
          },
        ]}
        activity={HERO_DASHBOARD_ACTIVITY}
      />
    </div>
  );
}

function DripScreen({ progress }: { progress: number }) {
  const amount = (142.5 + progress * 12.3).toFixed(2);
  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col items-center justify-center text-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-black/10" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-black/25 bg-white/80 backdrop-blur-md">
          <span className="text-2xl">↓</span>
        </div>
      </div>
      <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-black/50">
        Incoming drip
      </p>
      <p className="mt-2 text-[2rem] font-bold tabular leading-none text-[#111]">
        +${amount}
      </p>
      <p className="mt-3 max-w-[200px] text-xs font-medium leading-snug text-[#555]">
        In your wallet. No invoice. No gas. No claim button.
      </p>
    </div>
  );
}

function StatesScreen({ progress }: { progress: number }) {
  return (
    <div className="mt-1 flex min-h-0 flex-1 flex-col">
      <HowStepsTimeline progress={progress} embedded />
    </div>
  );
}

function StatsScreen() {
  const stats = [
    { v: "$0.00", l: "transfer fee" },
    { v: "~90s", l: "drip interval" },
    { v: "48h", l: "auto-approve" },
    { v: "Private", l: "by default" },
  ];
  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#888]">
        The numbers
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div
            key={s.l}
            className="rounded-xl border border-white/50 bg-white/70 p-3.5 backdrop-blur-md"
          >
            <p className="text-base font-bold leading-tight text-[#111]">{s.v}</p>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-[#888]">
              {s.l}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-[#111] px-3.5 py-3">
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/50">
          No wallet needed
        </p>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-white/80">
          Sign in with Google via zkLogin — free to start
        </p>
      </div>
      <p className="mt-auto pt-4 text-xl font-bold leading-tight text-[#111]">
        Free. Gasless. Private.
      </p>
    </div>
  );
}

function FinanceScreen({ progress }: { progress: number }) {
  return (
    <div className="mt-1 flex min-h-0 flex-1 flex-col">
      <FinancePhonePreview progress={progress} />
    </div>
  );
}

function PrivacyScreen({ progress }: { progress: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <PrivacyPhonePreview progress={progress} />
    </div>
  );
}

function ProScreen({ progress }: { progress: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProPhonePreview progress={progress} />
    </div>
  );
}

function ProWallpaper() {
  return (
    <div className="absolute inset-0 bg-[#111]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.06),transparent_50%)]" />
    </div>
  );
}

function LaunchScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
      <h2
        className={`font-bold tracking-[-0.045em] text-[#111] ${
          compact
            ? "text-[2.45rem] leading-[0.95]"
            : "text-[clamp(2.75rem,5.8vw,3.65rem)] leading-[0.92]"
        }`}
      >
        Money Streams
        <br />
        {" "}
        <span className="sl-shiny animate-shiny">Coming Soon</span>
      </h2>
    </div>
  );
}

function PhoneScreenContent({
  scene,
  sceneProgress,
  onLaunchApp,
  compact = false,
}: {
  scene: PhoneScene;
  sceneProgress: number;
  onLaunchApp?: () => void;
  compact?: boolean;
}) {
  switch (scene) {
    case "dashboard":
      return <DashboardScreen />;
    case "drip":
      return <DripScreen progress={sceneProgress} />;
    case "states":
      return <StatesScreen progress={sceneProgress} />;
    case "stats":
      return <StatsScreen />;
    case "finance":
      return <FinanceScreen progress={sceneProgress} />;
    case "privacy":
      return <PrivacyScreen progress={sceneProgress} />;
    case "pro":
      return <ProScreen progress={sceneProgress} />;
    case "names":
      return <NamesScreen progress={sceneProgress} />;
    case "work":
      return <WorkScreen progress={sceneProgress} />;
    case "scale":
      return <ScaleScreen progress={sceneProgress} />;
    case "launch":
      return <LaunchScreen compact={compact} />;
  }
}

function NamesScreen({ progress }: { progress: number }) {
  return (
    <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-hidden">
      <NamesPhonePreview progress={progress} />
    </div>
  );
}

function WorkScreen({ progress }: { progress: number }) {
  return (
    <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-hidden">
      <WorkPhonePreview progress={progress} />
    </div>
  );
}

function ScaleScreen({ progress }: { progress: number }) {
  return (
    <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-hidden">
      <ScalePhonePreview progress={progress} />
    </div>
  );
}

export function PhoneMockup({
  scene,
  sceneProgress = 0,
  transitioning = false,
  theme = "light",
  compact = false,
  phoneApp = null,
  onPhoneAppChange,
  onCloseApp,
  onLaunchApp,
}: PhoneMockupProps) {
  const account = useCurrentAccount();
  const { needsStep } = useNeedsHandleOnboarding();
  const inApp = phoneApp !== null;
  const isLaunchScene = scene === "launch" && !inApp;
  const isPro =
    phoneApp === "pro" || (!inApp && (theme === "pro" || scene === "pro"));
  const useDarkGlass = isPro;
  /** Edge-to-edge onboarding inside the phone glass. */
  const proOnboarding = phoneApp === "pro" && (!account || needsStep);
  const userOnboarding = phoneApp === "user" && (!account || needsStep);
  const appOnboarding = proOnboarding || userOnboarding;

  /**
   * iOS-style icon splash when leaving the launcher into an app.
   * Detect the transition during render (not in an effect) so the splash
   * covers the first paint — an effect would flash onboarding for a frame.
   */
  const [trackedApp, setTrackedApp] = useState(phoneApp);
  const [launchSplash, setLaunchSplash] = useState<"user" | "pro" | null>(null);
  const [splashFading, setSplashFading] = useState(false);

  if (phoneApp !== trackedApp) {
    const prev = trackedApp;
    setTrackedApp(phoneApp);
    if (prev === "launcher" && (phoneApp === "user" || phoneApp === "pro")) {
      setLaunchSplash(phoneApp);
      setSplashFading(false);
    } else if (phoneApp === "launcher" || phoneApp === null) {
      setLaunchSplash(null);
      setSplashFading(false);
    }
  }

  useEffect(() => {
    if (launchSplash === null) return;

    const fadeAt = window.setTimeout(() => setSplashFading(true), 920);
    const clearAt = window.setTimeout(() => {
      setLaunchSplash(null);
      setSplashFading(false);
    }, 920 + 480);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(clearAt);
    };
  }, [launchSplash]);

  const shell = (
    <>
        <div
          className={`sl-levitate-glow absolute inset-x-4 top-6 bottom-6 rounded-[3.25rem] blur-3xl transition-colors duration-700 ${
            useDarkGlass ? "bg-white/8" : "bg-black/8"
          }`}
        />

        <div
          className={`relative rounded-[3rem] p-[11px] transition-colors duration-700 ${
            useDarkGlass
              ? "phone-chassis-dark liquid-glass liquid-glass-dark"
              : "phone-chassis-light liquid-glass liquid-glass-light"
          }`}
        >
        <div
          className={`absolute left-1/2 top-[18px] z-20 flex h-[26px] w-[96px] -translate-x-1/2 items-center justify-center gap-2.5 rounded-full ${
            useDarkGlass ? "liquid-glass-notch" : "liquid-glass-notch-light"
          }`}
        >
          <span
            className={`h-[7px] w-[7px] rounded-full ${
              useDarkGlass
                ? "bg-black/70 ring-1 ring-white/25"
                : "bg-black/50 ring-1 ring-black/10"
            }`}
            aria-hidden
          />
          <span
            className={`h-2 w-2 rounded-full ${
              useDarkGlass ? "bg-white/15" : "bg-black/8"
            }`}
            aria-hidden
          />
        </div>

        <div
          className={`relative w-full overflow-hidden rounded-[2.4rem] transition-colors duration-700 ${
            proOnboarding
              ? "bg-[#050505]"
              : userOnboarding
                ? "bg-[#f7f8f9]"
                : useDarkGlass
                  ? "bg-[#111]"
                  : "bg-white"
          }`}
          style={{ aspectRatio: SCREEN_ASPECT }}
        >
          {userOnboarding ? (
            <UserOnboardingWallpaper />
          ) : !appOnboarding ? (
            useDarkGlass ? (
              <ProWallpaper />
            ) : (
              <PhoneWallpaper />
            )
          ) : null}

          {launchSplash ? (
            <PhoneAppSplash app={launchSplash} fading={splashFading} />
          ) : null}

          <div
            data-sl-phone-stage
            className={`absolute inset-0 z-10 flex flex-col transition-all duration-[420ms] ease-out ${
              appOnboarding || inApp
                ? "min-h-0 overflow-hidden px-4 pb-5 pt-12"
                : "px-6 pb-8"
            } ${
              appOnboarding
                ? ""
                : isLaunchScene
                  ? "justify-center pt-12"
                  : inApp
                    ? ""
                    : "pt-14"
            } ${
              transitioning && !inApp
                ? "scale-[0.97] opacity-0"
                : launchSplash && !splashFading
                  ? "opacity-0 duration-0"
                  : "opacity-100"
            } ${launchSplash && splashFading ? "duration-500" : ""}`}
          >
            {inApp && phoneApp && onPhoneAppChange ? (
              <PhoneAppShell
                route={phoneApp}
                onNavigate={onPhoneAppChange}
              />
            ) : (
              <>
                {!isLaunchScene && (
                  <PhoneHeader
                    pro={useDarkGlass}
                    trailing={
                      scene === "dashboard" && !inApp ? (
                        <ScanIconButton pro={useDarkGlass} />
                      ) : undefined
                    }
                  />
                )}
                <div
                  className={`flex min-h-0 flex-col ${
                    scene === "states" || scene === "finance" || scene === "privacy" || scene === "pro" || scene === "names" || scene === "work" || scene === "scale"
                      ? "flex-1"
                      : ""
                  }`}
                >
                  <PhoneScreenContent
                    scene={scene}
                    sceneProgress={sceneProgress}
                    onLaunchApp={onLaunchApp}
                    compact={compact}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        </div>
    </>
  );

  return (
    <div
      className={`relative mx-auto shrink-0 transition-all duration-700 ${
        compact
          ? inApp
            ? "w-[min(78vw,300px,calc((100dvh-7.5rem)*9/19.5))]"
            : "w-[min(72vw,260px,calc((100dvh-11rem)*9/19.5))]"
          : inApp
            ? "w-[min(92vw,360px,calc((100dvh-7.5rem)*9/19.5))] sm:w-[min(400px,calc((100dvh-7.5rem)*9/19.5))] lg:w-[min(440px,calc((100dvh-7.5rem)*9/19.5))]"
            : "w-[min(88vw,300px,calc((100dvh-9rem)*9/19.5))] sm:w-[min(320px,calc((100dvh-9rem)*9/19.5))] lg:w-[min(340px,calc((100dvh-9rem)*9/19.5))]"
      }`}
    >
      <div className="sl-levitate relative">{shell}</div>
    </div>
  );
}
