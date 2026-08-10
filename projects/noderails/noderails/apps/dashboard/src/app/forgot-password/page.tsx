'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { Button, Input } from '@/components/ui';
import * as api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8ff] px-4 py-6">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at -10% -10%, rgba(99,91,255,0.22), transparent 60%), radial-gradient(900px 520px at 110% 110%, rgba(34,211,238,0.20), transparent 62%), linear-gradient(150deg, #f8f9ff 0%, #eef2ff 45%, #f6f7ff 100%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-white/80 bg-white p-8 shadow-[0_20px_60px_rgba(99,91,255,0.20)]">
          <div className="mb-7 text-center">
            <NodeRailsLogo withText className="mx-auto mb-5 w-[280px] h-auto" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Forgot password</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Enter your merchant email and we will send a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                If an account exists for this email, a password reset link has been sent.
              </div>
              <Link href="/login" className="block">
                <Button type="button" className="w-full">Back to login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Merchant email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending link...' : 'Send reset link'}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-slate-600">
            Remember your password?{' '}
            <Link href="/login" className="font-medium text-primary hover:text-primary/90">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
