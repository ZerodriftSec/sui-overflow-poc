"use client";

/**
 * Landing phone mock for the names scene — people (light) / machines (dark).
 * Soft horizontal split at mid; short fade for a clean passage.
 */
export function NamesPhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const typed = Math.floor(p * 22);
  const sdkLine =
    'await stream.to("alice@streamline")'.slice(0, Math.max(10, typed + 10));

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Upper — no fill, centered; slightly less than half so mid sits clean */}
      <div className="relative z-10 flex min-h-0 flex-[0.92] flex-col items-center justify-center px-4 pb-3 pt-5 text-center">
        <p className="font-mono text-[1.55rem] font-bold leading-[1.05] tracking-tight text-[#bbb] line-through decoration-[#999] decoration-2">
          0x7a3f…c91e
        </p>
        <p className="mt-2 text-[1.7rem] font-bold leading-[1.05] tracking-[-0.035em] text-[#111]">
          alice
          <span className="sl-shiny animate-shiny">@streamline</span>
        </p>
     
      </div>

      {/* Lower — taller half; short fade straddling the mid line */}
      <div className="relative -mt-3 flex min-h-0 flex-[1.08] flex-col items-center justify-center overflow-hidden rounded-b-[1.25rem] px-4 pb-5 pt-6 text-center">
        <div
          className="pointer-events-none absolute inset-0 rounded-b-[1.25rem]"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.5) 4%, #0a0a0a 10%, #0a0a0a 100%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 flex w-full flex-col items-center">
          <div className="w-full max-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-[#141414] text-left">
            <div className="flex items-center gap-1.5 border-b border-white/8 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              <span className="ml-1.5 text-[8px] font-medium uppercase tracking-[0.14em] text-white/35">
                agent.ts
              </span>
            </div>
            <pre className="overflow-x-auto px-2.5 py-2.5 font-mono text-[9px] leading-[1.55] text-white/70">
              <code>
                <span className="text-white/30">{"// stream by name\n"}</span>
                <span className="text-[#7dd3fc]">import</span>
                {" { stream } "}
                <span className="text-[#7dd3fc]">from</span>
                {' "'}
                <span className="text-[#f9a8d4]">@streamline/sdk</span>
                {'"\n\n'}
                <span className="text-emerald-300/90">{sdkLine}</span>
                <span className="animate-pulse text-white/45">▌</span>
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
