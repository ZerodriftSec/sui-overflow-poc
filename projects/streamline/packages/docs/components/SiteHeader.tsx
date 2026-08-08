'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { StreamLineLogo } from '@/components/StreamLineLogo';
import { gitConfig } from '@/lib/shared';

const NAV = [
  { text: 'Docs', url: '/docs' },
  { text: 'Privacy', url: '/docs/privacy' },
  { text: 'Finance', url: '/docs/finance' },
  { text: 'SDK', url: '/docs/sdk' },
  { text: 'Protocol', url: '/docs/protocol/architecture' },
] as const;

function isActive(pathname: string, url: string) {
  if (url === '/docs') return pathname === '/docs' || pathname === '/docs/';
  return pathname === url || pathname.startsWith(`${url}/`);
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const github = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

  return (
    <header className="sticky top-0 z-40 border-b border-fd-border/80 bg-fd-background/80 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
        <div className="relative z-10 flex shrink-0 items-center">
          <StreamLineLogo />
        </div>

        <nav
          className="pointer-events-none absolute inset-x-0 hidden justify-center md:flex"
          aria-label="Primary"
        >
          <ul className="pointer-events-auto flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.url);
              return (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'font-medium text-fd-foreground'
                        : 'text-fd-muted-foreground hover:text-fd-foreground'
                    }`}
                  >
                    {item.text}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="relative z-10 ml-auto flex items-center gap-2">
          <nav className="flex items-center gap-0.5 md:hidden" aria-label="Mobile">
            {NAV.filter((i) => i.text === 'Docs' || i.text === 'Privacy').map(
              (item) => (
              <Link
                key={item.url}
                href={item.url}
                className="rounded-md px-2 py-1 text-xs text-fd-muted-foreground hover:text-fd-foreground"
              >
                {item.text}
              </Link>
            )
            )}
          </nav>
          <a
            href={github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground"
            aria-label="GitHub"
          >
            <GitHubIcon className="size-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
