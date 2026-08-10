"use client";

import { StreamLineMark } from "@/components/landing/StreamLineMark";

type PhoneAppSplashProps = {
  app: "user" | "pro";
  fading?: boolean;
};

/** Brief icon splash when opening an app from the launcher. */
export function PhoneAppSplash({ app, fading = false }: PhoneAppSplashProps) {
  const pro = app === "pro";

  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 transition-opacity duration-500 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      } ${pro ? "bg-[#050505]" : "bg-[#f7f8f9]"}`}
      aria-hidden
    >
      <div
        className={`flex flex-col items-center gap-3 transition-all duration-500 ease-out ${
          fading ? "scale-[1.08] opacity-0" : "sl-app-splash-in scale-100 opacity-100"
        }`}
      >
        <div
          className={`flex h-[72px] w-[72px] items-center justify-center rounded-[20px] ${
            pro
              ? "border border-white/12 bg-[#141414]"
              : "border border-white/80 bg-white"
          }`}
        >
          <StreamLineMark
            size="md"
            variant={pro ? "pro" : "default"}
            className="!h-11 !w-11"
          />
        </div>
        <div className="text-center">
          <p
            className={`text-[13px] font-semibold leading-tight tracking-[-0.01em] ${
              pro ? "text-white/90" : "text-[#111]"
            }`}
          >
            StreamLine
          </p>
          {pro ? (
            <p className="mt-0.5 text-[11px] font-medium leading-tight text-white/45">
              Pro
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
