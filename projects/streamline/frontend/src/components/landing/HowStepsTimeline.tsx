"use client";

import type { SceneTheme } from "./heroScenes";

export type HowTimelineStep = {
  id: string;
  label: string;
  title: string;
  phrase: string;
};

export const HOW_TIMELINE_STEPS: HowTimelineStep[] = [
  {
    id: "lock",
    label: "Step 01",
    title: "Lock",
    phrase: "Commit funds on-chain for any future payments.",
  },
  {
    id: "drip",
    label: "Step 02",
    title: "Drip",
    phrase: "Create USDC streams with granular control over milestones and approvals.",
  },
  {
    id: "done",
    label: "Step 03",
    title: "Done",
    phrase: "Every milestone settled with a private on-chain record.",
  },
];

type HowStepsTimelineProps = {
  steps?: readonly HowTimelineStep[];
  progress: number;
  visible?: boolean;
  theme?: SceneTheme;
  embedded?: boolean;
};

const INACTIVE_OPACITY = 0.34;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Holds each step longer before advancing (embedded phone timeline). */
function activeIndex(progress: number, count: number, embedded: boolean): number {
  if (count <= 1) return 0;
  if (embedded && count === 3) {
    if (progress < 0.4) return 0;
    if (progress < 0.78) return 1;
    return 2;
  }
  return Math.min(count - 1, Math.floor(progress * count));
}

/** Smooth opacity crossfade as progress moves between steps. */
function stepOpacity(
  index: number,
  progress: number,
  count: number,
  embedded: boolean
): number {
  if (!embedded || count !== 3) {
    const active = activeIndex(progress, count, embedded);
    if (index === active) return 1;
    if (index < active) return INACTIVE_OPACITY + 0.1;
    return INACTIVE_OPACITY;
  }

  if (index === 0) {
    if (progress <= 0.3) return 1;
    if (progress >= 0.44) return INACTIVE_OPACITY;
    return lerp(1, INACTIVE_OPACITY, (progress - 0.3) / 0.14);
  }

  if (index === 1) {
    if (progress <= 0.34) return INACTIVE_OPACITY;
    if (progress >= 0.4 && progress <= 0.72) return 1;
    if (progress < 0.4) return lerp(INACTIVE_OPACITY, 1, (progress - 0.34) / 0.06);
    if (progress <= 0.8) return lerp(1, INACTIVE_OPACITY, (progress - 0.72) / 0.08);
    return INACTIVE_OPACITY;
  }

  if (progress <= 0.74) return INACTIVE_OPACITY;
  if (progress >= 0.82) return 1;
  return lerp(INACTIVE_OPACITY, 1, (progress - 0.74) / 0.08);
}

export function HowStepsTimeline({
  steps = HOW_TIMELINE_STEPS,
  progress,
  visible = true,
  theme = "light",
  embedded = false,
}: HowStepsTimelineProps) {
  const active = activeIndex(progress, steps.length, embedded);
  const isPro = theme === "pro";

  const labelTone = isPro ? "text-white/40" : "text-black/38";
  const titleTone = isPro ? "text-white" : "text-[#111]";
  const phraseTone = isPro ? "text-white/48" : "text-black/46";
  const lineTone = isPro
    ? "from-white/0 via-white/18 to-white/0"
    : "from-black/0 via-black/12 to-black/0";
  const dotIdle = isPro ? "bg-white/22 ring-white/8" : "bg-black/14 ring-black/6";
  const dotActive = isPro ? "bg-white ring-white/20" : "bg-[#111] ring-black/10";
  const dotDone = isPro ? "bg-white/55 ring-white/12" : "bg-black/45 ring-black/8";

  return (
    <div
      className={`relative flex min-h-0 flex-col ${
        embedded ? "mt-1 flex-1" : "flex-1"
      } ${visible ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
    >
      <div
        className={`relative flex min-h-0 flex-1 flex-col ${
          embedded ? "justify-center py-4" : "mt-4 justify-center py-10"
        }`}
      >
        <div className="relative flex min-h-0 flex-1 flex-col px-0.5">
          <div
            className={`relative flex min-h-0 flex-1 flex-col ${
              embedded ? "justify-center py-2" : "justify-between py-2"
            }`}
          >
            <div
              className={`absolute left-[15px] w-px -translate-x-1/2 bg-gradient-to-b ${lineTone} ${
                embedded ? "top-1 bottom-1" : "top-3 bottom-3"
              }`}
              aria-hidden
            />

            <ol
              className={`relative flex min-h-0 flex-1 flex-col ${
                embedded ? "h-full justify-between gap-2" : "h-full justify-between"
              }`}
            >
            {steps.map((step, i) => {
              const state =
                i < active ? "done" : i === active ? "active" : "upcoming";
              const blockOpacity = stepOpacity(
                i,
                progress,
                steps.length,
                embedded
              );

              return (
                <li key={step.id} className={`relative flex items-start ${embedded ? "gap-3" : "gap-4"}`}>
                  <span className={`relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center ${embedded ? "mt-1" : "mt-1.5"}`}>
                    <span
                      className={`rounded-full transition-all duration-700 ${
                        state === "active"
                          ? `h-3 w-3 ring-[5px] ${dotActive}`
                          : state === "done"
                            ? `h-2.5 w-2.5 ring-4 ${dotDone}`
                            : `h-2 w-2 ring-4 ${dotIdle}`
                      }`}
                      style={{ opacity: blockOpacity }}
                    />
                  </span>
                  <div
                    className="min-w-0 pt-0.5 transition-opacity duration-700 ease-out"
                    style={{ opacity: blockOpacity }}
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${labelTone}`}
                    >
                      {step.label}
                    </p>
                    <p
                      className={`font-semibold leading-none tracking-[-0.03em] ${
                        embedded
                          ? "mt-1.5 text-[1.35rem]"
                          : "mt-1.5 text-[clamp(1.35rem,2.2vw,1.75rem)]"
                      } ${titleTone}`}
                    >
                      {step.title}
                    </p>
                    <p
                      className={`max-w-[28ch] leading-snug ${
                        embedded ? "mt-2 text-[11px]" : "mt-2.5 text-[13px]"
                      } ${phraseTone}`}
                    >
                      {step.phrase}
                    </p>
                  </div>
                </li>
              );
            })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
