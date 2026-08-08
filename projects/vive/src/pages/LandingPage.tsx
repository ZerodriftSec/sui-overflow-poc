import { useRef } from "react";
import { LandingNav } from "../components/landing/LandingNav";
import { HeroSection } from "../components/landing/HeroSection";
import { PlatformMarquee } from "../components/landing/PlatformMarquee";
import { ShowcaseSection } from "../components/landing/ShowcaseSection";
import { PipelineSection } from "../components/landing/PipelineSection";
import { StudioPreviewSection } from "../components/landing/StudioPreviewSection";
import { FeaturesSection } from "../components/landing/FeaturesSection";
import { CTASection } from "../components/landing/CTASection";
import { LandingFooter } from "../components/landing/LandingFooter";
import { useWalletAuthRedirect } from "../hooks/useWalletAuthRedirect";

export function LandingPage() {
  useWalletAuthRedirect("/app");
  const heroEndRef = useRef<HTMLDivElement>(null);

  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      <LandingNav heroEndRef={heroEndRef} />
      <main>
        <HeroSection />
        <div ref={heroEndRef} className="h-px w-full" aria-hidden />
        <PlatformMarquee />
        <ShowcaseSection />
        <PipelineSection />
        <StudioPreviewSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
