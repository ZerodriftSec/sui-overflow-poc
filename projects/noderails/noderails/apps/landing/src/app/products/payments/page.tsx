import type { Metadata } from 'next';
import { ArrowRight, Check, CreditCard, BarChart3, Globe, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Crypto Payments | NodeRails',
  description: 'Accept crypto payments across multiple blockchains. Real-time tracking, automatic settlement, and full payment lifecycle management.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function PaymentsPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-indigo-600 font-semibold text-sm uppercase tracking-wide mb-3">Payments</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Accept crypto payments on any blockchain
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Accept stablecoins and tokens across multiple blockchains. Payments settle directly to your wallet with full lifecycle tracking.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg"
              >
                Start Accepting Payments <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Read the Docs
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
            <img
              src="/screenshots/dashboard-overview.png"
              alt="NodeRails payment dashboard showing real-time stats, payments by network, and wallet balances"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything you need to manage payments</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">From accepting the first payment to settling funds, every step is tracked, transparent, and under your control.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={Globe}
              title="Multi-chain support"
              description="One integration covers all supported blockchains. Add new networks from your dashboard settings."
            />
            <FeatureCard
              icon={BarChart3}
              title="Real-time analytics"
              description="Track payments by chain, token, and status. See revenue breakdown and customer activity instantly."
            />
            <FeatureCard
              icon={Shield}
              title="Built-in risk engine"
              description="Every transaction runs through fraud scoring, wallet risk checks, and sanctions screening automatically."
            />
            <FeatureCard
              icon={CreditCard}
              title="Direct settlement"
              description="Funds settle directly to your merchant wallet. Non-custodial by design, we never hold your funds."
            />
          </div>
        </div>
      </section>

      {/* Screenshot: Payments List */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Track every payment in real time</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                View all incoming payments in a single dashboard. Filter by status, chain, or token. Click into any payment for a full breakdown of fees, taxes, and transaction details.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> Status filters: Created, Captured, Settled, Refunded</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> One-click export for accounting</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> Customer and payment detail drill-down</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/payments-list.png"
                alt="Payments list with status filters and search"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot: Payment Details & Transactions */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3 mb-12 lg:mb-0 order-2 lg:order-1">
              <img
                src="/screenshots/payment-details.png"
                alt="Payment detail panel showing fee breakdown and tax"
                className="w-full h-auto rounded-2xl"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Full payment lifecycle visibility</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Every payment shows a complete timeline from creation to capture to settlement. See exact fee breakdowns, tax amounts, the on-chain transaction hashes, and the customer who made the payment.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> Platform fee and tax breakdown</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> On-chain transaction hashes with block explorer links</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-indigo-600" /> Payment timeline for audit trail</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot: Customers */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Know your customers</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Every payment is linked to a customer profile. View billing addresses, payment history, and total spend, all from a single panel in your dashboard.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/customers.png"
                alt="Customer list with detail panel showing billing and payment history"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-indigo-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Start accepting crypto payments today</h2>
          <p className="text-lg text-indigo-100 mb-10">No integration headaches. Go live in minutes with our hosted checkout or API.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-indigo-600 bg-white hover:bg-indigo-50 transition-colors shadow-lg"
          >
            Get Started Free <ArrowRight className="h-5 w-5 ml-2" />
          </a>
        </div>
      </section>
    </>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6">
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
