import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Coins,
  CreditCard,
  Shield,
} from 'lucide-react';

export function HeroDashboardPreview() {
  return (
    <>
      <div className="flex items-center px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex space-x-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="ml-3 flex-1 bg-white rounded px-3 py-1 text-[10px] text-slate-400 font-mono border border-slate-100">
          merchant.noderails.com
        </div>
      </div>

      <div className="flex">
        <div className="w-[140px] bg-slate-50 border-r border-slate-100 p-3 space-y-0.5 shrink-0">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-indigo-50 text-indigo-700">
            <CreditCard className="h-3 w-3" />
            <span className="text-[10px] font-semibold">Overview</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <CreditCard className="h-3 w-3" />
            <span className="text-[10px] font-medium">Payments</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <ArrowLeftRight className="h-3 w-3" />
            <span className="text-[10px] font-medium">Payouts</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <Coins className="h-3 w-3" />
            <span className="text-[10px] font-medium">Subscriptions</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <ArrowRight className="h-3 w-3" />
            <span className="text-[10px] font-medium">Invoices</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <ArrowRight className="h-3 w-3" />
            <span className="text-[10px] font-medium">Payment Links</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <Shield className="h-3 w-3" />
            <span className="text-[10px] font-medium">Customers</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">
            <ArrowRight className="h-3 w-3" />
            <span className="text-[10px] font-medium">Checkout</span>
          </div>
        </div>

        <div className="flex-1 p-5 bg-white min-w-0">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium uppercase">Total Payments</div>
              <div className="text-lg font-bold text-slate-900 mt-1">1,284</div>
              <span className="text-[10px] font-medium text-green-600">+18.2%</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium uppercase">Captured Volume</div>
              <div className="text-lg font-bold text-slate-900 mt-1">$48.5K</div>
              <span className="text-[10px] font-medium text-green-600">+12.5%</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="text-[10px] text-slate-500 font-medium uppercase">Active Subs</div>
              <div className="text-lg font-bold text-slate-900 mt-1">326</div>
              <span className="text-[10px] font-medium text-green-600">+6.1%</span>
            </div>
          </div>

          <div className="h-24 w-full mb-5 relative">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 30">
              <defs>
                <linearGradient id="heroGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,25 Q10,22 20,23 T40,18 T60,10 T80,14 T100,4 V30 H0 Z" fill="url(#heroGrad)" />
              <path d="M0,25 Q10,22 20,23 T40,18 T60,10 T80,14 T100,4" fill="none" stroke="#6366f1" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="text-[11px] font-semibold text-slate-700 mb-3">Recent Payments</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 px-2.5 bg-slate-50/60 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500 font-mono truncate">pay_4xKm...9f2</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Captured</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">USDC - Base</span>
                <span className="text-[10px] font-semibold text-slate-900">$249.00</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 px-2.5 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500 font-mono truncate">pay_8zRn...3a1</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">Settled</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">ETH - Ethereum</span>
                <span className="text-[10px] font-semibold text-slate-900">$1,200.00</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 px-2.5 bg-slate-50/60 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500 font-mono truncate">pay_2wLp...7d5</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">Captured</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">USDT - Polygon</span>
                <span className="text-[10px] font-semibold text-slate-900">$89.99</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 px-2.5 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-slate-500 font-mono truncate">pay_6tQj...1c8</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">Subscription</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500">USDC - Arbitrum</span>
                <span className="text-[10px] font-semibold text-slate-900">$29.99</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function HeroDashboardFloatingCards() {
  return (
    <>
      <div className="absolute -right-4 top-16 bg-white p-2.5 rounded-lg shadow-xl border border-slate-100 animate-bounce" style={{ animationDuration: '3s' }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-3 w-3 text-green-600" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-700">Payment Link Created</div>
            <div className="text-[9px] text-slate-400">pay.noderails.com/lnk_3x...</div>
          </div>
        </div>
      </div>

      <div className="absolute -left-4 bottom-16 bg-white p-2.5 rounded-lg shadow-xl border border-slate-100 animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s' }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
            <CreditCard className="h-3 w-3 text-indigo-600" />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-slate-700">Checkout: $49.99</div>
            <div className="text-[9px] text-slate-400">USDC on Base - Captured</div>
          </div>
        </div>
      </div>
    </>
  );
}
