const PILLARS = [
  {
    no: "01",
    title: "Address Balances",
    body: "Zero-fee transfers at protocol level via 0x2::balance::send_funds — not a subsidy or relayer. Enables true per-interval streaming at any payment size. On Ethereum every drip costs gas.",
  },
  {
    no: "02",
    title: "PTB atomicity",
    body: "The split (pay + save + invest) executes as one atomic transaction. If the yield-routing leg fails, the whole drip reverts — protecting split integrity.",
  },
  {
    no: "03",
    title: "Move object ownership",
    body: "The locked Balance lives inside a shared object, reachable only through entry functions. A structural property of Move's type system — no reentrancy, no approval manipulation.",
  },
  {
    no: "04",
    title: "zkLogin",
    body: "Google OAuth produces a Sui address directly. No seed phrase, no wallet install. A freelancer signs up with Gmail and immediately receives streams.",
  },
];

export function WhySuiSection() {
  return (
    <section id="why-sui" className="w-full bg-white px-[5%] py-20 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <p className="mb-3 text-sm font-medium tracking-wider text-[#f08030]">
          Why this is Sui-native
        </p>
        <h2 className="max-w-3xl text-[clamp(28px,5vw,44px)] font-semibold leading-tight">
          Why does this exist on Sui and not Ethereum or Solana?
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {PILLARS.map((p) => (
            <div
              key={p.no}
              className="rounded bg-[#f1f4f5] p-8 shadow-[2px_2px_18px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-baseline gap-4">
                <span className="text-sm font-semibold text-[#f08030]">
                  {p.no}
                </span>
                <h3 className="text-xl font-semibold">{p.title}</h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#555]">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
