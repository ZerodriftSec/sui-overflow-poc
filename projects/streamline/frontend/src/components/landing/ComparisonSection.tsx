type Row = {
  name: string;
  chain: string;
  gasless: boolean;
  milestones: boolean;
  splits: boolean;
  collateral: boolean;
  highlight?: boolean;
};

const ROWS: Row[] = [
  { name: "Sablier", chain: "Ethereum", gasless: false, milestones: false, splits: false, collateral: false },
  { name: "Superfluid", chain: "Ethereum/L2", gasless: false, milestones: false, splits: false, collateral: false },
  { name: "Drips (Radicle)", chain: "Ethereum", gasless: false, milestones: false, splits: false, collateral: false },
  { name: "LlamaPay", chain: "Multi-EVM", gasless: false, milestones: false, splits: false, collateral: false },
  { name: "StreamLine", chain: "Sui", gasless: true, milestones: true, splits: true, collateral: true, highlight: true },
];

function Cell({ on }: { on: boolean }) {
  return (
    <span className={on ? "font-semibold text-[#1d9e75]" : "text-[#555]/40"}>
      {on ? "Yes" : "No"}
    </span>
  );
}

export function ComparisonSection() {
  return (
    <section id="compare" className="w-full bg-[#f1f4f5] px-[5%] py-20 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <p className="mb-3 text-sm font-medium tracking-wider text-[#f08030]">
          Competitive landscape
        </p>
        <h2 className="max-w-3xl text-[clamp(28px,5vw,44px)] font-semibold leading-tight">
          The first streaming protocol where the money genuinely arrives.
        </h2>

        <div className="mt-12 overflow-x-auto rounded bg-white shadow-[2px_2px_18px_rgba(0,0,0,0.08)]">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#111] text-xs font-medium tracking-wide text-white/80">
                <th className="px-5 py-4 font-medium">Protocol</th>
                <th className="px-5 py-4 font-medium">Chain</th>
                <th className="px-5 py-4 font-medium">Gasless</th>
                <th className="px-5 py-4 font-medium">Milestones</th>
                <th className="px-5 py-4 font-medium">Split auto</th>
                <th className="px-5 py-4 font-medium">Collateral</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr
                  key={r.name}
                  className={
                    r.highlight
                      ? "bg-[#f08030]/10 font-medium"
                      : i % 2
                        ? "bg-[#f1f4f5]/60"
                        : ""
                  }
                >
                  <td className="px-5 py-4">
                    {r.highlight ? (
                      <span className="font-semibold text-[#f08030]">
                        {r.name}
                      </span>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="px-5 py-4 text-[#555]">{r.chain}</td>
                  <td className="px-5 py-4">
                    <Cell on={r.gasless} />
                  </td>
                  <td className="px-5 py-4">
                    <Cell on={r.milestones} />
                  </td>
                  <td className="px-5 py-4">
                    <Cell on={r.splits} />
                  </td>
                  <td className="px-5 py-4">
                    <Cell on={r.collateral} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-[#555]">
          Every EVM streaming protocol requires recipients to periodically claim
          accumulated balance — a gas-paying action. On StreamLine the money lands
          continuously, with no action required and no fee for either party.
        </p>
      </div>
    </section>
  );
}
