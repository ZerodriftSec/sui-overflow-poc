import Image from 'next/image';
import { Smartphone } from 'lucide-react';

export function AgentsHeroIllustration({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-indigo-500/[0.08] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 top-12 h-40 w-40 rounded-full bg-indigo-500/[0.1] blur-2xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/30 p-3 shadow-[var(--shadow-card-lg)] sm:p-4">
        <Image
          src="/marketing/wallcard-agents-hero.png"
          alt="AI agent connected to WallCard with card custody, no key custody, and you remain in control"
          width={1536}
          height={1024}
          className="h-auto w-full rounded-[1.25rem] object-cover object-center"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
        <div className="absolute bottom-4 left-4 hidden rounded-full border border-zinc-200/80 bg-white/90 px-3 py-1.5 backdrop-blur-sm sm:flex sm:items-center sm:gap-2">
          <Smartphone className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          <span className="text-[11px] font-semibold text-zinc-900">Card custody · not key custody</span>
        </div>
      </div>
    </div>
  );
}
