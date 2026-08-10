import Link from 'next/link';
import {
  BookOpen,
  Code,
  Landmark,
  Shield,
  ArrowRight,
} from 'lucide-react';

import { StreamLines } from '@/components/StreamLines';

const links = [
  {
    href: '/docs',
    title: 'Introduction',
    description: 'What StreamLine is and how the pieces fit together.',
    icon: BookOpen,
  },
  {
    href: '/docs/privacy',
    title: 'Privacy',
    description: 'Confidential amounts, zkLogin, and Seal-sealed secrets.',
    icon: Shield,
  },
  {
    href: '/docs/finance',
    title: 'Finance',
    description: 'Yield, stream-backed borrowing, and Pro payroll.',
    icon: Landmark,
  },
  {
    href: '/docs/sdk',
    title: 'TypeScript SDK',
    description: 'Pay by name with stream.to — built for agents and scripts.',
    icon: Code,
  },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col overflow-hidden">
      <StreamLines />

      <section className="relative z-10 mx-auto mt-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-14 pt-10 sm:pb-20">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-medium tracking-wide text-teal-700 dark:text-teal-300">
            Documentation
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-fd-foreground sm:text-4xl md:text-[2.75rem] md:leading-[1.15]">
            Programmable confidential micropayments on Sui
          </h1>
          <p className="mt-4 text-base leading-relaxed text-fd-muted-foreground md:text-lg">
            Lock USDC into milestone-gated streams, resolve people by{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-[0.9em]">
              name@streamline
            </code>
            , and settle in gasless drips — privately when it matters.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Read the docs
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/privacy"
              className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/80 px-4 py-2.5 text-sm font-medium text-fd-foreground backdrop-blur-sm transition-colors hover:bg-fd-accent"
            >
              <Shield className="size-4" />
              Privacy
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-fd-border/80 bg-fd-card/70 p-4 backdrop-blur-sm transition-colors hover:border-teal-600/40 hover:bg-fd-accent/40 sm:p-5"
            >
              <item.icon className="mb-2.5 size-5 text-teal-700 dark:text-teal-300" />
              <h2 className="font-semibold tracking-tight text-fd-foreground">
                {item.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
