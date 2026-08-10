export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">NodeRails Checkout</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Use <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-sm">/pay/[intentId]</code> to pay
        </p>
      </div>
    </div>
  );
}
