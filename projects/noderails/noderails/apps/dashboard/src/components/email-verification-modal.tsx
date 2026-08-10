'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { Mail, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Full-screen overlay modal that blocks dashboard access until the
 * merchant verifies their email with a 6-digit OTP code.
 */
export function EmailVerificationModal() {
  const { token, updateMerchant } = useAuth();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Cooldown timer ──
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ── Send OTP ──
  const handleSendOtp = useCallback(async () => {
    if (!token || sending || cooldown > 0) return;
    setSending(true);
    setError('');
    try {
      await api.sendOtp(token);
      setOtpSent(true);
      setCooldown(60); // 60 second cooldown between sends
      // Focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message ?? 'Failed to send verification code');
    } finally {
      setSending(false);
    }
  }, [token, sending, cooldown]);

  // ── Handle code input ──
  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || '';
    }
    setCode(newCode);

    // Focus the next empty input or the last one
    const nextEmpty = newCode.findIndex((d) => !d);
    inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();
  };

  // ── Verify OTP ──
  const handleVerify = async () => {
    const otp = code.join('');
    if (otp.length !== 6 || !token) return;

    setVerifying(true);
    setError('');
    try {
      await api.verifyOtp(token, otp);
      updateMerchant({ emailVerified: true });
    } catch (err: any) {
      setError(err.message ?? 'Verification failed');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // Auto-verify when all 6 digits entered
  const fullCode = code.join('');
  useEffect(() => {
    if (fullCode.length === 6 && !verifying) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullCode]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {otpSent ? (
              <ShieldCheck className="h-7 w-7 text-primary" />
            ) : (
              <Mail className="h-7 w-7 text-primary" />
            )}
          </div>
          <h2 className="text-xl font-semibold text-foreground">
            {otpSent ? 'Enter verification code' : 'Verify your email'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {otpSent
              ? 'We sent a 6-digit code to your email. Enter it below to verify your account.'
              : 'To access the dashboard, you need to verify your email address first.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {otpSent ? (
          <>
            {/* OTP Input */}
            <div className="mb-6 flex justify-center gap-2" onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="h-13 w-11 rounded-lg border border-border bg-background text-center text-xl font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  disabled={verifying}
                />
              ))}
            </div>

            {/* Verify button */}
            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={fullCode.length !== 6 || verifying}
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Verify'
              )}
            </Button>

            {/* Resend */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sending || cooldown > 0}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : sending
                    ? 'Sending…'
                    : "Didn't receive the code? Resend"}
              </button>
            </div>
          </>
        ) : (
          /* Send OTP button */
          <Button className="w-full" onClick={handleSendOtp} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send verification code
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
