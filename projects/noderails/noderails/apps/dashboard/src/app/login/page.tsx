'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { NodeRailsLogo } from '@/components/noderails-logo';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, merchant, teamMember, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && (merchant || teamMember)) {
      router.push('/dashboard');
    }
  }, [authLoading, merchant, teamMember, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8ff] px-4 py-6">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at -10% -10%, rgba(99,91,255,0.22), transparent 60%), radial-gradient(900px 520px at 110% 110%, rgba(34,211,238,0.20), transparent 62%), linear-gradient(150deg, #f8f9ff 0%, #eef2ff 45%, #f6f7ff 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(99,91,255,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,91,255,0.10) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="hidden lg:block text-[#0f172a]">
          <p className="inline-flex items-center rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-3 py-1 text-xs font-semibold tracking-wide text-[#4338ca]">
            MERCHANT PLATFORM
          </p>
          <h2 className="mt-5 text-5xl font-bold leading-tight tracking-tight text-[#0f172a]">
            Crypto payments that
            <br />
            feel production-ready.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#334155]">
            Manage payment links, subscriptions, invoices, and disputes from one clean dashboard.
          </p>

          <div className="mt-8 grid max-w-xl gap-3">
            <div className="rounded-xl border border-[#dbeafe] bg-white/80 px-4 py-3 shadow-sm">
              Multi-chain checkout and hosted payment links
            </div>
            <div className="rounded-xl border border-[#dbeafe] bg-white/80 px-4 py-3 shadow-sm">
              Built-in subscriptions and automated renewals
            </div>
            <div className="rounded-xl border border-[#dbeafe] bg-white/80 px-4 py-3 shadow-sm">
              Unified customer billing and dispute workflows
            </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="rounded-3xl border border-white/80 bg-white p-8 shadow-[0_20px_60px_rgba(99,91,255,0.20)]">
            <div className="mb-7 text-center">
              <NodeRailsLogo withText className="mx-auto mb-5 w-[320px] h-auto" />
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {mode === 'login' ? 'Merchant Login' : 'Merchant Signup'}
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                {mode === 'login' ? 'Access your merchant dashboard and payment tools' : 'Create your merchant account to start accepting payments'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />

            {mode === 'login' && (
              <div className="-mt-1 text-right">
                <Link href="/forgot-password" className="text-xs font-medium text-primary hover:text-primary/90">
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full py-2.5 shadow-[0_8px_20px_rgba(99,91,255,0.2)]" disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Login' : 'Sign up'}
            </Button>
          </form>

            <div className="mt-6 text-center text-sm text-slate-600">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account?{' '}
                <button onClick={() => setMode('register')} className="text-primary hover:text-primary/90 font-medium transition-colors cursor-pointer">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-primary hover:text-primary/90 font-medium transition-colors cursor-pointer">
                  Sign in
                </button>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
