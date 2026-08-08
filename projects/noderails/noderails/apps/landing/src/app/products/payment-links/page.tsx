import type { Metadata } from 'next';
import { ArrowRight, Check, Link2, Share2, BarChart3, Zap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Payment Links | NodeRails',
  description: 'Generate shareable payment links for any amount. Share via email, chat, or embed on your site. One click to pay.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function PaymentLinksPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-wide mb-3">Payment Links</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Accept payments without writing code
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Create a payment link from your dashboard and share it anywhere. Email, social media, chat, or embed it on your website. Your customer clicks, connects their wallet, and pays.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg"
              >
                Create a Payment Link <ArrowRight className="h-5 w-5 ml-2" />
              </a>
              <a
                href="/docs"
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Learn More
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
            <img
              src="/screenshots/payment-links.png"
              alt="Payment links dashboard showing active links with URLs and usage stats"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* Why Payment Links */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">The simplest way to get paid in crypto</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">No coding, no checkout integration. Create a link, share it, and get paid.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={Link2}
              title="One-click creation"
              description="Set the amount and description, click create. Your payment link is live instantly."
            />
            <FeatureCard
              icon={Share2}
              title="Share anywhere"
              description="Copy the link and send it via email, tweet, Telegram message, or embed it in your website."
            />
            <FeatureCard
              icon={BarChart3}
              title="Track usage"
              description="See how many times each link has been used, total amount collected, and payment status."
            />
            <FeatureCard
              icon={Zap}
              title="Instant payouts"
              description="Payments from links settle directly to your merchant wallet, just like any other payment."
            />
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Perfect for every use case</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Whether you&apos;re a freelancer collecting payment, a business selling one-off items, or a creator accepting tips, payment links work for everyone.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600" /> Freelancers and consultants collecting project payments</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600" /> E-commerce stores providing direct payment options</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600" /> Content creators accepting donations and tips</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-blue-600" /> Service providers sending payment requests via email</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/dashboard-overview.png"
                alt="Dashboard overview showing payment stats and wallet balances"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-blue-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Create your first payment link
          </h2>
          <p className="text-lg text-blue-100 mb-10">Takes less than 30 seconds. No code required.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-blue-600 bg-white hover:bg-blue-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-blue-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
