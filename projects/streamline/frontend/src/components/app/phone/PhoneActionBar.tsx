"use client";

import type { ReactNode } from "react";

export type PhoneUserTab = "home" | "streams" | "borrow" | "reports";

const TABS: {
  id: PhoneUserTab;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "home",
    label: "Home",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  },
  {
    id: "streams",
    label: "Streams",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    ),
  },
  {
    id: "borrow",
    label: "Borrow",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <path d="M5 21h14" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    ),
  },
];

type PhoneActionBarProps = {
  active: PhoneUserTab;
  onChange: (tab: PhoneUserTab) => void;
};

export function PhoneActionBar({ active, onChange }: PhoneActionBarProps) {
  return (
    <nav className="mt-3 shrink-0 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/[0.03] p-1">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-all ${
              isActive
                ? "bg-white text-[#111] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                : "text-[#999] hover:text-[#666]"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              {tab.icon}
            </span>
            <span
              className={`text-[8px] font-medium tracking-wide ${
                isActive ? "text-[#111]" : "text-inherit"
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
