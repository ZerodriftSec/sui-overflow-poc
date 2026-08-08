'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coffee, Loader2, Settings2 } from 'lucide-react';
import {
  COFFEE_AMOUNTS,
  DEFAULT_PAY_BODY,
  FLOW_LABELS,
  type PayFlow,
  type PayRequestBody,
} from '@/lib/types';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
      {hint ? <span className="mt-0.5 block text-[11px] text-stone-400">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ring-amber-500/0 transition focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20';

export function CoffeeDemo() {
  const [form, setForm] = useState<PayRequestBody>(DEFAULT_PAY_BODY);
  const [flow, setFlow] = useState<PayFlow>('checkout');
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDebug, setLastDebug] = useState<Record<string, unknown> | null>(null);
  const [health, setHealth] = useState<{
    ok: boolean;
    webhookConfigured?: boolean;
    webhookUrl?: string;
    suiChainId?: number;
    allowedTokens?: string[];
    appIdConfigured?: boolean;
  } | null>(null);
  const [webhookLog, setWebhookLog] = useState<
    Array<{ id: string; receivedAt: string; event: string; orderId: string | null; verified: boolean }>
  >([]);

  useEffect(() => {
    void fetch('/api/pay')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
  }, []);

  useEffect(() => {
    async function loadWebhooks() {
      try {
        const res = await fetch('/api/webhooks/noderails', { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && Array.isArray(data.recent)) {
          setWebhookLog(data.recent);
        }
      } catch {
        /* ignore */
      }
    }

    void loadWebhooks();
    const interval = setInterval(loadWebhooks, 4000);
    return () => clearInterval(interval);
  }, []);

  const isRecurring = flow === 'subscription-link' || flow === 'subscription-checkout';

  const metadataText = useMemo(
    () => JSON.stringify(form.metadata, null, 2),
    [form.metadata],
  );

  function setAmount(amount: string) {
    setForm((prev) => ({ ...prev, amount: Number.parseFloat(amount).toFixed(2) }));
  }

  function patch<K extends keyof PayRequestBody>(key: K, value: PayRequestBody[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePay() {
    setLoading(true);
    setError(null);
    setLastDebug(null);

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, flow }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Request failed');
      }

      setLastDebug(data.debug ?? null);

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      throw new Error('No payment URL returned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Coffee className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">NodeRails · Sui demo</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">Buy me a coffee on Sui</h1>
        <p className="mx-auto mt-3 max-w-2xl text-stone-600">
          SDK sandbox for <strong>Sui-only</strong> checkout sessions and payment links. Customers pay with SUI or USDC
          via hosted checkout; your server confirms via signed webhooks — not redirect alone.
        </p>
        {health?.suiChainId ? (
          <p className="mx-auto mt-3 max-w-xl text-sm text-stone-500">
            Chain ID <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">{health.suiChainId}</code>
            {' · '}
            Tokens{' '}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">
              {(health.allowedTokens ?? []).join(', ') || 'SUI / USDC'}
            </code>
          </p>
        ) : null}
        {health && !health.ok ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Missing API credentials. Copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code> and set{' '}
            <code className="font-mono">NODERAILS_APP_ID</code> + <code className="font-mono">NODERAILS_API_KEY</code>.
          </p>
        ) : null}
        {health?.ok ? (
          <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-left text-xs text-stone-700">
            <p className="font-semibold text-stone-900">Deploy env (server-only)</p>
            <ul className="mt-2 space-y-1 font-mono text-[11px] text-stone-600">
              <li>NODERAILS_APP_ID — your app UUID from dashboard</li>
              <li>NODERAILS_API_KEY — secret key (nr_test_sk_… or nr_live_sk_…)</li>
              <li>NODERAILS_WEBHOOK_SECRET — whsec_… from Webhooks settings</li>
              <li>APP_BASE_URL — public URL of this app (for redirects + webhook)</li>
              <li>NODERAILS_SUI_CHAIN_ID — 202 testnet (201 devnet, 203 mainnet)</li>
            </ul>
          </div>
        ) : null}
        {health?.ok && !health.webhookConfigured ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Set <code className="font-mono">NODERAILS_WEBHOOK_SECRET</code> and register the webhook URL in your NodeRails
            dashboard (Settings → Webhooks). Use ngrok or deploy publicly so NodeRails can POST events.
          </p>
        ) : null}
        {health?.webhookUrl ? (
          <p className="mx-auto mt-4 max-w-2xl rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-xs text-stone-600">
            <span className="font-semibold text-stone-800">Webhook endpoint:</span>{' '}
            <code className="break-all font-mono text-[11px]">{health.webhookUrl}</code>
            <span className="mt-1 block text-stone-500">
              Subscribe to <code className="font-mono">payment.captured</code> (and{' '}
              <code className="font-mono">subscription.activated</code> for monthly).
            </span>
          </p>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold text-stone-900">Choose amount</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {COFFEE_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(amt)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                  form.amount === `${amt}.00` || form.amount === amt
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          <Field label="Custom amount (USD)" hint="Used for one-time and monthly price">
            <input
              className={inputClass}
              value={form.amount}
              onChange={(e) => patch('amount', e.target.value)}
              placeholder="5.00"
            />
          </Field>

          <h2 className="mt-8 text-lg font-bold text-stone-900">Payment flow</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(Object.keys(FLOW_LABELS) as PayFlow[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFlow(key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  flow === key
                    ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-500/20'
                    : 'border-stone-200 bg-stone-50 hover:border-stone-300'
                }`}
              >
                <p className="text-sm font-semibold text-stone-900">{FLOW_LABELS[key].title}</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-500">{FLOW_LABELS[key].description}</p>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={loading || health?.ok === false}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-amber-600/25 transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Coffee className="h-5 w-5" />}
            {loading ? 'Creating payment…' : isRecurring ? 'Support monthly' : 'Buy me a coffee'}
          </button>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
          ) : null}

          {lastDebug ? (
            <pre className="mt-4 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-emerald-300">
              {JSON.stringify(lastDebug, null, 2)}
            </pre>
          ) : null}
        </section>

        <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <Settings2 className="h-4 w-4 text-amber-600" />
              SDK fields (editable)
            </span>
            <span className="text-xs text-stone-400">{showAdvanced ? 'Hide' : 'Show'}</span>
          </button>

          {showAdvanced ? (
            <div className="mt-5 space-y-4">
              <Field label="Item name">
                <input className={inputClass} value={form.itemName} onChange={(e) => patch('itemName', e.target.value)} />
              </Field>

              <Field label="Description">
                <textarea
                  className={`${inputClass} min-h-[72px] resize-y`}
                  value={form.itemDescription}
                  onChange={(e) => patch('itemDescription', e.target.value)}
                />
              </Field>

              {(flow === 'payment-link' || flow === 'subscription-link') && (
                <Field label="Slug" hint="Leave empty to auto-generate a unique slug">
                  <input className={inputClass} value={form.slug} onChange={(e) => patch('slug', e.target.value)} placeholder="my-coffee" />
                </Field>
              )}

              {isRecurring ? (
                <>
                  <Field label="Plan name">
                    <input className={inputClass} value={form.planName} onChange={(e) => patch('planName', e.target.value)} />
                  </Field>
                  <Field label="Billing interval">
                    <select
                      className={inputClass}
                      value={form.billingInterval}
                      onChange={(e) => patch('billingInterval', e.target.value as 'MONTH' | 'YEAR')}
                    >
                      <option value="MONTH">MONTH</option>
                      <option value="YEAR">YEAR</option>
                    </select>
                  </Field>
                  <Field label="Interval count">
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      value={form.billingIntervalCount}
                      onChange={(e) => patch('billingIntervalCount', Number(e.target.value) || 1)}
                    />
                  </Field>
                </>
              ) : null}

              {flow === 'subscription-checkout' ? (
                <>
                  <Field label="Customer email">
                    <input
                      className={inputClass}
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) => patch('customerEmail', e.target.value)}
                    />
                  </Field>
                  <Field label="Customer name">
                    <input className={inputClass} value={form.customerName} onChange={(e) => patch('customerName', e.target.value)} />
                  </Field>
                </>
              ) : null}

              <Field label="Currency">
                <input className={inputClass} value={form.currency} onChange={(e) => patch('currency', e.target.value.toUpperCase())} />
              </Field>

              <Field label="Success URL" hint="Empty = /success on this app">
                <input className={inputClass} value={form.successUrl} onChange={(e) => patch('successUrl', e.target.value)} placeholder="http://localhost:3005/success" />
              </Field>

              <Field label="Cancel URL" hint="Empty = /cancel on this app">
                <input className={inputClass} value={form.cancelUrl} onChange={(e) => patch('cancelUrl', e.target.value)} placeholder="http://localhost:3005/cancel" />
              </Field>

              <Field label="Metadata (JSON)">
                <textarea
                  className={`${inputClass} min-h-[100px] font-mono text-xs`}
                  value={metadataText}
                  onChange={(e) => {
                    try {
                      patch('metadata', JSON.parse(e.target.value) as Record<string, string>);
                      setError(null);
                    } catch {
                      setError('Metadata must be valid JSON');
                    }
                  }}
                />
              </Field>
            </div>
          ) : null}
        </aside>

        <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <h2 className="text-sm font-bold text-stone-900">Recent webhooks (backend log)</h2>
          <p className="mt-1 text-xs text-stone-500">
            Verified events received at <code className="font-mono">/api/webhooks/noderails</code>. Success page polls
            order status until one of these confirms payment.
          </p>
          {webhookLog.length === 0 ? (
            <p className="mt-4 text-sm text-stone-400">No webhooks yet. Complete a payment to see events here.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {webhookLog.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-700"
                >
                  <span className="font-mono font-semibold text-emerald-700">{row.event}</span>
                  {row.orderId ? (
                    <span className="ml-2 text-stone-500">
                      order <code className="font-mono">{row.orderId.slice(0, 8)}…</code>
                    </span>
                  ) : null}
                  <span className="ml-2 text-stone-400">{new Date(row.receivedAt).toLocaleTimeString()}</span>
                  {!row.verified ? <span className="ml-2 text-red-600">unverified</span> : null}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
