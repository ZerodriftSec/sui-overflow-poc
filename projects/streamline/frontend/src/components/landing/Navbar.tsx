"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { WalletButton } from "@/components/wallet/WalletButton";

function useScrolledPast(px: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const onScroll = () => onChange();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    },
    () => window.scrollY > px,
    () => false
  );
}

const NAV_LINKS = [
  { href: "/#how", label: "how it works" },
  { href: "/#why-sui", label: "why sui" },
  { href: "/#compare", label: "compare" },
];

export function Navbar() {
  const solid = useScrolledPast(48);

  return (
    <header
      data-sl-cursor={solid ? "on-dark" : "on-light"}
      className={`fixed left-0 right-0 top-0 z-[100] transition-colors duration-300 ease-in-out ${
        solid ? "bg-[#2b2a5e]" : "bg-transparent"
      }`}
    >
      <div className="relative mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-5">
        <Link
          href="/#top"
          className={`flex min-w-0 items-center gap-3 transition-colors duration-300 ease-in-out ${
            solid ? "text-white" : "text-[#2b2a5e]"
          }`}
        >
          <span className="text-[15px] font-bold tracking-[-0.02em]">
            StreamLine
          </span>
          <span className="hidden truncate text-[10px] uppercase tracking-[0.22em] opacity-70 sm:inline">
            Programmable Micropayments
          </span>
        </Link>

        <nav
          className={`hidden items-center gap-6 text-[11px] uppercase tracking-[0.12em] transition-colors duration-300 md:flex ${
            solid ? "text-white/80" : "text-[#2b2a5e]/80"
          }`}
        >
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:opacity-60">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:block">
            <WalletButton />
          </div>
          <Link
            href="/app/user"
            className="inline-flex items-center justify-center bg-[#5b54e6] px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] text-white transition-opacity duration-300 ease-in-out hover:opacity-90"
          >
            launch app
          </Link>
        </div>
      </div>
    </header>
  );
}
