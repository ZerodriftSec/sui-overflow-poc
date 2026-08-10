import type { Metadata } from 'next';
import { ArrowRight, Check, ShieldCheck, Zap, Palette, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Hosted Checkout | NodeRails',
  description: 'A pre-built, conversion-optimised crypto checkout page. Embed it or redirect, your customers pay in seconds.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function CheckoutPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-purple-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-purple-600 font-semibold text-sm uppercase tracking-wide mb-3">Checkout</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              A hosted checkout that converts
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Skip building your own payment page. Create a checkout session via the API and redirect your customer to a fully managed, mobile-ready payment experience powered by NodeRails.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-lg"
              >
                Try Checkout <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs/api-reference/checkout-sessions"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                API Reference
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
            <img
              src="/screenshots/checkout.png"
              alt="NodeRails hosted checkout with payment review, wallet authorization, and smart contract security"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How it works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Three steps to accept your first payment. No frontend work required.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              step="1"
              title="Create a session"
              description="Call the API to create a checkout session with the amount, currency, and return URL. You get back a hosted checkout URL."
            />
            <StepCard
              step="2"
              title="Redirect your customer"
              description="Send the customer to the checkout URL. They connect their wallet, see the breakdown, and confirm the payment on-chain."
            />
            <StepCard
              step="3"
              title="Get notified"
              description="We send a webhook when the payment is captured and settled. Funds land directly in your merchant wallet."
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Built for conversion</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                The checkout page is optimised for a clean, distraction-free payment experience. Customers see the exact amount, choose their chain, connect their wallet, and pay. Nothing extra.
              </p>
              <ul className="space-y-4">
                <FeatureItem icon={Globe} text="Supports all blockchains configured in your dashboard" />
                <FeatureItem icon={Zap} text="Fast transaction confirmation with real-time status updates" />
                <FeatureItem icon={ShieldCheck} text="Built-in fraud scoring and risk checks before settlement" />
                <FeatureItem icon={Palette} text="Branded receipt emails sent automatically to customers" />
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/payment-transactions.png"
                alt="Payment lifecycle timeline showing capture and settlement transactions"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Dispute protection */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3 mb-12 lg:mb-0 order-2 lg:order-1">
              <img
                src="/screenshots/payment-receipt.png"
                alt="Payment receipt email with dispute option"
                className="w-full h-auto rounded-2xl"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Buyer protection included</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                After every successful payment, your customer receives a receipt email with the option to open a dispute. The entire chargeback and refund flow is handled through on-chain escrow, no manual work for you.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600" /> Automatic receipt emails after payment</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600" /> On-chain dispute resolution via escrow</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-purple-600" /> Refunds triggered from dashboard or API</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Launch your checkout in minutes
          </h2>
          <p className="text-lg text-purple-100 mb-10">One API call to create a session. One redirect to collect payment. That&apos;s it.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-purple-600 bg-white hover:bg-purple-50 transition-colors shadow-lg"
          >
            Get Started Free <ArrowRight className="h-5 w-5 ml-2" />
          </a>
        </div>
      </section>
    </>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center mx-auto mb-4">
        {step}
      </div>
      <h3 className="font-semibold text-slate-900 text-lg mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
      <p className="text-slate-700">{text}</p>
    </div>
  );
}
