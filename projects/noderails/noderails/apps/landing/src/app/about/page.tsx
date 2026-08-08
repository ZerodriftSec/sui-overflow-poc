import type { Metadata } from 'next';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { FeedbackWidget } from '@/components/feedback-widget';
import { ChevronRight, Shield, Handshake, Lock, Globe, Zap, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About | NodeRails',
  description:
    'NodeRails is a non-custodial crypto payment infrastructure company. We build tools that let businesses accept crypto payments without ever holding customer funds.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';
const X_URL = 'https://x.com/noderails';
const LINKEDIN_URL = 'https://www.linkedin.com/company/noderails';
const TELEGRAM_URL = 'https://t.me/+fzUTcAYr-zhhZjg1';
const DISCORD_URL = 'https://discord.gg/8uwSfv9Tvk';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <a href="/">
                <NodeRailsLogo withText className="w-[220px] h-auto" />
              </a>
            </div>

            <div className="hidden md:flex space-x-8">
              <a href="/#products" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Products</a>
              <a href="/#developers" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Developers</a>
              <a href="/#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Pricing</a>
              <a href="/docs" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Docs</a>
            </div>

            <div className="flex items-center gap-4">
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="landing_login_clicked"
                properties={{ location: 'about_page_nav' }}
                className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Merchant Login
                <ChevronRight className="h-4 w-4 ml-1" />
              </TrackedLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        {/* Hero */}
        <section className="py-24 lg:py-32 bg-gradient-to-b from-slate-50/80 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-indigo-600 font-semibold text-sm uppercase tracking-wide mb-3">About NodeRails</p>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
                Non-custodial crypto payments for the real world
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed">
                NodeRails builds payment infrastructure that lets businesses accept crypto without intermediaries holding their funds. Every payment flows through audited smart contracts, giving merchants and buyers complete transparency and control.
              </p>
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                  Why we built NodeRails
                </h2>
                <div className="space-y-4 text-slate-600 leading-relaxed">
                  <p>
                    Accepting crypto payments should not require trusting a third party with your funds. Traditional payment processors take custody of merchant funds, introduce settlement delays, and add counterparty risk. We believe there is a better way.
                  </p>
                  <p>
                    NodeRails was built to give businesses the same polished payment experience they expect from traditional processors, but powered by smart contracts that keep funds in the merchant&apos;s control at all times. No custodial wallets, no IOUs, no waiting for settlement.
                  </p>
                  <p>
                    We work with blockchain networks, wallet providers, and ecosystem partners to make crypto payments accessible to every business, regardless of their technical background.
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-3xl p-10">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Our principles</h3>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Lock className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-1">Non-custodial by design</h4>
                      <p className="text-sm text-slate-600">We never hold merchant or buyer funds. All payments are routed through on-chain smart contracts.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Shield className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-1">Transparency first</h4>
                      <p className="text-sm text-slate-600">Every transaction is verifiable on-chain. Merchants and buyers can audit payment flows at any time.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Handshake className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-1">Partner-driven ecosystem</h4>
                      <p className="text-sm text-slate-600">We collaborate with chains, wallets, and service providers to bring the best payment experience to every blockchain.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works (non-custodial) */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How our non-custodial model works</h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Payments flow directly from buyer to merchant through smart contracts. NodeRails orchestrates the process but never touches the funds.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-8">
              {[
                {
                  step: '01',
                  title: 'Merchant creates a payment',
                  description: 'The merchant integrates with our API or dashboard to generate a checkout session for their customer.',
                },
                {
                  step: '02',
                  title: 'Buyer authorizes on-chain',
                  description: 'The buyer reviews the payment details and authorizes the transaction directly from their wallet.',
                },
                {
                  step: '03',
                  title: 'Smart contract executes',
                  description: 'Our audited escrow contracts handle the fund transfer, fee deduction, and settlement in a single atomic transaction.',
                },
                {
                  step: '04',
                  title: 'Merchant receives funds',
                  description: 'Funds arrive in the merchant&apos;s wallet immediately. No delays, no custodial intermediary.',
                },
              ].map((item) => (
                <div key={item.step} className="relative">
                  <div className="text-5xl font-bold text-indigo-100 mb-4">{item.step}</div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What makes us different */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Built differently</h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                NodeRails is not another custodial gateway. Here is how we compare.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Globe,
                  title: 'Multi-chain from day one',
                  description:
                    'We deploy to every blockchain our merchants need. One integration gives you access to payments across multiple networks and tokens.',
                },
                {
                  icon: Zap,
                  title: 'Instant settlement',
                  description:
                    'No T+2, no batched payouts. Funds settle to the merchant wallet the moment the on-chain transaction confirms.',
                },
                {
                  icon: Shield,
                  title: 'Smart contract security',
                  description:
                    'Payments, escrows, and dispute resolution are handled by audited smart contracts, not centralized servers that can be compromised.',
                },
                {
                  icon: Users,
                  title: 'Built for teams',
                  description:
                    'A full merchant dashboard with role-based access, analytics, customer management, and payment lifecycle tracking.',
                },
                {
                  icon: Handshake,
                  title: 'Partner integrations',
                  description:
                    'We work closely with blockchain foundations, wallet providers, and compliance partners to ensure a seamless experience across the ecosystem.',
                },
                {
                  icon: Lock,
                  title: 'Buyer protection',
                  description:
                    'On-chain dispute resolution and escrow mechanisms protect buyers while giving merchants the tools to respond and resolve issues.',
                },
              ].map((feature) => (
                <div key={feature.title} className="bg-slate-50 rounded-2xl p-8">
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-5">
                    <feature.icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partners section */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Working with the ecosystem
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                NodeRails partners with blockchain networks, wallet providers, and infrastructure companies to deliver reliable payment experiences. We believe the best products are built through collaboration, not isolation.
              </p>
              <p className="text-slate-600 leading-relaxed">
                If you are a blockchain, wallet, or service provider interested in bringing better payment experiences to your users, we would love to work with you.
              </p>
              <div className="mt-10">
                <a
                  href="mailto:business@noderails.com"
                  className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg"
                >
                  Partner with us
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Company info */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                The company
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-4">
                NodeRails is built by Maartandrise International Ventures Pvt. Ltd. We are a team of engineers and product builders focused on making crypto payments practical for real businesses.
              </p>
              <p className="text-slate-600 leading-relaxed">
                We are building in public and ship fast. Follow our journey and reach out if you want to be part of what we are building.
              </p>
              <div className="flex items-center justify-center gap-6 mt-10">
                <a href={X_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
                </a>
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 7.02c1.08 0 1.75-.71 1.75-1.6-.02-.91-.67-1.6-1.73-1.6-1.06 0-1.75.69-1.75 1.6 0 .89.67 1.6 1.71 1.6h.02ZM20.44 13.43c0-3.43-1.83-5.03-4.27-5.03-1.97 0-2.85 1.09-3.35 1.85v-1.59H9.44c.04 1.05 0 11.34 0 11.34h3.38v-6.34c0-.34.02-.67.12-.92.27-.67.88-1.36 1.9-1.36 1.34 0 1.88 1.03 1.88 2.55V20h3.38v-6.57Z"/></svg>
                </a>
                <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
                </a>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-gradient-to-r from-indigo-600 to-indigo-700">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Ready to accept crypto payments?</h2>
            <p className="text-lg text-indigo-100 mb-8 max-w-2xl mx-auto">
              Get started in minutes. No custodial risk, no complex integrations, just payments that work.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <TrackedLink
                href={`${DASHBOARD_URL}/login`}
                event="about_cta_clicked"
                properties={{ location: 'about_bottom_cta' }}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-indigo-600 bg-white hover:bg-indigo-50 transition-colors shadow-lg"
              >
                Create Your Account
              </TrackedLink>
              <a
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
              >
                Read the Docs
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <NodeRailsLogo withText className="w-[160px] h-auto brightness-200" />
              <p className="mt-4 text-sm text-slate-500">
                Crypto payment infrastructure for modern businesses.
              </p>
              <div className="flex items-center gap-4 mt-4">
                <a href={X_URL} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
                </a>
                <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 7.02c1.08 0 1.75-.71 1.75-1.6-.02-.91-.67-1.6-1.73-1.6-1.06 0-1.75.69-1.75 1.6 0 .89.67 1.6 1.71 1.6h.02ZM20.44 13.43c0-3.43-1.83-5.03-4.27-5.03-1.97 0-2.85 1.09-3.35 1.85v-1.59H9.44c.04 1.05 0 11.34 0 11.34h3.38v-6.34c0-.34.02-.67.12-.92.27-.67.88-1.36 1.9-1.36 1.34 0 1.88 1.03 1.88 2.55V20h3.38v-6.57Z"/></svg>
                </a>
                <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.32 4.37A18.2 18.2 0 0 0 15.78 3c-.2.36-.43.84-.59 1.22a16.9 16.9 0 0 0-5.38 0A12.7 12.7 0 0 0 9.22 3c-1.6.27-3.12.74-4.54 1.37C1.8 8.65 1.02 12.83 1.4 16.95c1.9 1.4 3.74 2.24 5.55 2.79.45-.62.85-1.27 1.2-1.96-.66-.24-1.3-.53-1.9-.86.16-.12.31-.24.46-.37 3.67 1.72 7.67 1.72 11.3 0 .15.13.3.25.46.37-.6.34-1.24.62-1.9.86.35.69.75 1.34 1.2 1.96 1.81-.55 3.65-1.4 5.55-2.79.45-4.78-.76-8.91-3.68-12.58ZM9 14.44c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Zm6 0c-1.1 0-2-.98-2-2.18 0-1.2.88-2.18 2-2.18 1.12 0 2 .98 2 2.18 0 1.2-.88 2.18-2 2.18Z"/></svg>
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Products</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/products/payments" className="hover:text-white transition-colors">Payments</a></li>
                <li><a href="/products/checkout" className="hover:text-white transition-colors">Checkout</a></li>
                <li><a href="/products/payment-links" className="hover:text-white transition-colors">Payment Links</a></li>
                <li><a href="/products/subscriptions" className="hover:text-white transition-colors">Subscriptions</a></li>
                <li><a href="/products/invoicing" className="hover:text-white transition-colors">Invoicing</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Developers</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/docs" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="/docs/api-reference/checkout-sessions" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="https://github.com/noderails" className="hover:text-white transition-colors">GitHub</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="/about" className="hover:text-white transition-colors">About</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Maartandrise International Ventures Pvt. Ltd. All rights reserved.
          </div>
        </div>
      </footer>
      <FeedbackWidget />
    </div>
  );
}
