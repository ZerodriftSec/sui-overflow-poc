"use client";

/**
 * Landing phone mock for the commercial / scale scene — free start → pro scale.
 * Dark (pro) surface.
 */
export function ScalePhonePreview({ progress = 0 }: { progress?: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const freeOpacity = 1 - p * 0.15;
  const proLift = p * 4;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col justify-center gap-2.5 px-2 py-3 font-[family-name:var(--font-inter)]">
      <div
        className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 transition-opacity duration-500"
        style={{ opacity: freeOpacity }}
      >
        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/40">
          Start
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-[1.15rem] font-semibold tracking-tight text-white">
            Free
          </p>
          <p className="text-[11px] font-semibold tabular tracking-tight text-white/70">
            $0 <span className="font-medium text-white/40">forever</span>
          </p>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/45">
          Streams, names, yield — no card required.
        </p>
        <ul className="mt-2.5 space-y-1">
          {["Personal wallet", "Gasless drips", "Private streams"].map((item) => (
            <li
              key={item}
              className="flex items-center gap-1.5 text-[10px] text-white/70"
            >
              <span className="text-[#1d9e75]">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-center" aria-hidden>
        <div className="flex h-5 w-px flex-col items-center">
          <div className="h-full w-px bg-gradient-to-b from-white/20 to-[#1d9e75]/50" />
        </div>
      </div>

      <div
        className="rounded-2xl border border-[#1d9e75]/35 bg-[#1d9e75]/10 px-3.5 py-3 transition-transform duration-500"
        style={{ transform: `translateY(${-proLift}px)` }}
      >
        <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#1d9e75]/80">
          Scale
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-[1.15rem] font-semibold tracking-tight text-white">
            Pro
          </p>
          <p className="text-[11px] font-semibold tabular tracking-tight text-white/85">
            $49<span className="font-medium text-white/45">/month</span>
          </p>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/55">
          When the roster and revenue grow with you.
        </p>
        <ul className="mt-2.5 space-y-1">
          {["Org payroll", "POS · Invoices · Subs", "Compliance exports"].map(
            (item) => (
              <li
                key={item}
                className="flex items-center gap-1.5 text-[10px] text-white/80"
              >
                <span className="text-[#1d9e75]">✓</span>
                {item}
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}
