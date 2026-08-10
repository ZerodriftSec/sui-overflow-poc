import type { Metadata } from 'next';
import { ArrowRight, Check, FileText, Mail, Calculator, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Invoicing | NodeRails',
  description: 'Send professional crypto invoices with line items, tax handling, and one-click payment. Customers pay directly from the invoice email.',
};

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

export default function InvoicingPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-emerald-50/60 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <p className="text-emerald-600 font-semibold text-sm uppercase tracking-wide mb-3">Invoicing</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
              Professional crypto invoices in one click
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              Create invoices with line items, taxes, and descriptions. Your customer receives an email with a &quot;Pay Invoice&quot; button that takes them straight to checkout. No manual follow-ups needed.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-full text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg"
              >
                Send Your First Invoice <ArrowRight className="h-5 w-5 ml-2" />
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
              src="/screenshots/invoice-email.png"
              alt="Invoice email with line items, total amount, and Pay Invoice button"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Invoicing designed for crypto businesses</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Create, send, and track invoices, all from your NodeRails dashboard.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard icon={FileText} title="Line items" description="Add multiple items with quantities, unit prices, and descriptions to each invoice." />
            <FeatureCard icon={Calculator} title="Tax handling" description="Configure tax rates and apply them to invoices automatically. Visible on the receipt." />
            <FeatureCard icon={Mail} title="Email delivery" description="Invoices are emailed to your customer with a one-click 'Pay Invoice' button." />
            <FeatureCard icon={Clock} title="Status tracking" description="Track invoice status from draft to sent to paid. See payment details when settled." />
          </div>
        </div>
      </section>

      {/* Tax Rates */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Built-in tax configuration</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Set up tax rates for your business and apply them to invoices. Taxes are calculated automatically and shown clearly on the invoice and payment receipt.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> Multiple tax rate support</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> Inclusive or exclusive tax calculation</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> Tax breakdown on receipts and invoices</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3">
              <img
                src="/screenshots/tax-rates.png"
                alt="Tax rate configuration form"
                className="w-full h-auto rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Disputes */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] p-3 mb-12 lg:mb-0 order-2 lg:order-1">
              <img
                src="/screenshots/payment-receipt.png"
                alt="Payment receipt with dispute option"
                className="w-full h-auto rounded-2xl"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Dispute protection for every invoice</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Customers who pay an invoice receive a receipt email with the option to raise a dispute. The on-chain escrow handles refunds and chargebacks automatically, protecting both you and your customer.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> Automatic receipt emails with dispute option</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> On-chain escrow for buyer protection</li>
                <li className="flex items-center gap-3 text-slate-700"><Check className="h-5 w-5 text-emerald-600" /> Full dispute history in dashboard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-emerald-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Send your first invoice today
          </h2>
          <p className="text-lg text-emerald-100 mb-10">Create an invoice, add line items, and send it to your customer. They pay in one click.</p>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center justify-center px-10 py-4 text-base font-semibold rounded-full text-emerald-600 bg-white hover:bg-emerald-50 transition-colors shadow-lg"
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
      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-emerald-600" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
