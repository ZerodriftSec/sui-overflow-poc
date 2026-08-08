type PlatformIconName = "instagram" | "tiktok" | "youtube";

interface MarqueeItem {
  label: string;
  icon?: PlatformIconName;
}

const MARQUEE_ITEMS: MarqueeItem[] = [
  { label: "Instagram Reels", icon: "instagram" },
  { label: "TikTok", icon: "tiktok" },
  { label: "YouTube Shorts", icon: "youtube" },
  { label: "Product demos" },
  { label: "Brand stories" },
  { label: "Tutorial clips" },
  { label: "Launch teasers" },
  { label: "Social hooks" },
];

function PlatformIcon({ name }: { name: PlatformIconName }) {
  const className = "h-[18px] w-[18px] shrink-0 opacity-60";

  switch (name) {
    case "instagram":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className={className}
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
          <path d="M21.8 8.2s-.2-1.4-.8-2c-.8-.9-1.7-.9-2.1-1-3-.2-7.5-.2-7.5-.2s-4.5 0-7.5.2c-.4.1-1.3.1-2.1 1-.6.6-.8 2-.8 2S2 10.1 2 12v1.8c0 1.9.2 3.8.2 3.8s.2 1.4.8 2c.8.9 1.8.9 2.2 1 1.6.2 6.8.2 6.8.2s4.5 0 7.5-.2c.4-.1 1.3-.1 2.1-1 .6-.6.8-2 .8-2s.2-1.9.2-3.8V12c0-1.9-.2-3.8-.2-3.8zM10 15.5V8.8l5.5 3.35L10 15.5z" />
        </svg>
      );
  }
}

function MarqueeEntry({ item }: { item: MarqueeItem }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground/60">
      {item.icon ? <PlatformIcon name={item.icon} /> : null}
      {item.label}
    </span>
  );
}

export function PlatformMarquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <div
      aria-hidden
      className="border-y border-white/[0.04] bg-background py-4"
    >
      <div className="overflow-hidden">
        <div className="landing-marquee-track flex w-max items-center gap-12 px-6">
          {items.map((item, i) => (
            <MarqueeEntry key={`${item.label}-${i}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
