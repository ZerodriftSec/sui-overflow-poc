import { useEffect, useState, type RefObject } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { cn } from "../../lib/utils";
import { BrandLogo } from "../BrandLogo";
import { LaunchStudioButton } from "../LaunchStudioButton";
import { WalletConnectCTA } from "../WalletConnectCTA";

const NAV_LINKS = [
  { href: "#workflow", label: "Workflow" },
  { href: "#studio", label: "Studio" },
  { href: "#showcase", label: "Showcase" },
  { href: "#capabilities", label: "Capabilities" },
] as const;

const NAV_HEIGHT_PX = 80;

function usePastHero(heroEndRef: RefObject<HTMLElement | null>): boolean {
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const update = () => {
      const sentinel = heroEndRef.current;
      if (!sentinel) {
        setPastHero(window.scrollY > window.innerHeight - NAV_HEIGHT_PX);
        return;
      }
      setPastHero(sentinel.getBoundingClientRect().top <= NAV_HEIGHT_PX);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [heroEndRef]);

  return pastHero;
}

interface LandingNavProps {
  heroEndRef: RefObject<HTMLElement | null>;
}

export function LandingNav({ heroEndRef }: LandingNavProps) {
  const pastHero = usePastHero(heroEndRef);
  const account = useCurrentAccount();
  const isConnected = Boolean(account);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        pastHero ? "bg-background/80 backdrop-blur-2xl" : "bg-transparent",
      )}
    >
      <div className="landing-container relative flex h-16 items-center sm:h-20">
        <a href="#" className="group">
          <BrandLogo
            showWordmark
            imageClassName="h-7 w-7"
            wordmarkClassName={cn(
              "text-base landing-display font-semibold transition-colors duration-300",
              pastHero ? "text-foreground" : "text-white",
            )}
          />
        </a>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm transition-colors duration-300",
                pastHero
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-white/65 hover:text-white",
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-auto">
          {isConnected ? (
            <LaunchStudioButton className="inline-flex h-9 items-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90">
              Launch Studio
            </LaunchStudioButton>
          ) : (
            <WalletConnectCTA
              label="Launch Studio"
              size="sm"
              className="[&_button]:h-9 [&_button]:rounded-full [&_button]:bg-brand [&_button]:px-5 [&_button]:text-sm [&_button]:font-semibold [&_button]:text-brand-foreground [&_button]:shadow-none [&_button]:hover:bg-brand/90"
            />
          )}
        </div>
      </div>
    </nav>
  );
}
