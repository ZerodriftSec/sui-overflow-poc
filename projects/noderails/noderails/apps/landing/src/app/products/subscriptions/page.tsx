import type { Metadata } from 'next';
import { ArrowRight, Check, RefreshCcw, CalendarClock, CreditCard, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Subscriptions | NodeRails',
  description: 'Recurring crypto billing with automatic charge cycles. Create product plans and manage subscribers from your dashboard.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function SubscriptionsPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-pink-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-pink-600 font-semibold text-sm uppercase tracking-wide mb-3">Subscriptions</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Recurring crypto billing, simplified
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Create product plans with custom billing cycles. Customers subscribe with a one-time wallet authorization, and charges run automatically. Manage everything from your dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-pink-600 hover:bg-pink-700 transition-colors shadow-lg"
              >
                Set Up Subscriptions <ArrowRight className="h-5 w-5 ml-2" />
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
              src="/screenshots/subscriptions.png"
              alt="Subscriptions list with active subscribers and plan details"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Everything for recurring revenue</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">From plan creation to automatic billing to subscriber management, all in one place.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard icon={CreditCard} title="Product plans" description="Create plans with fixed or custom amounts, billing intervals, and trial periods." />
            <FeatureCard icon={RefreshCcw} title="Auto billing" description="Charges run automatically on each billing cycle. No manual intervention needed." />
            <FeatureCard icon={CalendarClock} title="Billing timeline" description="Track every charge, invoice, and billing event in a detailed subscription timeline." />
            <FeatureCard icon={Users} title="Subscriber management" description="View active, paused, and cancelled subscribers. Manage from the dashboard or API." />
          </div>
        </div>
      </section>

      {/* Product Plans Screenshot */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Create product plans in seconds</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Define your product plans with pricing, billing frequency, and description. Each plan gets its own subscription page that customers use to sign up.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Monthly, weekly, or custom billing intervals</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Multiple plans per product</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Plan status management (active/archived)</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/product-plans.png"
                alt="Product plans configuration with subscription types and pricing"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Details Screenshot */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3 mb-12 lg:mb-0 order-2 lg:order-1">
              <img
                src="/screenshots/subscription-details.png"
                alt="Subscription detail view with billing cycle, invoices, and timeline"
                className="w-full h-auto rounded-2xl"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Full visibility into every subscription</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Drill into any subscription to see the wallet authorization, billing cycle, past invoices, and a complete timeline of events, from creation to each renewal.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Wallet authorization and approval details</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Invoice history with payment status</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-pink-600" /> Event timeline for audit and support</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-pink-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Start collecting recurring revenue
          </h2>
          <p className="text-lg text-pink-100 mb-10">Create your first plan and have subscribers paying in minutes.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-pink-600 bg-white hover:bg-pink-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-pink-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
