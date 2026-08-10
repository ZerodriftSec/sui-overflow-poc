'use client';

import { useEffect, useState } from 'react';
import { HeroDashboardFloatingCards, HeroDashboardPreview } from '@/components/hero-dashboard-preview';
import { HeroVideoPreview } from '@/components/hero-video-preview';

const VIDEO_SWITCH_DELAY_MS = 5000;

export function HeroPreviewSwitcher() {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowVideo(true);
    }, VIDEO_SWITCH_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="relative min-h-[280px] w-full overflow-visible sm:min-h-[340px] lg:min-h-[380px]">
      <div className="pointer-events-none absolute -top-12 -right-12 h-60 w-72 rounded-full bg-purple-300/30 mix-blend-multiply blur-2xl animate-blob" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-60 w-72 rounded-full bg-indigo-300/30 mix-blend-multiply blur-2xl animate-blob animation-delay-2000" />

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-2xl glass-card">
        {showVideo ? <HeroVideoPreview /> : <HeroDashboardPreview />}
      </div>

      {!showVideo ? <HeroDashboardFloatingCards /> : null}
    </div>
  );
}
