import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="w-full bg-[#111] px-[5%] py-16 text-white">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[clamp(36px,7vw,72px)] font-semibold leading-tight">
              Stream<span className="text-[#f08030]">Line</span>
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
              Zero fees. No wallet setup. Pays as you work. This is what
              programmable money looks like on Sui.
            </p>
          </div>
          <Link href="/app/user" className="sl-btn sl-btn-primary w-fit">
            Launch App
          </Link>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-8 text-xs tracking-wider text-white/50 md:flex-row md:items-center md:justify-between">
          <span>Sui Overflow 2026 · DeFi &amp; Payments Track</span>
          <span>Address Balances · PTBs · Move · zkLogin</span>
        </div>
      </div>
    </footer>
  );
}
