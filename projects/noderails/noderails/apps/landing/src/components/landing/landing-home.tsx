import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { HeroPreviewSwitcher } from '@/components/hero-preview-switcher';
import { FeedbackWidget } from '@/components/feedback-widget';
import { SectionHeader } from '@/components/landing/section-header';
import { ScreenshotFrame } from '@/components/landing/screenshot-frame';
import { MerchantsCollage } from '@/components/landing/merchants-collage';
import { AgentsHeroIllustration } from '@/components/landing/agents-hero-illustration';
import { WallCardHeroCard } from '@/components/landing/wallcard-hero-card';
import { SupportedBy } from '@/components/landing/supported-by';
import { InteractiveDemo } from '@/components/landing/interactive-demo';
import { FiatRailsSection } from '@/components/landing/fiat-rails-section';
import {
  ArrowRight,
  CreditCard,
  ArrowLeftRight,
  Coins,
  Shield,
  Check,
  ChevronRight,
  Wallet,
  Fingerprint,
  Globe2,
  Gauge,
  Lock,
  Zap,
  Landmark,
} from 'lucide-react';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';
const WALLCARD_URL = 'https://wallcard.noderails.com/';
const X_URL = 'https://x.com/noderails';
const LINKEDIN_URL = 'https://www.linkedin.com/company/noderails';
const TELEGRAM_URL = 'https://t.me/+fzUTcAYr-zhhZjg1';
const DISCORD_URL = 'https://discord.gg/8uwSfv9Tvk';

