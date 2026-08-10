'use client';

import type { CSSProperties } from 'react';

type Line = {
  d: string;
  opacity: number;
  delay: string;
  duration: string;
  dash: string;
  width: number;
  reverse: boolean;
};

/** Deterministic irregular stream paths (stable across SSR). */
const LINES: Line[] = [
  {
    d: 'M -100 52 C 140 18, 310 96, 480 44 S 820 110, 1100 38 S 1280 70, 1400 28',
    opacity: 0.32,
    delay: '-2.4s',
    duration: '11s',
    dash: '40 220 90 380',
    width: 1.1,
    reverse: false,
  },
  {
    d: 'M -60 118 C 90 160, 260 70, 420 130 S 700 40, 900 150 S 1150 80, 1380 125',
    opacity: 0.18,
    delay: '-7.1s',
    duration: '17s',
    dash: '120 90 30 400',
    width: 0.9,
    reverse: true,
  },
  {
    d: 'M -140 175 C 80 210, 220 120, 390 190 S 650 240, 880 155 S 1120 210, 1420 170',
    opacity: 0.38,
    delay: '-0.8s',
    duration: '9.5s',
    dash: '70 160 200 280',
    width: 1.35,
    reverse: false,
  },
  {
    d: 'M -40 238 C 180 200, 340 280, 520 220 S 780 300, 980 210 S 1200 265, 1360 230',
    opacity: 0.14,
    delay: '-12s',
    duration: '22s',
    dash: '25 340 55 180',
    width: 0.75,
    reverse: true,
  },
  {
    d: 'M -120 295 C 60 340, 250 250, 430 320 S 690 270, 860 350 S 1080 290, 1400 325',
    opacity: 0.26,
    delay: '-4.6s',
    duration: '13.5s',
    dash: '150 60 40 320',
    width: 1.2,
    reverse: false,
  },
  {
    d: 'M -80 362 C 130 330, 300 410, 470 355 S 740 400, 920 340 S 1180 390, 1380 360',
    opacity: 0.2,
    delay: '-9.3s',
    duration: '15s',
    dash: '95 250 15 410',
    width: 1,
    reverse: false,
  },
  {
    d: 'M -150 430 C 40 470, 210 390, 400 455 S 640 410, 850 480 S 1100 420, 1420 455',
    opacity: 0.12,
    delay: '-1.2s',
    duration: '19s',
    dash: '60 190 110 90 40 360',
    width: 0.85,
    reverse: true,
  },
  {
    d: 'M -50 505 C 160 470, 320 540, 500 490 S 760 550, 960 500 S 1220 545, 1350 510',
    opacity: 0.22,
    delay: '-15s',
    duration: '12.2s',
    dash: '180 140 50 300',
    width: 1.15,
    reverse: false,
  },
  {
    d: 'M -110 88 C 100 130, 280 40, 450 95 S 720 20, 950 105 S 1180 55, 1400 90',
    opacity: 0.1,
    delay: '-5.5s',
    duration: '26s',
    dash: '20 480',
    width: 0.7,
    reverse: true,
  },
];

/**
 * Soft, irregular stream lines for the docs home upper viewport.
 */
export function StreamLines() {
  return (
    <div
      className="sl-stream-lines pointer-events-none absolute inset-x-0 top-0 h-[min(62vh,36rem)] overflow-hidden"
      aria-hidden
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1200 600"
        preserveAspectRatio="none"
        fill="none"
      >
        {LINES.map((line, i) => (
          <path
            key={i}
            className={
              line.reverse ? 'sl-stream-path sl-stream-path--rev' : 'sl-stream-path'
            }
            style={
              {
                animationDelay: line.delay,
                animationDuration: line.duration,
                opacity: line.opacity,
                strokeDasharray: line.dash,
              } satisfies CSSProperties
            }
            d={line.d}
            stroke="currentColor"
            strokeWidth={line.width}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-fd-background to-transparent" />
    </div>
  );
}
