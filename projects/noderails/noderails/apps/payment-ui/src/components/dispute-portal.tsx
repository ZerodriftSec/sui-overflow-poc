'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  sendCustomerOtp,
  verifyCustomerOtp,
  getCustomerPayments,
  raiseDispute,
  downloadReceipt,
} from '@/lib/api';

// ── Types ──

interface DisputeWindowInfo {
  paymentIntentId: string;
  status: string;
  amount?: string;
  currency?: string;
  cryptoAmount?: string;
  cryptoTokenKey?: string;
  merchantName?: string;
  capturedAt?: string;
  disputeOpensAt?: string;
  disputeClosesAt?: string;
  disputeWindowOpen: boolean;
  hasExistingDispute: boolean;
  existingDispute?: {
    id: string;
    reason: string;
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  } | null;
  customerEmail?: string | null;
}

interface CustomerPayment {
  id: string;
  amount: string;
  currency: string;
  status: string;
  cryptoAmount?: string;
  cryptoTokenKey?: string;
  chainName?: string;
  merchantName: string;
  capturedAt?: string;
  createdAt: string;
  disputeWindowOpen: boolean;
  disputeWindowStatus?: 'not_applicable' | 'not_open' | 'open' | 'closed';
  disputeOpensAt?: string | null;
  dispute?: {
    id: string;
    status: string;
    reason: string;
    createdAt: string;
  } | null;
}

// ── Icons (inline SVGs) ──

function IconShield() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

// ── Component ──

