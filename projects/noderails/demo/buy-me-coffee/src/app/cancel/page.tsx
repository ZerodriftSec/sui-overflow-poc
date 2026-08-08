import Link from 'next/link';

export default function CancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-stone-200 bg-white p-10 shadow-lg">
        <h1 className="text-2xl font-bold text-stone-900">Payment cancelled</h1>
        <p className="mt-2 text-stone-600">No charge was made. You can try again anytime.</p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-stone-800 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-900"
        >
          Back to demo
        </Link>
      </div>
    </main>
  );
}
