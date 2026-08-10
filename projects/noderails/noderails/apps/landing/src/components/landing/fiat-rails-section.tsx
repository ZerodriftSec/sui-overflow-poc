import Image from 'next/image';
import { SectionHeader } from '@/components/landing/section-header';
import { ArrowRight, Building2, Coins, Globe2, Landmark, TrendingDown } from 'lucide-react';

/** Virtual account regions from product spec (onramp). */
const VIRTUAL_ACCOUNT_CURRENCIES = [
  { code: 'USD', label: 'United States', hint: 'ACH · Wire · FedNow', flag: 'us' },
  { code: 'EUR', label: 'Europe', hint: 'SEPA', flag: 'eu' },
  { code: 'MXN', label: 'Mexico', hint: 'SPEI', flag: 'mx' },
  { code: 'BRL', label: 'Brazil', hint: 'Pix', flag: 'br' },
  { code: 'GBP', label: 'United Kingdom', hint: 'Faster Payments', flag: 'gb' },
  { code: 'COP', label: 'Colombia', hint: 'Local bank transfer', flag: 'co' },
] as const;

const CRYPTO_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/btc.svg' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/eth.svg' },
  { symbol: 'USDC', name: 'USD Coin', icon: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/usdc.svg' },
  { symbol: 'USDT', name: 'Tether', icon: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/usdt.svg' },
  { symbol: 'SOL', name: 'Solana', icon: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/sol.svg' },
  { symbol: 'SUI', name: 'Sui', icon: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=040' },
] as const;

const VIRTUAL_ACCOUNT_RAILS = ['ACH', 'Wire', 'FedNow', 'SEPA', 'SPEI', 'Pix', 'FP'] as const;

/** Sample flags shown under settle-to-bank to suggest global coverage. */
const GLOBAL_SETTLE_SAMPLE_FLAGS = [
  { code: 'JP', flag: 'jp' },
  { code: 'IN', flag: 'in' },
  { code: 'AE', flag: 'ae' },
  { code: 'NG', flag: 'ng' },
  { code: 'AU', flag: 'au' },
  { code: 'CA', flag: 'ca' },
  { code: 'SG', flag: 'sg' },
  { code: 'ZA', flag: 'za' },
] as const;

function flagUrl(iso: string) {
  return `https://flagcdn.com/w160/${iso}.png`;
}

function CurrencyFlag({ iso, code, size = 48 }: { iso: string; code: string; size?: number }) {
  return (
    <Image
      src={flagUrl(iso)}
      alt={`${code} currency region`}
      width={size}
      height={size}
      unoptimized
      className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-zinc-200 sm:h-14 sm:w-14"
    />
  );
}

function CryptoIcon({ src, symbol }: { src: string; symbol: string }) {
  return (
    <Image
      src={src}
      alt={symbol}
      width={40}
      height={40}
      unoptimized
      className="h-10 w-10 rounded-full bg-white p-1 shadow-sm ring-1 ring-zinc-200"
    />
  );
}

function FlowArrow() {
  return (
    <>
      <ArrowRight className="hidden h-5 w-5 shrink-0 text-indigo-400 xl:block" aria-hidden />
      <ArrowRight className="h-5 w-5 shrink-0 rotate-90 text-indigo-400 xl:hidden" aria-hidden />
    </>
  );
}

function AcceptSettleHero() {
  return (
    <div className="nr-panel overflow-hidden border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/60 p-6 sm:p-8">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
        <div className="text-center lg:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Accept crypto</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
            {CRYPTO_ASSETS.map((asset) => (
              <div key={asset.symbol} className="flex flex-col items-center gap-1">
                <CryptoIcon src={asset.icon} symbol={asset.symbol} />
                <span className="text-[10px] font-semibold text-zinc-600">{asset.symbol}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-zinc-600">
            Multi-chain checkout, links, and subscriptions with built-in buyer protection.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 px-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg">
            <Coins className="h-6 w-6" aria-hidden />
          </div>
          <FlowArrow />
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Lowest cost rails
          </p>
        </div>

        <div className="text-center lg:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Settle to bank</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 lg:justify-end">
            <div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-center shadow-sm">
              <p className="text-3xl font-black tracking-tight text-emerald-700">100+</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Countries</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-center shadow-sm">
              <p className="text-3xl font-black tracking-tight text-emerald-700">120+</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Currencies</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-600">
            Payout to verified business bank accounts worldwide at competitive rates.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-center sm:flex-row sm:justify-center sm:gap-3">
        <TrendingDown className="h-5 w-5 text-emerald-600" aria-hidden />
        <p className="text-sm font-semibold text-zinc-900 sm:text-base">
          Accept crypto. Settle to bank at the lowest cost.
        </p>
      </div>
    </div>
  );
}

function VirtualAccountGrid() {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {VIRTUAL_ACCOUNT_CURRENCIES.map((currency) => (
        <li
          key={currency.code}
          className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white px-3 py-4 text-center shadow-sm"
        >
          <CurrencyFlag iso={currency.flag} code={currency.code} size={56} />
          <p className="mt-3 text-base font-black tracking-tight text-zinc-900">{currency.code}</p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-600">{currency.label}</p>
          <p className="mt-1 text-[10px] leading-snug text-zinc-500">{currency.hint}</p>
        </li>
      ))}
    </ul>
  );
}

function VirtualAccountRailTags() {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {VIRTUAL_ACCOUNT_RAILS.map((rail) => (
        <span
          key={rail}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
        >
          {rail}
        </span>
      ))}
    </div>
  );
}

function GlobalSettleStats() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 text-center sm:text-left">
        <Globe2 className="mx-auto h-8 w-8 text-indigo-600 sm:mx-0" aria-hidden />
        <p className="mt-3 text-4xl font-black tracking-tight text-indigo-700">100+</p>
        <p className="mt-1 text-sm font-semibold text-zinc-900">Countries supported</p>
        <p className="mt-2 text-sm text-zinc-600">
          Send fiat payouts to verified business bank accounts across major markets worldwide.
        </p>
      </div>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-6 text-center sm:text-left">
        <Landmark className="mx-auto h-8 w-8 text-indigo-600 sm:mx-0" aria-hidden />
        <p className="mt-3 text-4xl font-black tracking-tight text-indigo-700">120+</p>
        <p className="mt-1 text-sm font-semibold text-zinc-900">Currencies supported</p>
        <p className="mt-2 text-sm text-zinc-600">
          Convert crypto settlement balances into local fiat with transparent FX and payout fees.
        </p>
      </div>
    </div>
  );
}

function GlobalSettleSampleFlags() {
  return (
    <div className="mt-6">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-left">
        Global payout coverage
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        {GLOBAL_SETTLE_SAMPLE_FLAGS.map((item) => (
          <CurrencyFlag key={item.code} iso={item.flag} code={item.code} />
        ))}
        <span className="rounded-full border border-dashed border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
          + 100+ more
        </span>
      </div>
    </div>
  );
}

export function FiatRailsSection() {
  return (
    <section id="fiat-rails" className="nr-section py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        <SectionHeader
          align="center"
          eyebrow="Fiat Rails"
          title="Accept crypto. Settle to bank at the lowest cost."
          description="Take crypto payments on-chain and settle directly to bank accounts in 100+ countries and 120+ currencies. Virtual accounts for local fiat receiving are available as a separate onramp."
          className="mx-auto"
        />

        <div className="mt-10 space-y-8">
          <AcceptSettleHero />

          <article id="virtual-accounts" className="nr-panel overflow-hidden p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Onramp · Fiat
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Create virtual accounts
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Open dedicated receiving accounts in USD, EUR, MXN, BRL, GBP, and COP. Customers and
              partners pay through local bank rails while you reconcile every deposit in one dashboard
              and keep checkout float ready at competitive rates.
            </p>
            <VirtualAccountGrid />
            <VirtualAccountRailTags />
          </article>

          <article id="settle-to-bank" className="nr-panel overflow-hidden border-indigo-200/60 p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              <Landmark className="h-3.5 w-3.5" aria-hidden />
              Offramp · Fiat
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Settle to bank
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              After capture and escrow timelock, convert crypto settlement balances into fiat payouts
              to your verified business bank account. Settle in 100+ countries and 120+ currencies with
              pricing designed to keep total cost low.
            </p>
            <GlobalSettleStats />
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                '100+ countries for business bank payouts',
                '120+ supported fiat currencies',
                'Webhook status for every settlement transfer',
                'Competitive FX and payout fees',
                'One flow from crypto capture to bank deposit',
                'Built for merchant treasury, not consumer deposits',
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700"
                >
                  {item}
                </li>
              ))}
            </ul>
            <GlobalSettleSampleFlags />
          </article>
        </div>
      </div>
    </section>
  );
}
