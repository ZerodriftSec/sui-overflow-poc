import { NodeRailsLogo } from '@/components/noderails-logo';
import { TrackedLink } from '@/components/tracked-link';
import { FeedbackWidget } from '@/components/feedback-widget';
import { ChevronRight } from 'lucide-react';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';
const X_URL = 'https://x.com/noderails';
const LINKEDIN_URL = 'https://www.linkedin.com/company/noderails';
const TELEGRAM_URL = 'https://t.me/+fzUTcAYr-zhhZjg1';
const DISCORD_URL = 'https://discord.gg/8uwSfv9Tvk';

export default function ProductLayout({ children }: { children: React.ReactNode }) {
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
                properties={{ location: 'product_page_nav' }}
                className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Merchant Login
                <ChevronRight className="h-4 w-4 ml-1" />
              </TrackedLink>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-20">{children}</main>

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
