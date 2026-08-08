import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

const SHOWCASE_ITEMS = [
  {
    title: "Influencer marketing",
    src: "/videos/bag.mp4",
  },
  {
    title: "Brand campaign",
    src: "/videos/burger.mp4",
  },
  {
    title: "Product launch",
    src: "/videos/chair.mp4",
  },
  {
    title: "Film",
    src: "/videos/dinosaur.mp4",
  },
] as const;

type ShowcaseItem = (typeof SHOWCASE_ITEMS)[number];

interface ShowcaseLightboxProps {
  items: readonly ShowcaseItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function ShowcaseLightbox({
  items,
  index,
  onClose,
  onNavigate,
}: ShowcaseLightboxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
    if (e.key === "ArrowRight" && hasNext) onNavigate(index + 1);
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {
      // Autoplay with sound can fail; controls remain available.
    });
  }, [index]);

  if (!item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        aria-label="Close video"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-sm font-medium text-white/90 sm:text-base">
            {item.title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          <video
            key={item.src}
            ref={videoRef}
            className="h-full w-full object-contain"
            controls
            autoPlay
            playsInline
            loop
            preload="auto"
          >
            <source src={item.src} type="video/mp4" />
          </video>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate(index - 1)}
            disabled={!hasPrev}
            aria-label="Previous video"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs text-white/50 tabular-nums">
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            onClick={() => onNavigate(index + 1)}
            disabled={!hasNext}
            aria-label="Next video"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ShowcasePreviewProps {
  item: ShowcaseItem;
  index: number;
  shouldLoad: boolean;
  lightboxOpen: boolean;
  onOpen: () => void;
  videoRef: (el: HTMLVideoElement | null) => void;
}

function ShowcasePreview({
  item,
  index,
  shouldLoad,
  lightboxOpen,
  onOpen,
  videoRef,
}: ShowcasePreviewProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] text-left transition-colors hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{ animationDelay: `${index * 80}ms` }}
      aria-label={`Play ${item.title}`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-white/[0.03]">
        {shouldLoad ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            autoPlay={!lightboxOpen}
            muted
            loop
            playsInline
            preload="metadata"
            src={item.src}
          />
        ) : null}
        <div className="absolute inset-0 landing-grain opacity-20" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background/90 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm">
            <Play className="h-5 w-5 fill-current" strokeWidth={1.5} />
          </span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <h3 className="text-sm font-medium sm:text-base">{item.title}</h3>
      </div>
    </button>
  );
}

export function ShowcaseSection() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const previewRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const lightboxOpen = activeIndex !== null;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    for (const video of previewRefs.current) {
      if (!video) continue;
      if (lightboxOpen) {
        video.pause();
      } else {
        void video.play().catch(() => undefined);
      }
    }
  }, [lightboxOpen, shouldLoad]);

  return (
    <section
      id="showcase"
      ref={sectionRef}
      className="landing-section relative overflow-hidden"
    >
      <div className="landing-container">
        <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="landing-eyebrow mb-4">Showcase</p>
            <h2 className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]">
              Built for the formats
              <span className="text-muted-foreground"> creators ship every day</span>
            </h2>
          </div>
          <p className="max-w-sm text-base text-muted-foreground leading-relaxed md:text-right">
            Reels, TikToks, and Shorts — same studio, same approval flow, export-ready
            deliverables.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          {SHOWCASE_ITEMS.map((item, index) => (
            <ShowcasePreview
              key={item.title}
              item={item}
              index={index}
              shouldLoad={shouldLoad}
              lightboxOpen={lightboxOpen}
              onOpen={() => setActiveIndex(index)}
              videoRef={(el) => {
                previewRefs.current[index] = el;
              }}
            />
          ))}
        </div>
      </div>

      {activeIndex !== null ? (
        <ShowcaseLightbox
          items={SHOWCASE_ITEMS}
          index={activeIndex}
          onClose={() => setActiveIndex(null)}
          onNavigate={setActiveIndex}
        />
      ) : null}
    </section>
  );
}
