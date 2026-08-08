'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { Button, Input } from '@/components/ui';
import * as api from '@/lib/api';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Invalid or missing reset token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reset password.');
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set new password</h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Choose a new password for your merchant account.
            </p>
          </div>

          {done ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                Password reset successful. You can now sign in with your new password.
              </div>
              <Link href="/login" className="block">
                <Button type="button" className="w-full">Go to login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="New password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Input
                label="Confirm new password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating password...' : 'Reset password'}
              </Button>
            </form>
          )}

          {!done && (
            <p className="mt-5 text-center text-sm text-slate-600">
              Need a new reset link?{' '}
              <Link href="/forgot-password" className="font-medium text-primary hover:text-primary/90">
                Request again
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
