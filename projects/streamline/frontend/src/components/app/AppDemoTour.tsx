"use client";

import { useEffect, useState } from "react";

import {
  DEMO_EVENT,
  DEMO_PUPPET_STATUS,
  isPuppetRunning,
  startPuppet,
  stopPuppet,
  type DemoScenario,
  type DemoTourEvent,
  type PuppetStatus,
} from "@/lib/app-demo-tour";

type AppDemoTourProps = {
  hidden?: boolean;
};

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13l11-6.5L8 5.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

/**
 * Three silent puppet controls above the phone:
 *  ▶₁ request · ▶₂ buy+scan · ▶₃ pro hire
 */
export function AppDemoTour({ hidden = false }: AppDemoTourProps) {
  const [status, setStatus] = useState<PuppetStatus>({
    running: false,
    label: "",
  });

  useEffect(() => {
    const onTour = (e: Event) => {
      const detail = (e as CustomEvent<DemoTourEvent>).detail;
      if (!detail) return;
      if (detail.type === "start") void startPuppet(detail.scenario ?? "request");
      if (detail.type === "stop") stopPuppet();
    };
    const onStatus = (e: Event) => {
      setStatus((e as CustomEvent<PuppetStatus>).detail);
    };
    window.addEventListener(DEMO_EVENT, onTour);
    window.addEventListener(DEMO_PUPPET_STATUS, onStatus);
    return () => {
      window.removeEventListener(DEMO_EVENT, onTour);
      window.removeEventListener(DEMO_PUPPET_STATUS, onStatus);
    };
  }, []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("demo");
      if (q === "play" || q === "request") {
        const t = window.setTimeout(() => void startPuppet("request"), 500);
        return () => window.clearTimeout(t);
      }
      if (q === "scan") {
        const t = window.setTimeout(() => void startPuppet("scan"), 500);
        return () => window.clearTimeout(t);
      }
      if (q === "pro") {
        const t = window.setTimeout(() => void startPuppet("pro"), 500);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (hidden) return null;

  const running = status.running || isPuppetRunning();

  const play = (scenario: DemoScenario) => {
    if (running) stopPuppet();
    else void startPuppet(scenario);
  };

  return (
    <div className="mb-3 flex items-center justify-center gap-3">
      {running ? (
        <button
          type="button"
          onClick={() => stopPuppet()}
          title={status.label || "Stop demo"}
          aria-label="Stop demo"
          className="flex h-9 w-9 items-center justify-center text-black transition hover:opacity-70"
        >
          <StopIcon />
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => play("request")}
            title="Play: request milestones + yield → share link"
            aria-label="Play request demo"
            className="flex h-9 w-9 items-center justify-center text-black transition hover:opacity-70"
          >
            <PlayIcon />
          </button>
          <button
            type="button"
            onClick={() => play("scan")}
            title="Play: buy USDC → scan link → fund stream"
            aria-label="Play buy and scan demo"
            className="flex h-9 w-9 items-center justify-center text-black transition hover:opacity-70"
          >
            <PlayIcon />
          </button>
          <button
            type="button"
            onClick={() => play("pro")}
            title="Play: Pro → fund → rebalance → people → start → POS QR"
            aria-label="Play Pro demo"
            className="flex h-9 w-9 items-center justify-center text-black transition hover:opacity-70"
          >
            <PlayIcon />
          </button>
        </>
      )}
    </div>
  );
}
