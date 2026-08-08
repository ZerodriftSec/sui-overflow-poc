import { useRef, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { LaunchStudioButton } from "../LaunchStudioButton";
import { WalletConnectCTA } from "../WalletConnectCTA";

const HERO_VIDEO = "/videos/hero.mp4";

const PLACEHOLDER =
  "Describe your video — e.g. a 30s product reel with cinematic lighting";

export function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [prompt, setPrompt] = useState("");
  const [muted, setMuted] = useState(true);
  const account = useCurrentAccount();
  const isConnected = Boolean(account);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <section className="relative min-h-screen overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 landing-grain opacity-[0.08]" />

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-8 p-6 sm:p-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-lg landing-animate-in">
          <h1 className="landing-display text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Vive
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/75 sm:text-base">
            An AI production studio for short-form video. Plan every beat, approve
            every frame, and export platform-ready reels — with agents that iterate
            inside your workflow, not around it.
          </p>
        </div>

        <div className="landing-animate-in landing-animate-in-delay-1 flex w-full max-w-xl items-center gap-2 lg:max-w-lg lg:shrink-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/25 bg-black/30 py-1.5 pl-4 pr-1.5 backdrop-blur-md">
            <label htmlFor="hero-prompt" className="sr-only">
              Describe your video idea
            </label>
            <input
              id="hero-prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={PLACEHOLDER}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/40"
            />
            {isConnected ? (
              <LaunchStudioButton className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-white/30 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/15">
                Create
                <ArrowRight className="h-3.5 w-3.5" />
              </LaunchStudioButton>
            ) : (
              <WalletConnectCTA
                label="Create"
                size="sm"
                className="shrink-0 [&_button]:h-9 [&_button]:rounded-full [&_button]:border [&_button]:border-white/30 [&_button]:bg-white/10 [&_button]:px-4 [&_button]:text-sm [&_button]:font-medium [&_button]:text-white [&_button]:shadow-none [&_button]:hover:bg-white/15"
              />
            )}
          </div>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute video" : "Mute video"}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 text-white/80 transition-colors hover:border-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            {muted ? (
              <VolumeX className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Volume2 className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
