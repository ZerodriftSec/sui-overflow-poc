import Image from 'next/image';

const backers = [
  {
    name: 'W3X Fund',
    href: 'https://www.w3x.network/',
    logoSrc: '/investors/w3x-fund.png',
    logoClassName: 'h-10 w-auto sm:h-12',
    darkBg: true,
  },
  {
    name: 'LvlUp Ventures',
    href: 'https://www.lvlup.vc/',
    logoSrc: '/investors/lvlup-ventures.png',
    logoClassName: 'h-8 w-auto sm:h-9',
    darkBg: false,
  },
] as const;

export function SupportedBy() {
  return (
    <section id="supported-by" className="nr-section py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Supported by
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            Backed by leading investors &amp; accelerators
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Building crypto payment infrastructure with partners who help us scale responsibly.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
          {backers.map((backer) => (
            <li key={backer.name}>
              <a
                href={backer.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`nr-panel flex min-h-[88px] items-center justify-center rounded-2xl px-6 py-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-lg)] ${
                  backer.darkBg ? 'bg-zinc-950' : 'bg-white'
                }`}
                aria-label={backer.name}
              >
                <Image
                  src={backer.logoSrc}
                  alt={`${backer.name} logo`}
                  width={240}
                  height={80}
                  className={`max-w-[min(100%,220px)] object-contain ${backer.logoClassName}`}
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
