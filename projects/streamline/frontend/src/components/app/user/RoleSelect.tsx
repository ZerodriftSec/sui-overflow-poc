"use client";

import { BayerDitherImage } from "@/components/hero/BayerDitherImage";
import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";

export type Role = "payer" | "receiver";

const CARDS: {
  role: Role;
  path: string;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
}[] = [
  {
    role: "payer",
    path: "Path A",
    eyebrow: "I am a payer / sender",
    title: "Client",
    body: "Lock the full amount, define milestones, approve work as it lands — or dispute. Pay continuously, gasless, as the work happens.",
    image:
      "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1400&q=60&fm=jpg&fit=crop",
  },
  {
    role: "receiver",
    path: "Path B",
    eyebrow: "I am a receiver / freelancer",
    title: "Freelancer",
    body: "Watch money arrive in real time. Raise milestones in one click, split each drip across spend / save / yield, and borrow against your stream.",
    image:
      "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1400&q=60&fm=jpg&fit=crop",
  },
];

/**
 * SAIL-style "console" landing for the connected app: pick which side of a
 * stream you're on. Each card is a Bayer-dithered photo with role copy.
 */
export function RoleSelect({ onSelect }: { onSelect: (role: Role) => void }) {
  const embedded = usePhoneEmbedded();

  if (embedded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#888]">
          Pick your role
        </p>
        <p className="mt-1 text-[10px] leading-snug text-[#666]">
          Client or freelancer — same workspace, different view.
        </p>
        <div className="mt-4 space-y-2.5">
          {CARDS.map((c) => (
            <button
              key={c.role}
              type="button"
              onClick={() => onSelect(c.role)}
              className="w-full rounded-xl border border-[#2b2a5e]/15 bg-white px-3.5 py-3 text-left transition-colors hover:border-[#5b54e6]/40"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5b54e6]">
                {c.eyebrow}
              </p>
              <p className="mt-1 text-xs font-bold text-[#111]">{c.title}</p>
              <p className="mt-1 text-[10px] leading-snug text-[#666]">{c.body}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[#5b54e6]">
        StreamLine console
      </p>
      <h1 className="mt-4 text-[clamp(40px,7vw,92px)] font-black leading-[0.9] tracking-[-0.03em]">
        Let&rsquo;s stream together
      </h1>
      <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-[#2b2a5e]/70">
        Lock funds and pay as the work happens, or watch money arrive in real
        time. Choose your side to enter the workspace.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {CARDS.map((c) => (
          <button
            key={c.role}
            onClick={() => onSelect(c.role)}
            data-sl-cursor="on-dark"
            className="group relative block h-[420px] overflow-hidden border border-[#2b2a5e]/15 text-left md:h-[480px]"
          >
            <div className="absolute inset-0">
              <BayerDitherImage
                src={c.image}
                alt=""
                className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[#1d1c44]/80 via-transparent to-transparent" />

            <div className="relative flex h-full flex-col justify-between p-7">
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/80">
                {c.path}
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#b3aeef]">
                  {c.eyebrow}
                </p>
                <h2 className="mt-2 text-[clamp(34px,4vw,56px)] font-black leading-[0.95] tracking-[-0.02em] text-white">
                  {c.title}
                </h2>
                <p className="mt-3 max-w-md text-[13px] leading-relaxed text-white/75">
                  {c.body}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-white">
                  Enter as {c.title}
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
