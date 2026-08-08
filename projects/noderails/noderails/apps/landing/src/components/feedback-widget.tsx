'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';

type FeedbackType = 'FEATURE_REQUEST' | 'CHAIN_REQUEST' | 'GENERAL_FEEDBACK';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const AUTO_POPUP_DELAY_MS = 10000;

export function FeedbackWidget() {
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [type, setType] = useState<FeedbackType>('FEATURE_REQUEST');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const canSubmit = useMemo(() => {
    return email.trim().length > 4 && message.trim().length >= 10;
  }, [email, message]);

  useEffect(() => {
    if (isDismissed) return;

    const timeoutId = window.setTimeout(() => {
      setIsVisible(true);
    }, AUTO_POPUP_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isDismissed]);

  const dismissFeedback = () => {
    setIsVisible(false);
    setIsExpanded(false);
    setIsDismissed(true);
  };

  const closeExpandedFeedback = () => {
    setIsExpanded(false);
  };

  const resetForm = () => {
    setType('FEATURE_REQUEST');
    setEmail('');
    setMessage('');
    setErrorMessage('');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          email: email.trim(),
          message: message.trim(),
          source: 'landing_popup_widget',
          website: '',
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Unable to submit feedback right now');
      }

      setSuccessMessage('Thanks, your request has been submitted.');
      resetForm();
    } catch (error: any) {
      setErrorMessage(error.message ?? 'Something went wrong while sending feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {!isDismissed && isVisible && !isExpanded ? (
        <div className="fixed right-4 bottom-4 z-50 w-[92vw] max-w-[320px] rounded-2xl border border-cyan-200 bg-white shadow-[0_24px_70px_rgba(6,182,212,0.35)] ring-1 ring-cyan-100 transition-all duration-500 translate-y-0 opacity-100">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">NodeRails DevRel</p>
            <button
              type="button"
              onClick={dismissFeedback}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss feedback popup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="w-full px-4 pb-4 text-left"
            aria-label="Open feedback form"
          >
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-blue-50 p-3">
              <div className="relative h-14 w-14 rounded-full border border-cyan-300 bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_8px_20px_rgba(37,99,235,0.4)]">
                <div className="absolute -left-1 top-1 h-4 w-4 rounded-full border border-cyan-300 bg-cyan-300" />
                <div className="absolute -right-1 top-1 h-4 w-4 rounded-full border border-cyan-300 bg-cyan-300" />
                <div className="absolute left-3.5 top-5 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <div className="absolute right-3.5 top-5 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <div className="absolute left-1/2 top-7 h-2 w-3 -translate-x-1/2 rounded-full bg-white/90" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Hi</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Give feedback or request a chain. Tap to open.
                </p>
              </div>
            </div>
          </button>
        </div>
      ) : null}

      {!isDismissed && isVisible && isExpanded ? (
        <div
          className="fixed right-4 bottom-4 z-50 w-[92vw] max-w-md rounded-2xl border border-cyan-200 bg-white shadow-[0_30px_80px_rgba(6,182,212,0.35)] ring-1 ring-cyan-100 transition-all duration-500 translate-y-0 opacity-100"
          aria-hidden={!isExpanded}
        >
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="relative mt-0.5 h-11 w-11 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border border-cyan-300 shadow-[0_6px_16px_rgba(37,99,235,0.35)]">
                <div className="absolute -left-1 top-1 h-3.5 w-3.5 rounded-full border border-cyan-300 bg-cyan-300" />
                <div className="absolute -right-1 top-1 h-3.5 w-3.5 rounded-full border border-cyan-300 bg-cyan-300" />
                <div className="absolute left-3 top-4 h-1.5 w-1.5 rounded-full bg-white" />
                <div className="absolute right-3 top-4 h-1.5 w-1.5 rounded-full bg-white" />
                <div className="absolute left-1/2 top-6 h-1.5 w-2.5 -translate-x-1/2 rounded-full bg-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Hi, share feedback or a request</p>
                <p className="mt-1 text-xs text-slate-500">Feature request, new chain request, or product feedback</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissFeedback}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close feedback panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Type</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
              >
                <option value="FEATURE_REQUEST">Feature Request</option>
                <option value="CHAIN_REQUEST">Chain Request</option>
                <option value="GENERAL_FEEDBACK">General Feedback</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Request / Feedback</label>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the feature, chain, or feedback in detail..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <p className="text-[11px] text-slate-500">{message.length}/2000</p>
            </div>

            {errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{errorMessage}</div>
            ) : null}

            {successMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{successMessage}</div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>

            <button
              type="button"
              onClick={closeExpandedFeedback}
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close feedback
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
