const STATS = [
  { value: "$0.00", label: "transfer fee on every drip" },
  { value: "≤ 60s", label: "settlement frequency" },
  { value: "5", label: "on-chain state machine" },
  { value: "1 bps", label: "keeper tip per drip" },
];

const TICKER = [
  "USDC",
  "USDsui",
  "SuiUSDe",
  "USDY",
  "FDUSD",
  "AUSD",
  "USDB",
  "Address Balances",
  "Programmable Transaction Blocks",
  "Move Object Model",
  "zkLogin",
  "Scallop",
  "NAVI",
];

export function StatsStrip() {
  return (
    <section className="w-full bg-[#f1f4f5]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-4 px-[5%] py-12 md:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.value}
            className="rounded bg-white px-6 py-8 shadow-[2px_2px_18px_rgba(0,0,0,0.08)]"
          >
            <span className="text-[clamp(28px,5vw,42px)] font-semibold leading-none text-[#f08030] tabular">
              {s.value}
            </span>
            <span className="mt-2 block text-sm text-[#555]">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden bg-[#111] py-3">
        <div className="sl-marquee flex w-max gap-8 whitespace-nowrap">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="flex items-center gap-8 text-xs font-medium tracking-wider text-white/70"
            >
              {t}
              <span className="text-[#f08030]">◆</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
