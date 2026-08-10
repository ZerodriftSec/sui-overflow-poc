const STATES = [
  { name: "LOCKED", sub: "waiting", tone: "ink" },
  { name: "PENDING", sub: "raised", tone: "amber" },
  { name: "DRIPPING", sub: "approved", tone: "flow" },
  { name: "PAUSED", sub: "dispute", tone: "rust" },
  { name: "DONE", sub: "exhausted", tone: "brand" },
];

const TONE: Record<string, string> = {
  ink: "bg-[#111] text-white",
  amber: "bg-[#d98a2b] text-white",
  flow: "bg-[#1d9e75] text-white",
  rust: "bg-[#c0533a] text-white",
  brand: "bg-[#f08030] text-white",
};

const FLOW = [
  ["Setup", "Client", "create_stream() — locks full amount", "LOCKED"],
  ["Signal done", "Freelancer", "raise_completion() — sets review deadline", "PENDING_REVIEW"],
  ["Review", "Client", "approve_milestone() via StreamCap", "DRIPPING"],
  ["Auto-approve", "Keeper", "approve_milestone() after 48h deadline", "DRIPPING"],
  ["Settlement", "Keeper", "drip() — send_funds() gasless per split", "DRIPPING"],
  ["Dispute", "Client", "raise_dispute() — stream pauses", "PAUSED"],
  ["Completion", "Protocol", "all milestones exhausted", "DONE"],
];

export function HowItWorksSection() {
  return (
    <section id="how" className="w-full bg-[#f1f4f5] px-[5%] py-20 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <p className="mb-3 text-sm font-medium tracking-wider text-[#f08030]">
          How it works
        </p>
        <h2 className="max-w-3xl text-[clamp(28px,5vw,44px)] font-semibold leading-tight">
          A state machine enforced by Move — not a bypassable require().
        </h2>

        <div className="mt-12 flex flex-wrap items-stretch gap-3">
          {STATES.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2">
              <div
                className={`flex w-32 flex-col rounded px-4 py-5 ${TONE[s.tone]}`}
              >
                <span className="text-sm font-semibold tracking-wide">
                  {s.name}
                </span>
                <span className="text-xs opacity-75">{s.sub}</span>
              </div>
              {i < STATES.length - 1 && (
                <span className="text-[#555]/40">→</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 overflow-hidden rounded bg-white shadow-[2px_2px_18px_rgba(0,0,0,0.08)]">
          <div className="grid grid-cols-12 gap-2 bg-[#111] px-5 py-3 text-xs font-medium tracking-wide text-white/80">
            <span className="col-span-2">Phase</span>
            <span className="col-span-2">Actor</span>
            <span className="col-span-6">On-chain action</span>
            <span className="col-span-2">State after</span>
          </div>
          {FLOW.map((row, i) => (
            <div
              key={row[0]}
              className={`grid grid-cols-12 gap-2 px-5 py-4 text-sm ${
                i % 2 ? "bg-[#f1f4f5]/60" : ""
              }`}
            >
              <span className="col-span-2 font-medium">{row[0]}</span>
              <span className="col-span-2 text-[#555]">{row[1]}</span>
              <span className="col-span-6 font-mono text-[#555]">
                {row[2]}
              </span>
              <span className="col-span-2 font-semibold text-[#f08030]">
                {row[3]}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-[#555]">
          The auto-approve timer protects the freelancer: if a client goes silent
          after a milestone is raised, the keeper calls approve_milestone() after
          the deadline (default 48h). Silence equals approval.
        </p>
      </div>
    </section>
  );
}
