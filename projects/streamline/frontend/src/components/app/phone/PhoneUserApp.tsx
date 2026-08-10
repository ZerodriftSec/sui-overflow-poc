"use client";

import { PhoneEmbeddedProvider } from "./PhoneEmbeddedContext";
import { PhoneUserShell } from "./PhoneUserShell";
import type { PhoneAppRoute } from "./types";

type PhoneUserAppProps = {
  onNavigate: (route: PhoneAppRoute) => void;
};

export function PhoneUserApp({ onNavigate }: PhoneUserAppProps) {
  return (
    <PhoneEmbeddedProvider>
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <PhoneUserShell onNavigate={onNavigate} />
      </div>
    </PhoneEmbeddedProvider>
  );
}
