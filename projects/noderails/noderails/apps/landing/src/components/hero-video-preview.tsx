'use client';

import { useEffect, useRef, useState } from 'react';

const HERO_VIDEO_URL = 'https://pub-5de3d40148a9489b9951aac59a6be2dc.r2.dev/5VDHW4mI9WXOiy4n_9.mp4';

export function HeroVideoPreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (!isReady) return;
    const player = videoRef.current;
    if (!player) return;

    let cancelled = false;

    const playVideo = async () => {
      try {
        player.muted = false;
        player.volume = 1;
        await player.play();
        if (!cancelled) setIsMuted(false);
      } catch {
        player.muted = true;
        if (!cancelled) setIsMuted(true);
        try {
          await player.play();
        } catch {
          // Autoplay blocked; user can unmute manually.
        }
      }
    };

    void playVideo();

    return () => {
      cancelled = true;
    };
  }, [isReady]);

  return (
    <div>
      <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex space-x-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <div className="ml-3 flex-1 rounded border border-slate-100 bg-white px-3 py-1 font-mono text-[10px] text-slate-400">
          merchant.noderails.com
        </div>
      </div>

      <div className="relative w-full bg-slate-950">
        <video
          ref={videoRef}
          className={`block h-auto w-full object-contain transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted={isMuted}
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setIsReady(true)}
        >
          <source src={HERO_VIDEO_URL} type="video/mp4" />
        </video>

        {!isReady ? <div className="absolute inset-0 min-h-[180px] animate-pulse bg-slate-900/60" /> : null}

        {isReady ? (
          <button
            type="button"
            className="absolute bottom-3 right-3 rounded-full bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-slate-900"
            onClick={() => {
              const player = videoRef.current;
              if (!player) return;

              const nextMuted = !isMuted;
              player.muted = nextMuted;
              if (!nextMuted) player.volume = 1;
              setIsMuted(nextMuted);
              void player.play().catch(() => {});
            }}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