const navLinks = [
  { label: 'Products', href: '#products' },
  { label: 'WallCard', href: '#wallcard' },
  { label: 'Developers', href: '#developers' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
];

const heroStats = [
  {
    icon: Gauge,
    title: '1% introductory fee',
    body: 'Simple pricing that scales with your business from day one.',
  },
  {
    icon: Globe2,
    title: 'Multi-chain support',
    body: 'Accept crypto across EVM and Solana with one integration.',
  },
  {
    icon: Shield,
    title: 'Built-in chargebacks',
    body: 'Real buyer protection with on-chain dispute resolution.',
  },
];

const products = [
  {
    icon: CreditCard,
    title: 'Payments & Checkout',
    description:
      'Accept crypto via hosted checkout pages or embeddable payment links. Funds settle directly to your wallet. Zero middlemen.',
    span: 'md:col-span-2',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Shield,
    title: 'Chargebacks & Refunds',
    description:
      'Built-in chargeback and refund flow with on-chain dispute resolution. Real buyer protection for crypto commerce.',
    span: 'md:col-span-1',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: ArrowLeftRight,
    title: 'Payment Links',
    description:
      'Generate shareable payment links for any amount. Share via email, chat, or embed on your site. One click to pay.',
    span: 'md:col-span-1',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Coins,
    title: 'Subscriptions & Invoices',
    description:
      'Recurring billing with automatic charge cycles. Create invoices with payment links and track status in real-time.',
    span: 'md:col-span-2',
    color: 'bg-fuchsia-50 text-fuchsia-600',
  },
];

const wallcardFeatures = [
  {
    icon: CreditCard,
    title: 'Card-first checkout',
    body: 'Familiar PAN, CVV, PIN, and OTP steps. No seed phrase, and no "install another wallet" for every purchase.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: Wallet,
    title: 'Solana + Ethereum',
    body: 'Same EIP-1193-style flow as mainstream wallet tooling: message signing, typed data, and sends on Solana and EVM.',
    color: 'bg-red-50 text-red-600',
  },
  {
    icon: Globe2,
    title: 'Network, not a bank branch',
    body: 'Visa- and Mastercard-style routing for programmable money, with interchange-style economics on the chains you already use.',
    color: 'bg-rose-50 text-rose-600',
  },
];

export function LandingHome() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-zinc-900 antialiased">
      {/* Announcement */}
      <div className="nr-announcement">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 py-2.5 text-center text-[13px] text-zinc-600 sm:px-8">
          <span className="rounded-full bg-indigo-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Live
          </span>
          <span>Accept crypto payments with hosted checkout, links, subscriptions, and built-in dispute protection.</span>
          <a href="/docs" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700">
            Read the docs
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Nav */}
      <header className="nr-nav sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 sm:gap-4 lg:px-12">
          <a href="/" className="flex min-w-0 shrink items-center">
            <NodeRailsLogo withText className="h-auto w-[min(160px,42vw)] sm:w-[200px] lg:w-[220px]" />
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((item) => (
              <a key={item.label} href={item.href} className="nr-nav-link">
                {item.label}
              </a>
            ))}
          </nav>

          <TrackedLink
            href={`${DASHBOARD_URL}/login`}
            event="landing_login_clicked"
            properties={{ location: 'nav' }}
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 sm:px-4 sm:text-sm"
          >
            <span className="sm:hidden">Login</span>
            <span className="hidden sm:inline">Merchant Login</span>
            <ChevronRight className="h-4 w-4" />
          </TrackedLink>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden border-b border-zinc-200">
        <div className="nr-hero-glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="nr-dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-16 sm:px-6 sm:pb-16 sm:pt-24 lg:px-10 lg:pb-20 lg:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-16">
            <div className="min-w-0 text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                Live on multiple blockchains
              </div>

              <h1 className="text-[1.75rem] font-black leading-[1.15] text-zinc-900 sm:text-4xl sm:leading-[1.12] lg:text-[2.65rem] lg:leading-[1.1] xl:text-5xl xl:leading-[1.08]">
                <span className="block">
                  The{' '}
                  <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
                    most advanced
                  </span>
                  {' '}&amp;{' '}
                  <span className="bg-gradient-to-r from-indigo-600 via-red-600 to-orange-400 bg-clip-text text-transparent">
                    comprehensive
                  </span>{' '}
                  <span className="gradient-text">Crypto</span>
                </span>
                <span className="mt-2 block">
                  <span className="gradient-text">Payments Infrastructure</span>
                  <span className="bg-gradient-to-r from-red-600 via-rose-500 to-orange-400 bg-clip-text text-transparent">
                    {' '}&amp; Gateway
                  </span>
                </span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:mt-6 sm:text-lg lg:mx-0">
                Accept crypto payments with hosted checkout, payment links, subscriptions, and invoices.
                Built-in fraud risk engine and compliance checks run in the background, so you and your users
                do not have to worry. Built-in chargebacks and refunds. Designed for developers and
                businesses from day one.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <TrackedLink
                  href={`${DASHBOARD_URL}/login`}
                  event="landing_signup_clicked"
                  properties={{ location: 'hero_primary' }}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5"
                >
                  Start now
                  <ArrowRight className="h-5 w-5" />
                </TrackedLink>
                <TrackedLink
                  href="mailto:business@noderails.com"
                  event="landing_contact_sales_clicked"
                  properties={{ location: 'hero_secondary' }}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-8 py-4 text-base font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50"
                >
                  Contact sales
                </TrackedLink>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-[13px] text-zinc-500 lg:justify-start">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-indigo-600" /> Chargebacks built-in
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-indigo-600" /> Non-custodial escrow
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-emerald-600" /> Multi-chain checkout
                </span>
              </div>
            </div>

            <div className="relative min-w-0 w-full">
              <HeroPreviewSwitcher />
            </div>
          </div>
        </div>

        <div className="relative pb-12 pt-2 sm:pb-16">
          <div className="mx-auto grid max-w-5xl gap-4 px-6 sm:grid-cols-3 sm:px-8 lg:px-12">
            {heroStats.map((stat) => (
              <div key={stat.title} className="nr-stat-card p-5 sm:p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                  <stat.icon className="h-5 w-5 text-indigo-600" aria-hidden />
                </div>
                <p className="text-[15px] font-bold leading-snug tracking-tight text-zinc-900">{stat.title}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{stat.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="nr-section py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
          <SectionHeader
            eyebrow="Complete Payment Stack"
            title="Everything you need to accept crypto, with real buyer protection"
            description="Payment links, hosted checkout, chargebacks, refunds, subscriptions, and invoicing, all settled directly to your wallet. No middlemen. One API."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {products.map((p) => (
              <div key={p.title} className={`nr-product-card p-6 ${p.span}`}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${p.color}`}>
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-[17px] font-bold tracking-tight text-zinc-900">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FiatRailsSection />

      {/* Risk & Compliance */}
      <section className="nr-section-muted overflow-visible py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Built-In Safety Layer"
                title="Inbuilt fraud risk engine and compliance checks"
                description="NodeRails continuously runs fraud scoring, wallet risk detection, sanctions screening, and compliance checks in the background, including KYC/KYB for virtual accounts and bank settlement rails. Your team and your users can focus on payments while risk controls run automatically."
                className="mb-8"
              />
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                  <Shield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Auto risk scoring</p>
                    <p className="text-sm text-zinc-600">
                      Every payment is evaluated in real time for suspicious behavior and anomalous patterns.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Compliance by default</p>
                    <p className="text-sm text-zinc-600">
                      Built-in checks and audit-ready traces reduce manual ops for both merchants and finance teams.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4">
                  <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  <div>
                    <p className="font-semibold text-zinc-900">Fiat rail screening</p>
                    <p className="text-sm text-zinc-600">
                      Virtual account creation and settle-to-bank payouts run through identity verification,
                      sanctions screening, and region-aware compliance before funds move.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden py-4 sm:overflow-visible sm:py-8">
              <ScreenshotFrame
                src="/screenshots/payment-details.png"
                alt="NodeRails payment detail showing fee breakdown, tax, and risk checks"
              />
              <div className="mt-4 flex flex-wrap gap-3 sm:mt-0">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm sm:absolute sm:bottom-2 sm:left-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Risk Engine</p>
                  <p className="text-sm font-medium text-emerald-900">Monitoring active</p>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm sm:absolute sm:top-2 sm:right-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Compliance</p>
                  <p className="text-sm font-medium text-indigo-900">Checks running</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WallCard */}
      <section id="wallcard" className="nr-section py-20 sm:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="nr-panel relative overflow-visible rounded-[2rem]">
            <div
              className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-[0.45] bg-[radial-gradient(rgb(239_68_68/0.04)_1px,transparent_1px)] bg-[size:22px_22px]"
              aria-hidden
            />

            <div className="relative px-5 py-11 sm:px-8 sm:py-12 lg:px-11 lg:py-14">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-7">
                  <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[13px] font-semibold text-red-600">
                    NodeRails Network
                  </span>

                  <h2 className="mt-6 text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
                    WallCard: pay with a card,{' '}
                    <span className="nr-wallcard-gradient-text">sign like a wallet</span>
                  </h2>

                  <p className="mt-6 text-[16px] leading-relaxed text-zinc-600">
                    <strong className="font-semibold text-zinc-900">NodeRails Network</strong> is the on-chain
                    acceptance layer for programmable money: shared policies, HTTPS APIs, and signatures that settle
                    on Solana and EVM.{' '}
                    <strong className="font-semibold text-zinc-900">WallCard</strong> is the wallet shoppers see at
                    checkout (card number, CVV, PIN, and OTP) instead of another browser extension.
                  </p>
                  <p className="mt-4 text-[15px] leading-relaxed text-zinc-600">
                    Your app keeps calling the same{' '}
                    <code className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-sm text-indigo-700">
                      provider.request
                    </code>{' '}
                    surface for Solana message signing and Ethereum typed data and sends. WallCard handles the card
                    flow and secure signer so keys never leave the secure environment.
                  </p>
                </div>

                <div className="relative flex justify-center overflow-visible py-6 lg:col-span-5 lg:justify-end">
                  <div
                    className="pointer-events-none absolute -inset-8 rounded-[32px] bg-red-500/[0.08] blur-2xl"
                    aria-hidden
                  />
                  <WallCardHeroCard className="relative w-full max-w-[400px]" />
                </div>
              </div>

              <div className="mt-14 grid gap-4 sm:grid-cols-3 lg:mt-16">
                {wallcardFeatures.map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 transition-all hover:border-red-200 hover:bg-white hover:shadow-[var(--shadow-card)]"
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[15px] font-semibold tracking-tight text-zinc-900">{item.title}</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center gap-4 sm:items-start">
                <TrackedLink
                  href={WALLCARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  event="landing_wallcard_cta_clicked"
                  properties={{ location: 'wallcard_section_primary' }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-10 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:-translate-y-0.5 sm:w-auto"
                >
                  <Fingerprint className="h-6 w-6 shrink-0 text-indigo-100" aria-hidden />
                  Explore WallCard &amp; NodeRails Network
                  <ArrowRight className="h-6 w-6 shrink-0" />
                </TrackedLink>
                <p className="text-center text-sm text-zinc-600 sm:text-left">
                  Live demo, SDK playground, and product details on{' '}
                  <span className="font-mono text-xs text-zinc-700">wallcard.noderails.com</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Developers */}
      <section id="developers" className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <SectionHeader
                eyebrow="Built for Developers & Businesses"
                title="Integrate crypto payments in minutes, not weeks"
                description="A clean REST API, production-ready SDK, pre-built checkout components, and comprehensive webhooks. Get chargeback and refund support out of the box."
                className="mb-8"
              />
              <ul className="mb-8 space-y-4">
                {[
                  'Any blockchain supported with one integration',
                  'Built-in chargebacks, refunds & dispute resolution',
                  'Hosted checkout, payment links & webhooks with HMAC',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="text-zinc-700">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/docs"
                  className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  Read the docs
                </a>
                <a
                  href="https://github.com/noderails"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  View on GitHub
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="nr-terminal">
                <div className="flex items-center border-b border-zinc-800 px-4 py-3">
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                  </div>
                  <div className="ml-4 font-mono text-xs text-zinc-500">create-payment-checkout.ts</div>
                </div>
                <div className="overflow-x-auto p-6">
                  <pre className="code-block text-sm leading-relaxed text-zinc-300">
                    <span className="text-purple-400">import</span> NodeRails{' '}
                    <span className="text-purple-400">from</span>{' '}
                    <span className="text-green-300">&apos;noderails-node&apos;</span>;{'\n'}
                    <span className="text-zinc-500">// Initialize with your secret key</span>{'\n'}
                    <span className="text-purple-400">const</span> noderails{' '}
                    <span className="text-purple-400">=</span>{' '}
                    <span className="text-purple-400">new</span>{' '}
                    <span className="text-blue-400">NodeRails</span>(
                    <span className="text-green-300">&apos;sk_live_...&apos;</span>);{'\n'}
                    <span className="text-zinc-500">// Create a hosted payment checkout session</span>{'\n'}
                    <span className="text-purple-400">const</span> checkout{' '}
                    <span className="text-purple-400">=</span>{' '}
                    <span className="text-purple-400">await</span> noderails.checkoutSessions.
                    <span className="text-blue-400">create</span>({'{'}
                    {'\n  '}mode: <span className="text-green-300">&quot;payment&quot;</span>,{'\n  '}amount:{' '}
                    <span className="text-orange-400">&quot;49.99&quot;</span>,{'\n  '}currency:{' '}
                    <span className="text-green-300">&quot;USD&quot;</span>,{'\n  '}successUrl:{' '}
                    <span className="text-green-300">&quot;https://app.com/success&quot;</span>,{'\n  '}cancelUrl:{' '}
                    <span className="text-green-300">&quot;https://app.com/cancel&quot;</span>,{'\n'}
                    {'}'});{'\n'}
                    <span className="text-zinc-500">// Redirect customer to hosted checkout URL</span>{'\n'}
                    console.<span className="text-blue-400">log</span>(checkout.checkoutUrl);
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 text-center sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="Platform"
            title="Your wallet. Your payments. No middlemen."
            description="NodeRails handles multi-chain payment routing, chargebacks, and refunds with a single integration for your business."
            className="mx-auto"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { value: 'Multi-Chain', label: 'Blockchain Support' },
              { value: '99.99%', label: 'Uptime SLA' },
              { value: '1%', label: 'Per Transaction Fee' },
            ].map((m) => (
              <div key={m.label} className="nr-metric-cell p-6 text-center">
                <p className="text-3xl font-black tracking-tight text-zinc-900">{m.value}</p>
                <p className="mt-2 text-[15px] font-semibold text-zinc-700">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 overflow-visible">
            <ScreenshotFrame
              src="/screenshots/dashboard-overview.png"
              alt="NodeRails dashboard showing payment stats, networks, and wallet balances"
            />
          </div>
        </div>
      </section>

      {/* Merchants */}
      <section className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            eyebrow="For Merchants & Businesses"
            title="Everything merchants need. Zero friction."
            description="Create a complete payment experience for your customers with payment links, checkout sessions, subscriptions, and invoices, all powered by crypto and settled directly to your wallet."
          />

          <MerchantsCollage />

          <div className="mt-12 text-center">
            <TrackedLink
              href={`${DASHBOARD_URL}/login`}
              event="landing_merchants_clicked"
              properties={{ location: 'humans_section' }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:-translate-y-0.5"
            >
              Start Accepting Payments
              <ArrowRight className="h-5 w-5" />
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Built for AI & Agents"
                title="Agent-to-Agent Payments Made Simple"
                description="Launch agent crypto cards and create seamless payment layers for autonomous systems. Enable gasless agent-to-agent transactions with built-in settlement and dispute resolution."
                className="mb-8"
              />
              <ul className="mb-8 space-y-4">
                {[
                  'Gasless agent-to-agent payments',
                  'Agent crypto card infrastructure',
                  'Automated dispute resolution',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                    <span className="text-zinc-700">{item}</span>
                  </li>
                ))}
              </ul>
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_agents_clicked"
                properties={{ location: 'agents_section' }}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:-translate-y-0.5"
              >
                Enable Agents
                <ArrowRight className="h-5 w-5" />
              </TrackedLink>
            </div>

            <AgentsHeroIllustration className="mx-auto w-full max-w-xl" />
          </div>
        </div>
      </section>

      {/* Payouts */}
      <section className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            eyebrow="Fast & Reliable Payouts"
            title="Multi-Chain, Multi-Recipient Payouts in Seconds"
            description="Send payments to thousands of recipients across multiple blockchains simultaneously. Perfect for rewards, bounties, referrals, and team payouts."
          />

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { value: '1000+', label: 'Recipients Per Batch', hint: 'Pay unlimited recipients in a single transaction' },
              { value: '<30s', label: 'Settlement Time', hint: 'Fast on-chain settlement with instant confirmation' },
              { value: 'Multi-Chain', label: 'Blockchain Compatible', hint: 'Works across multiple blockchains and networks' },
            ].map((m) => (
              <div key={m.label} className="nr-metric-cell p-8 text-center">
                <p className="text-4xl font-black tracking-tight text-zinc-900">{m.value}</p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-zinc-600">{m.label}</p>
                <p className="mt-2 text-sm text-zinc-500">{m.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-12 border-t border-zinc-200 pt-12 md:grid-cols-2">
            <div>
              <h4 className="mb-6 text-xl font-bold text-zinc-900">Perfect For:</h4>
              <ul className="space-y-3">
                {[
                  'Team payroll and salary distribution',
                  'Bounty and reward programs',
                  'Referral commissions and affiliate payouts',
                  'Liquidity mining rewards and airdrops',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-zinc-600">
                    <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-6 text-xl font-bold text-zinc-900">Features:</h4>
              <ul className="space-y-3">
                {[
                  'CSV batch file support for easy uploading',
                  'Real-time payout status tracking',
                  'Automatic retry on failed transactions',
                  'Compliance and audit logs included',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-zinc-600">
                    <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 text-center">
            <TrackedLink
              href={`${DASHBOARD_URL}/login`}
              event="landing_payouts_clicked"
              properties={{ location: 'payouts_section' }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:-translate-y-0.5"
            >
              Start Payouts
              <ArrowRight className="h-5 w-5" />
            </TrackedLink>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="Pricing"
            title="Simple, transparent pricing"
            description="Simple, transparent pricing with plans that scale as you grow."
            className="mx-auto"
          />

          <div className="grid gap-6 text-left md:grid-cols-3">
            <div className="nr-panel border-indigo-200 p-8 ring-2 ring-indigo-100">
              <p className="mb-3 text-sm font-semibold text-indigo-600">Introductory Offer</p>
              <p className="text-5xl font-extrabold text-zinc-900">1%</p>
              <p className="mt-2 text-sm text-zinc-500">per successful transaction</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Hosted checkout and payment links</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Refunds and chargebacks</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-indigo-600" /> Webhooks and dashboard analytics</li>
              </ul>
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_signup_clicked"
                properties={{ location: 'pricing_intro_card' }}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </div>

            <div className="nr-panel p-8">
              <p className="mb-3 text-sm font-semibold text-zinc-700">Normal Pricing</p>
              <p className="text-5xl font-extrabold text-zinc-900">2%</p>
              <p className="mt-2 text-sm text-zinc-500">per successful transaction</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Everything in Introductory</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Subscriptions and invoice workflows</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-zinc-700" /> Priority support queue</li>
              </ul>
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_signup_clicked"
                properties={{ location: 'pricing_normal_card' }}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
              >
                Choose Plan <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </div>

            <div className="nr-panel p-8">
              <p className="mb-3 text-sm font-semibold text-amber-700">Enterprise</p>
              <p className="text-3xl font-extrabold text-zinc-900">Negotiate</p>
              <p className="mt-2 text-sm text-zinc-500">custom pricing and support</p>
              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Custom commercial terms</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Dedicated onboarding and SLA</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-amber-700" /> Architecture and migration support</li>
              </ul>
              <TrackedLink
                href="/docs"
                event="landing_docs_clicked"
                properties={{ location: 'pricing_enterprise_card' }}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              >
                Talk to Us <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="nr-section-muted py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12">
          <SectionHeader
            align="center"
            eyebrow="FAQ"
            title="Frequently asked questions"
            description="Everything merchants and users ask us before going live."
            className="mx-auto"
          />

          <div className="space-y-3">
            {[
              {
                q: 'Are you compliant?',
                a: 'Yes, compliance and safety are core to how NodeRails is built. We are focused on delivering the true essence of blockchain: decentralization and control for both merchants and users. NodeRails is non-custodial and acts as a technology layer for payments, not a custody holder, so funds remain controlled by contract rules and wallet ownership. We run AML screening and fraud checks behind the scenes, and we make global payments much easier to start than the traditional multi-step setup flow merchants face with legacy gateways.',
              },
              {
                q: 'Are my funds safe?',
                a: 'Yes. Funds are secured in NodeRails escrow smart contracts with timelocks enforced on-chain. Once a payment is captured, that means funds are locked for that payment flow and are intended for you as the merchant. They are 100% going to your wallet unless a user raises a dispute and wins. If no dispute is raised (or if merchant wins), funds settle automatically to your wallet. And even if our server is delayed for any reason, you can still call settle directly on the smart contract. We cannot stop valid settlement from reaching your wallet. Funds can only go to merchant or user, no other party.',
              },
              {
                q: 'Do subscriptions really work?',
                a: 'Yes. Subscriptions work similar to fiat recurring billing: users are charged automatically on the configured schedule (monthly, yearly, or custom cycle). NodeRails handles recurring charge orchestration and lifecycle events so you can focus on your product, not billing operations.',
              },
              {
                q: 'How does the dispute mechanism work?',
                a: 'The lifecycle is: Authorize -> Capture -> Dispute -> Settle. Capture means funds are secured for this payment and on the path to merchant settlement. Users get receipts with an "open dispute" link and can also raise disputes from the NodeRails dispute portal during the dispute window. If a user does not raise a dispute, settlement happens automatically to merchant wallet. If a dispute is raised, outcome decides merchant vs user. If user loses, funds settle to merchant. If user wins, funds return to user. Also, if auto-settlement is delayed for any reason, settlement can be triggered on-chain directly. We cannot block rightful settlement.',
              },
              {
                q: 'How do I get onboarded?',
                a: 'Onboarding is fast. Sign up, create your account (individual or business), create your app, and start accepting payments. You can test safely on test networks before going to production.',
              },
              {
                q: 'The chain I need is not listed. What should I do?',
                a: `We are actively adding more chains and network capabilities. If you need a specific chain prioritized, send us a request through the portal or message us on Telegram or Discord.`,
              },
            ].map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-zinc-200 bg-white px-6 py-5 open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold text-zinc-900">
                  {item.q}
                  <span className="text-zinc-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-4 leading-relaxed text-zinc-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SupportedBy />
      <InteractiveDemo />

      {/* CTA */}
      <section className="nr-section py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="nr-cta-panel p-10 text-center sm:p-14">
            <h2 className="text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl">
              Ready to accept crypto payments?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-zinc-600">
              Start accepting payments directly to your wallet in minutes. No middlemen. Full chargeback and refund
              support built in.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_signup_clicked"
                properties={{ location: 'final_cta_primary' }}
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Create account
              </TrackedLink>
              <TrackedLink
                href="/docs"
                event="landing_docs_clicked"
                properties={{ location: 'final_cta_secondary' }}
                className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-8 py-3 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Read the docs
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-zinc-50 pt-16 pb-12">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-2 lg:grid-cols-5 sm:px-8 lg:px-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <NodeRailsLogo withText className="mb-3 h-auto w-[200px]" />
            <p className="max-w-xs text-[13px] leading-relaxed text-zinc-600">
              A product of Maartandrise International Ventures Private Limited
            </p>
            <p className="mt-4 text-xs text-zinc-400">&copy; {new Date().getFullYear()} All rights reserved.</p>
            <div className="mt-4 flex items-center gap-4">
              <a href={X_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Twitter">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
              </a>
              <a href="https://github.com/noderails" target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="GitHub">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
              </a>
              <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="LinkedIn">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 7.02c1.08 0 1.75-.71 1.75-1.6-.02-.91-.67-1.6-1.73-1.6-1.06 0-1.75.69-1.75 1.6 0 .89.67 1.6 1.71 1.6h.02ZM20.44 13.43c0-3.43-1.83-5.03-4.27-5.03-1.97 0-2.85 1.09-3.35 1.85v-1.59H9.44c.04 1.05 0 11.34 0 11.34h3.38v-6.34c0-.34.02-.67.12-.92.27-.67.88-1.36 1.9-1.36 1.34 0 1.88 1.03 1.88 2.55V20h3.38v-6.57Z"/></svg>
              </a>
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Telegram">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.47 4.35a1 1 0 0 0-1.06-.16L2.89 11.18a1 1 0 0 0 .09 1.88l4.27 1.36 1.6 5.08a1 1 0 0 0 1.71.36l2.38-2.44 4.66 3.43a1 1 0 0 0 1.58-.59l2.5-14.78a1 1 0 0 0-.21-.83ZM9.04 14.28l8.6-6.18-6.87 7.09-.44 2.43-1.29-3.34Z"/></svg>
              </a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-600" aria-label="Discord">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Products</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/products/payments" className="hover:text-zinc-900">Payments</a></li>
              <li><a href="/products/checkout" className="hover:text-zinc-900">Checkout</a></li>
              <li><a href="/products/payment-links" className="hover:text-zinc-900">Payment Links</a></li>
              <li><a href="/products/subscriptions" className="hover:text-zinc-900">Subscriptions</a></li>
              <li><a href="/products/invoicing" className="hover:text-zinc-900">Invoicing</a></li>
              <li><a href={WALLCARD_URL} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900">WallCard</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Resources</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/docs" className="hover:text-zinc-900">Guides</a></li>
              <li><a href="/blog" className="hover:text-zinc-900">Blog</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Developers</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/docs" className="hover:text-zinc-900">Documentation</a></li>
              <li><a href="/docs/api-reference/checkout-sessions" className="hover:text-zinc-900">API Reference</a></li>
              <li><a href="/docs/sdk" className="hover:text-zinc-900">SDKs</a></li>
              <li><a href="https://github.com/noderails" className="hover:text-zinc-900">GitHub</a></li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Company</p>
            <ul className="mt-3 space-y-2 text-[13px] text-zinc-600">
              <li><a href="/about" className="hover:text-zinc-900">About</a></li>
              <li>
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  LinkedIn
                </a>
              </li>
              <li><a href="/privacy" className="hover:text-zinc-900">Privacy</a></li>
              <li><a href="/terms" className="hover:text-zinc-900">Terms</a></li>
              <li>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  Telegram
                </a>
              </li>
              <li>
                <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900">
                  Discord Community
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-7xl px-6 sm:px-8 lg:px-12">
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-4 text-center shadow-sm">
            <div className="text-sm font-medium text-zinc-700">For queries and partnerships, reach out:</div>
            <a href="mailto:business@noderails.com" className="text-base font-semibold text-indigo-700 hover:underline">
              business@noderails.com
            </a>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-zinc-200 px-6 pt-8 text-xs text-zinc-500 sm:flex-row sm:px-8 lg:px-12">
          <p className="text-center sm:text-left">
            NodeRails is a product of Maartandrise International Ventures Pvt. Ltd. Payments are settled directly to
            merchant wallets.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900" aria-label="Discord">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
            </a>
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-zinc-900" aria-label="Telegram">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M21.47 4.35a1 1 0 0 0-1.06-.16L2.89 11.18a1 1 0 0 0 .09 1.88l4.27 1.36 1.6 5.08a1 1 0 0 0 1.71.36l2.38-2.44 4.66 3.43a1 1 0 0 0 1.58-.59l2.5-14.78a1 1 0 0 0-.21-.83ZM9.04 14.28l8.6-6.18-6.87 7.09-.44 2.43-1.29-3.34Z"/></svg>
            </a>
            <a href="/terms" className="hover:text-zinc-900">Terms &amp; Conditions</a>
            <a href="/privacy" className="hover:text-zinc-900">Privacy Policy</a>
          </div>
        </div>
      </footer>

      <FeedbackWidget />
    </div>
  );
}
