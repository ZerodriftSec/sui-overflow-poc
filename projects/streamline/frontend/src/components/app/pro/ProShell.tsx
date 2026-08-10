"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";
import { PhoneProWorkspace } from "./PhoneProWorkspace";
import { ProActionModals } from "./modals/ProActionModals";
import { ProOnboarding } from "./ProOnboarding";
import { ProWorkspaceProvider } from "./ProWorkspaceContext";
import { useNeedsHandleOnboarding } from "@/lib/use-handle-onboarding";
import { exitProDemoMode, useProDemoMode } from "@/lib/pro-demo-mode";

const NAV = [
  { href: "/app/pro", label: "Overview", match: "exact" as const },
  { href: "/app/pro/streams", label: "Streams", match: "prefix" as const },
  { href: "/app/pro/people", label: "People", match: "prefix" as const },
  { href: "/app/pro/treasury", label: "Treasury", match: "prefix" as const },
  { href: "/app/pro/reports", label: "Reports", match: "prefix" as const },
  { href: "/app/pro/tools", label: "Tools", match: "prefix" as const },
];

function navActive(pathname: string | null, href: string, match: "exact" | "prefix") {
  if (!pathname) return false;
  if (match === "exact") return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-[1280px] font-[family-name:var(--font-inter)]">
      <aside className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-[210px] shrink-0 flex-col border-r border-white/10 px-4 py-6 md:flex">
        <p className="px-2 text-[9px] font-medium uppercase tracking-[0.2em] text-white/30">
          Workspace
        </p>
        <nav className="mt-3 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = navActive(pathname, item.href, item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-white text-[#0a0a0a]"
                    : "text-white/55 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 pt-6">
          <p className="text-[10px] leading-relaxed text-white/25">
            Frontend workspace. Chain + API wiring next.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = navActive(pathname, item.href, item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] ${
                  active
                    ? "bg-white text-[#0a0a0a]"
                    : "border border-white/10 text-white/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="px-4 py-6 md:px-8 md:py-8">{children}</div>
      </div>
      <ProActionModals />
    </div>
  );
}

/** Desktop route wrapper — provider + sidebar around Next.js pages. */
export function ProShell({ children }: { children: ReactNode }) {
  const account = useCurrentAccount();
  const { needsStep } = useNeedsHandleOnboarding();
  const demo = useProDemoMode();

  // Real wallet wins — drop explore-demo fixtures.
  useEffect(() => {
    if (account) exitProDemoMode();
  }, [account]);

  if (demo && !account) {
    return (
      <ProWorkspaceProvider demo>
        <DesktopShell>{children}</DesktopShell>
      </ProWorkspaceProvider>
    );
  }
  if (!account || needsStep) return <ProOnboarding />;
  return (
    <ProWorkspaceProvider>
      <DesktopShell>{children}</DesktopShell>
    </ProWorkspaceProvider>
  );
}

/** Phone embed — density-tuned workspace (not the desktop screens). */
export function ProPhoneAppRoot() {
  const embedded = usePhoneEmbedded();
  const account = useCurrentAccount();
  const { needsStep } = useNeedsHandleOnboarding();
  const demo = useProDemoMode();

  useEffect(() => {
    if (account) exitProDemoMode();
  }, [account]);

  if (demo && !account) {
    return (
      <ProWorkspaceProvider demo>
        <PhoneProWorkspace />
      </ProWorkspaceProvider>
    );
  }
  if (!account || needsStep) return <ProOnboarding embedded={!!embedded} />;
  return (
    <ProWorkspaceProvider>
      <PhoneProWorkspace />
    </ProWorkspaceProvider>
  );
}