export function DisputePortal({ windowInfo }: { windowInfo: DisputeWindowInfo }) {
  const [step, setStep] = useState<'email' | 'otp' | 'portal' | 'dispute' | 'success'>('email');
  const [email, setEmail] = useState(windowInfo.customerEmail ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(windowInfo.paymentIntentId);
  const [detailPayment, setDetailPayment] = useState<CustomerPayment | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ disputeId: string; deadline: string } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofFileInputRef = useRef<HTMLInputElement>(null);

  // Attempt to restore cookie-backed session on mount.
  useEffect(() => {
    setLoading(true);
    getCustomerPayments()
      .then((result) => {
        setPayments(result.payments ?? []);
        setStep('portal');
      })
      .catch(() => {
        // No active session cookie - stay on email step.
      })
      .finally(() => setLoading(false));
  }, []);

  // Step 1: Send OTP
  const handleSendOtp = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await sendCustomerOtp(email);
      setStep('otp');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Step 2: Verify OTP
  const handleVerifyOtp = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await verifyCustomerOtp(email, otpCode);
      const payResult = await getCustomerPayments();
      setPayments(payResult.payments ?? []);
      setStep('portal');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  }, [email, otpCode]);

  // Step 3: Raise dispute
  const handleRaiseDispute = useCallback(async () => {
    if (!selectedPayment || reason.length < 10) return;
    setError('');
    setLoading(true);
    try {
      const result = await raiseDispute(selectedPayment, reason, proofFile ?? undefined);
      setSuccessData({ disputeId: result.id, deadline: result.deadline });
      setStep('success');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to raise dispute');
    } finally {
      setLoading(false);
    }
  }, [selectedPayment, reason, proofFile]);

  // Download receipt
  const handleDownloadReceipt = useCallback(async (paymentId: string) => {
    try {
      await downloadReceipt(paymentId);
    } catch {
      setError('Failed to download receipt');
    }
  }, []);

  // ── Auth screens (email + OTP) ──
  if (step === 'email' || step === 'otp') {
    return (
      <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <IconShield />
            <h1 className="text-xl font-semibold text-slate-900">NodeRails Dispute Center</h1>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Payment context banner */}
            {windowInfo.amount && (
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Payment of <span className="font-medium text-slate-900">{windowInfo.amount} {windowInfo.currency}</span></span>
                  <span className="text-slate-500">{windowInfo.merchantName}</span>
                </div>
              </div>
            )}

            <div className="p-6">
              {/* Existing dispute notice */}
              {windowInfo.hasExistingDispute && windowInfo.existingDispute && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
                  <IconAlert />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Dispute already filed</p>
                    <p className="text-amber-600 text-xs mt-0.5">
                      Status: {windowInfo.existingDispute.status} &middot; {new Date(windowInfo.existingDispute.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {step === 'email' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Verify your identity</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Enter the email used for your payment to access your transaction history.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#635bff] focus:border-[#635bff] transition-colors text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSendOtp}
                    disabled={!email || loading}
                    className="w-full py-2 px-4 bg-[#635bff] text-white rounded-lg font-medium text-sm hover:bg-[#5347e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Sending...' : 'Send verification code'}
                  </button>
                </div>
              )}

              {step === 'otp' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Enter verification code</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      We sent a 6-digit code to <span className="font-medium text-slate-700">{email}</span>.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-center text-xl font-mono tracking-[0.4em] placeholder-slate-400 focus:ring-2 focus:ring-[#635bff] focus:border-[#635bff] transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleVerifyOtp}
                    disabled={otpCode.length !== 6 || loading}
                    className="w-full py-2 px-4 bg-[#635bff] text-white rounded-lg font-medium text-sm hover:bg-[#5347e0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>
                  <button
                    onClick={() => { setOtpCode(''); setError(''); setStep('email'); }}
                    className="w-full py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">Secured by NodeRails</p>
        </div>
      </div>
    );
  }

  // ── Success screen ──
  if (step === 'success' && successData) {
    return (
      <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IconCheck />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Dispute submitted</h2>
            <p className="text-sm text-slate-500 mt-1">Your dispute is under review.</p>

            <div className="mt-5 p-4 bg-slate-50 rounded-lg text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Dispute ID</span>
                <span className="font-mono text-slate-700">{successData.disputeId.slice(0, 4)}...{successData.disputeId.slice(-4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Review deadline</span>
                <span className="text-slate-700">{new Date(successData.deadline).toLocaleDateString()}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              You&apos;ll receive an email when the dispute is resolved.
            </p>

            <button
              onClick={() => { setReason(''); setError(''); setProofFile(null); setStep('portal'); }}
              className="mt-5 py-2 px-4 text-sm text-[#635bff] font-medium hover:underline"
            >
              Back to payments
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dispute form ──
  if (step === 'dispute') {
    return (
      <div className="min-h-screen bg-[#f7f8fa] flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => { setReason(''); setError(''); setProofFile(null); setStep('portal'); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <IconArrowLeft />
              </button>
              <h2 className="text-base font-semibold text-slate-900">Raise a dispute</h2>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg flex justify-between text-sm">
                <span className="text-slate-500">Payment</span>
                <span className="font-mono text-slate-700">{selectedPayment ? `${selectedPayment.slice(0, 4)}...${selectedPayment.slice(-4)}` : '—'}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for dispute
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the issue in detail (minimum 10 characters)..."
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-[#635bff] focus:border-[#635bff] transition-colors resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">{reason.length}/1000</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Supporting document
                  <span className="text-slate-400 font-normal ml-1">(optional, PDF, max 10 MB)</span>
                </label>
                <input
                  ref={proofFileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                />
                {proofFile && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-slate-500">{proofFile.name}</span>
                    <button
                      type="button"
                      onClick={() => { setProofFile(null); if (proofFileInputRef.current) proofFileInputRef.current.value = ''; }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleRaiseDispute}
                disabled={reason.length < 10 || loading}
                className="w-full py-2 px-4 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Submitting...' : 'Submit dispute'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Portal: Dashboard-style table ──
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconShield />
            <span className="font-semibold text-slate-900 text-sm">NodeRails Dispute Center</span>
          </div>
          <span className="text-xs text-slate-500">{email}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-900">Your Payments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            View transaction details, download receipts, or raise a dispute.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {payments.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <p className="text-slate-500">No payments found for this email.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_120px_120px_150px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span>Amount</span>
              <span>Merchant</span>
              <span>Status</span>
              <span>Dispute</span>
              <span className="text-right">Actions</span>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-slate-100">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="sm:grid sm:grid-cols-[1fr_1fr_120px_120px_150px] gap-4 px-5 py-3.5 items-center hover:bg-slate-50/50 transition-colors"
                >
                  {/* Amount */}
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {p.amount} {p.currency}
                    </p>
                    {p.cryptoAmount && (
                      <p className="text-xs text-slate-400">
                        {p.cryptoAmount} {p.cryptoTokenKey?.split('-')[0]}
                        {p.chainName ? ` • ${p.chainName}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 sm:hidden mt-0.5">{p.merchantName}</p>
                  </div>

                  {/* Merchant */}
                  <div className="hidden sm:block">
                    <p className="text-sm text-slate-700">{p.merchantName}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(p.capturedAt ?? p.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Payment status */}
                  <div>
                    <PaymentStatusBadge status={p.status} />
                  </div>

                  {/* Dispute status */}
                  <div>
                    <DisputeStatusBadge payment={p} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1 mt-2 sm:mt-0">
                    <button
                      onClick={() => setDetailPayment(p)}
                      title="View details"
                      className="p-1.5 text-slate-400 hover:text-[#635bff] hover:bg-[#635bff]/5 rounded-md transition-colors"
                    >
                      <IconEye />
                    </button>
                    <button
                      onClick={() => handleDownloadReceipt(p.id)}
                      title="Download receipt"
                      className="p-1.5 text-slate-400 hover:text-[#635bff] hover:bg-[#635bff]/5 rounded-md transition-colors"
                    >
                      <IconDownload />
                    </button>
                    {p.disputeWindowOpen && !p.dispute && (
                      <button
                        onClick={() => {
                          setSelectedPayment(p.id);
                          setStep('dispute');
                        }}
                        className="ml-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Raise dispute
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Detail slide-over ── */}
      {detailPayment && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setDetailPayment(null)}
          />
          {/* Panel */}
          <div className="relative w-full max-w-md bg-white shadow-xl border-l border-slate-200 overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Payment Details</h3>
              <button
                onClick={() => setDetailPayment(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <IconX />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <DetailRow label="Payment ID" value={detailPayment.id} mono />
              <DetailRow label="Amount" value={`${detailPayment.amount} ${detailPayment.currency}`} />
              {detailPayment.cryptoAmount && (
                <DetailRow
                  label="Crypto Amount"
                  value={`${detailPayment.cryptoAmount} ${detailPayment.cryptoTokenKey?.split('-')[0] ?? ''}`}
                />
              )}
              {detailPayment.chainName && <DetailRow label="Network" value={detailPayment.chainName} />}
              <DetailRow label="Merchant" value={detailPayment.merchantName} />
              <DetailRow label="Status" value={detailPayment.status} />
              <DetailRow
                label="Date"
                value={new Date(detailPayment.capturedAt ?? detailPayment.createdAt).toLocaleString()}
              />

              {/* Dispute info */}
              {detailPayment.dispute && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Dispute Information</p>
                  <DetailRow label="Dispute Status" value={detailPayment.dispute.status} />
                  <DetailRow label="Reason" value={detailPayment.dispute.reason} />
                  <DetailRow
                    label="Filed"
                    value={new Date(detailPayment.dispute.createdAt).toLocaleString()}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <button
                  onClick={() => handleDownloadReceipt(detailPayment.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <IconDownload />
                  Download receipt
                </button>
                {detailPayment.disputeWindowOpen && !detailPayment.dispute && (
                  <button
                    onClick={() => {
                      setSelectedPayment(detailPayment.id);
                      setDetailPayment(null);
                      setStep('dispute');
                    }}
                    className="w-full py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Raise dispute
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-slate-400 py-6">Secured by NodeRails</footer>
    </div>
  );
}

// ── Helpers ──

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className={`text-sm text-slate-900 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    CAPTURED: { bg: 'bg-green-50', text: 'text-green-700', label: 'Captured' },
    DISPUTED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Disputed' },
    DISPUTE_RESOLVED: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Resolved' },
    DISPUTE_LOST: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Lost' },
    REFUNDED: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Refunded' },
    SETTLED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Settled' },
  };
  const s = map[status] ?? { bg: 'bg-slate-50', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function DisputeStatusBadge({ payment }: { payment: CustomerPayment }) {
  // Active dispute — show its status
  if (payment.dispute) {
    const dMap: Record<string, { bg: string; text: string; label: string }> = {
      OPEN: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Under review' },
      RESOLVED_MERCHANT: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Merchant won' },
      RESOLVED_PAYER: { bg: 'bg-green-50', text: 'text-green-700', label: 'Refunded' },
    };
    const d = dMap[payment.dispute.status] ?? { bg: 'bg-slate-50', text: 'text-slate-600', label: payment.dispute.status };
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${d.bg} ${d.text}`}>
        {d.label}
      </span>
    );
  }

  const wStatus = payment.disputeWindowStatus;

  if (wStatus === 'open') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-violet-50 text-violet-700">
        Can raise
      </span>
    );
  }

  if (wStatus === 'not_open') {
    const opensAt = payment.disputeOpensAt ? new Date(payment.disputeOpensAt) : null;
    const label = opensAt
      ? `Opens ${opensAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : 'Not open yet';
    return <span className="text-xs text-slate-400" title={opensAt?.toLocaleString()}>{label}</span>;
  }

  if (wStatus === 'closed') {
    return <span className="text-xs text-slate-400">Window closed</span>;
  }

  // Payment status shortcuts for settled/refunded
  if (payment.status === 'REFUNDED') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-50 text-purple-700">
        Refunded
      </span>
    );
  }
  if (payment.status === 'SETTLED') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700">
        Settled
      </span>
    );
  }

  return <span className="text-xs text-slate-300">&mdash;</span>;
}
