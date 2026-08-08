'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { NodeRailsLogo } from '@/components/noderails-logo';

function LoginForm() {
  const { login } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8f8ff] px-4 py-6">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 560px at 15% -5%, rgba(245,158,11,0.22), transparent 62%), radial-gradient(780px 520px at 100% 100%, rgba(239,68,68,0.14), transparent 64%), linear-gradient(160deg, #fffaf2 0%, #fff7ed 40%, #fefce8 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(251,146,60,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(251,146,60,0.14) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden lg:block text-[#1f2937]">
          <p className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
            PLATFORM ADMIN
          </p>
          <h2 className="mt-5 text-5xl font-bold leading-tight tracking-tight text-[#111827]">
            Control operations,
            <br />
            compliance, and risk.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#4b5563]">
            Manage supported chains, tokens, webhooks, dispute handling, and platform-wide controls from one command center.
          </p>

          <div className="mt-8 grid max-w-xl gap-3">
            <div className="rounded-xl border border-amber-200 bg-white/85 px-4 py-3 shadow-sm">
              Merchant lifecycle and compliance operations
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/85 px-4 py-3 shadow-sm">
              Dispute handling and webhook reliability insights
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/85 px-4 py-3 shadow-sm">
              Chain/token policy management and guardrails
            </div>
          </div>
        </section>

        <div className="w-full max-w-sm justify-self-center lg:justify-self-end">
          <div className="mb-8 text-center">
            <NodeRailsLogo withText className="mx-auto mb-5 w-[300px] h-auto" />
            <h1 className="text-2xl font-bold text-[#111827]">Admin Login</h1>
            <p className="mt-1.5 text-sm text-[#4b5563]">Access platform operations and controls</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-white/80 bg-white/95 p-7 shadow-[0_24px_70px_rgba(180,83,9,0.18)] backdrop-blur space-y-4"
          >
          {error && (
            <div className="rounded-lg bg-[#fdf2f4] border border-[#fbb8c5] p-3 text-sm text-[#df1b41]">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            placeholder="admin@noderails.com"
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
          />

          <Button type="submit" disabled={loading} className="w-full py-2.5 shadow-[0_8px_20px_rgba(99,91,255,0.2)]">
            {loading ? 'Signing in...' : 'Login'}
          </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AdminAuthProvider>
      <LoginForm />
    </AdminAuthProvider>
  );
}
