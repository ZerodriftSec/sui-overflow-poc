import { WalletConnectCTA } from "../WalletConnectCTA";

export function CTASection() {
  return (
    <section className="landing-section">
      <div className="landing-container">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] px-8 py-16 sm:px-14 sm:py-20 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.08] via-transparent to-violet-950/20" />
          <div className="absolute inset-0 landing-grain opacity-20" />
          <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />

          <div className="relative">
            <h2 className="landing-display text-3xl sm:text-4xl lg:text-5xl leading-[1.08]">
              Start your next reel
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground leading-relaxed sm:text-lg">
              Open the studio, describe your idea, and work through each phase at your
              own pace.
            </p>
            <div className="mt-10 flex justify-center">
              <WalletConnectCTA label="Launch Studio" size="lg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
