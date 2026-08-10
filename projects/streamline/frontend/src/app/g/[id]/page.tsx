"use client";

import { Suspense } from "react";

import GiftCardPage from "./GiftCardClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[#666]">
          Loading…
        </div>
      }
    >
      <GiftCardPage />
    </Suspense>
  );
}
