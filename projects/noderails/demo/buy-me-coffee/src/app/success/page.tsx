import { Suspense } from 'react';
import { SuccessAwaitingWebhook } from '@/components/success-awaiting-webhook';

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6">
          <p className="text-stone-500">Loading…</p>
        </main>
      }
    >
      <SuccessAwaitingWebhook />
    </Suspense>
  );
}
