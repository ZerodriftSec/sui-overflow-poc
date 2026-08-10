'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import * as api from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { NodeRailsLogo } from '@/components/noderails-logo';
import { Shield, CheckCircle } from 'lucide-react';

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteToken = searchParams.get('token') ?? '';

  const [info, setInfo] = useState<{ email: string; name: string | null; permissions: string[]; orgName: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setError('Missing invite token');
      setLoading(false);
      return;
    }
    api.getInviteInfo(inviteToken)
      .then(setInfo)
      .catch((err: any) => setError(err.message ?? 'Invalid or expired invite'))
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.acceptInvite(inviteToken, password);
      setAccepted(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to accept invite');
    } finally {
      setSubmitting(false);
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
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="mt-3 text-sm text-slate-500">Verifying invite...</p>
            </div>
          )}

          {!loading && error && !info && (
            <div className="text-center py-6">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 mb-4">
                {error}
              </div>
              <Button variant="secondary" onClick={() => router.push('/login')}>
                Go to login
              </Button>
            </div>
          )}

          {accepted && (
            <div className="text-center py-6">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-slate-900">You&apos;re in!</h2>
              <p className="text-sm text-slate-500 mt-1">Redirecting to dashboard...</p>
            </div>
          )}

          {!loading && info && !accepted && (
            <>
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Join {info.orgName ?? 'the team'}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  You&apos;ve been invited as
                </p>
                <div className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700">
                  <Shield className="h-3 w-3" /> Team Member
                </div>
              </div>

              <form onSubmit={handleAccept} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={info.email}
                  disabled
                />
                <Input
                  label="Set password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  placeholder="Re-enter your password"
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

                <Button type="submit" className="w-full py-2.5" disabled={submitting}>
                  {submitting ? 'Setting up...' : 'Accept invite & set password'}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-400">
                Already accepted? <a href="/login" className="text-primary hover:text-primary/90 font-medium">Sign in</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <InviteContent />
    </Suspense>
  );
}
