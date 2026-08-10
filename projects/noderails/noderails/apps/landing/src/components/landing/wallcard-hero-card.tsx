'use client';

import Image from 'next/image';
import { Wifi } from 'lucide-react';
import { useMemo, useRef, type PointerEvent } from 'react';

const EMBER_TOP = '#f87171';
const EMBER_MID = '#ef4444';
const EMBER_DEEP = '#b91c1c';
const PATTERN_INK = '#2a0a0a';

const CARD_ASPECT = 1.48;
const TOP_BAND_RATIO = 0.36;

function bandPixelCells(cols = 28, rows = 12, seed = 42): [number, number][] {
  let s = seed % 2147483647;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const cells: [number, number][] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (rand() < 0.4) cells.push([c, r]);
    }
  }
  return cells;
}

function WallCardMarkOnAccent({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="shrink-0" aria-hidden>
      <path
        d="M4 6 L11 32 L20 14 L29 32 L36 6 L30 6 L25.5 22 L20 10 L14.5 22 L10 6 Z"
        fill="rgba(10,10,10,0.92)"
      />
    </svg>
  );
}

function BandPixelTexture() {
  const cells = useMemo(() => bandPixelCells(), []);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
      viewBox="0 0 28 12"
      preserveAspectRatio="none"
      aria-hidden
    >
      {cells.map(([c, r], i) => (
        <rect key={i} x={c} y={r} width={1} height={1} fill={PATTERN_INK} opacity={0.34} />
      ))}
    </svg>
  );
}

export function WallCardHeroCard({ className = '' }: { className?: string }) {
  const tiltRef = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1200px) rotateX(${ny * -18}deg) rotateY(${nx * 25}deg)`;
  };

  const onPointerLeave = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className={`relative mx-auto w-full nr-float ${className}`}>
      <div
        ref={tiltRef}
        className="relative w-full transition-transform duration-300 ease-out"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{ transform: 'perspective(1200px) rotateX(0deg) rotateY(0deg)' }}
      >
      <div
        className="relative w-full overflow-hidden rounded-[24px] bg-black"
        style={{
          aspectRatio: String(CARD_ASPECT),
          boxShadow: '0 14px 28px rgba(9, 9, 11, 0.12), 0 24px 48px rgba(239, 68, 68, 0.18)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 bg-black"
          style={{ height: `${TOP_BAND_RATIO * 100}%` }}
          aria-hidden
        />

        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden"
          style={{
            height: `${(1 - TOP_BAND_RATIO) * 100}%`,
            background: `linear-gradient(180deg, ${EMBER_TOP} 0%, ${EMBER_MID} 52%, ${EMBER_DEEP} 100%)`,
          }}
          aria-hidden
        >
          <BandPixelTexture />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(255,255,255,0.14) 70%, rgba(0,0,0,0.06) 100%)',
            }}
            aria-hidden
          />
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-b from-white/[0.22] to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-inset ring-white/15"
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col px-[22px] pb-4 pt-[18px]">
          <div className="flex items-start justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-2 pr-2">
              <div
                className="flex max-w-[136px] items-center gap-0.5 rounded-[7px] border border-black/12 py-[5px] pl-1.5 pr-1 shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
                style={{ background: EMBER_TOP }}
              >
                <WallCardMarkOnAccent size={16} />
                <div className="min-w-0 flex-1 pr-0.5">
                  <p className="text-[10px] font-extrabold tracking-[1.15px] text-black">WALLCARD</p>
                  <p className="mt-0.5 text-[6px] font-bold tracking-[0.72px] text-black/72">
                    CRYPTO REIMAGINED
                  </p>
                </div>
              </div>
              <Wifi
                className="mt-1 h-[18px] w-[18px] shrink-0 -rotate-90 text-white/85"
                strokeWidth={2.2}
                aria-hidden
              />
            </div>

            <div className="max-w-32 shrink-0 text-right">
              <p className="text-[7.5px] font-semibold uppercase tracking-[1.95px] text-white/70">
                POWERED BY
              </p>
              <p
                className="mt-0.5 text-sm font-bold lowercase tracking-wide text-white"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}
              >
                blockchain
              </p>
            </div>
          </div>

          <div className="mt-0.5 flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center py-1">
              <div className="mt-[50px] flex min-h-12 items-center justify-center">
                <div className="rounded-[18px] border border-white/18 bg-black/30 px-3 py-1.5">
                  <p
                    className="text-center font-mono text-[clamp(15px,4.2vw,22px)] font-extrabold tabular-nums tracking-[1px] text-white"
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}
                  >
                    •••• •••• •••• 4242
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-1 flex shrink-0 items-end justify-between gap-1.5">
              <div className="min-w-0 flex-[1.35]">
                <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[1.35px] text-white/72">
                  CARD HOLDER
                </p>
                <p
                  className="truncate text-[15px] font-extrabold uppercase tracking-[0.55px] text-white"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}
                >
                  CARDHOLDER NAME
                </p>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <Image
                  src="/marketing/noderails-network-mark.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0"
                />
                <div className="flex flex-col items-start justify-center gap-0.5">
                  <p
                    className="text-base font-bold leading-none tracking-tight text-white"
                    style={{ textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}
                  >
                    NodeRails
                  </p>
                  <p className="text-[9px] font-semibold uppercase tracking-[2.2px] text-white/78">
                    Network
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
