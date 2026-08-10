"use client";

import { PhoneEmbeddedProvider } from "./PhoneEmbeddedContext";
import { ProPhoneAppRoot } from "../pro/ProShell";

export function PhoneProApp() {
  return (
    <PhoneEmbeddedProvider>
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <ProPhoneAppRoot />
      </div>
    </PhoneEmbeddedProvider>
  );
}
