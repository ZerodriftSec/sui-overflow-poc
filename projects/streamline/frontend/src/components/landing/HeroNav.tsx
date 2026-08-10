"use client";

import Link from "next/link";

import { StreamLineMark } from "./StreamLineMark";
import { HERO_LAYOUT_MAX_CLASS } from "./heroLayout";
import type { SceneTheme } from "./heroScenes";

// The docs live in the standalone `packages/docs` (Fumadocs) app. Set
// NEXT_PUBLIC_DOCS_URL to its deployment; falls back to the local :3001 dev server.
const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL?.replace(/\/$/, "") || "http://localhost:3001";

type HeroNavProps = {
  theme?: SceneTheme;
  inApp?: boolean;
  onLaunchApp?: () => void;
  onBackToMain?: () => void;
};

export function HeroNav({
  theme = "light",
  inApp = false,
  onLaunchApp,
  onBackToMain,
}: HeroNavProps) {
  const isPro = theme === "pro";

  return (
    <nav
      className={`relative z-20 mx-auto flex w-full ${HERO_LAYOUT_MAX_CLASS} shrink-0 items-center justify-between px-8 py-5 transition-colors duration-700 ${
        isPro ? "font-[family-name:var(--font-inter)]" : ""
      }`}
    >
      <Link href="/#top" className="flex items-center gap-3">
        <StreamLineMark size="md" variant={isPro ? "pro" : "default"} />
        <span
          className={`text-lg font-semibold tracking-tight transition-colors duration-700 ${
            isPro ? "text-white" : "text-[#111]"
          }`}
        >
          StreamLine
          {isPro && (
            <span className="ml-1 text-sm font-medium text-white/40">.pro</span>
          )}
        </span>
      </Link>

      <div className="flex items-center gap-5 sm:gap-6">
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[13px] font-medium tracking-wide transition-colors duration-300 ${
            isPro
              ? "text-white/55 hover:text-white"
              : "text-[#666] hover:text-[#111]"
          }`}
        >
          Docs
        </a>
        <button
          type="button"
          onClick={inApp ? onBackToMain : onLaunchApp}
          className={`font-semibold ${
            isPro
              ? "sl-glass-btn-dark sl-glass-btn-dark-primary"
              : "sl-glass-btn sl-glass-btn-primary"
          }`}
        >
          {inApp ? "Back to main" : "Start App"}
        </button>
      </div>
    </nav>
  );
}
