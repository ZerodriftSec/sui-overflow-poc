import { Bot, Layers, SlidersHorizontal } from "lucide-react";

const CAPABILITIES = [
  {
    icon: SlidersHorizontal,
    title: "Creative control",
    description:
      "Edit any field directly or ask an agent to revise a single item. Skills and playbooks stay visible — never buried in system prompts.",
    highlights: ["Approval gates at every phase", "Per-beat and per-shot revision", "Draft, approved, and stale states"],
  },
  {
    icon: Bot,
    title: "Intelligent iteration",
    description:
      "Agents plan, generate, critique, and refine autonomously within each phase. Pick any model per step — scripting, visuals, or critique.",
    highlights: ["300+ models via OpenRouter", "Autonomous loops with human checkpoints", "Search across project history"],
  },
  {
    icon: Layers,
    title: "Persistent studio",
    description:
      "Projects, skills, and every revision live in your Walrus vault — Seal-encrypted and wallet-gated. Sync across sessions without losing a beat.",
    highlights: ["Reusable skills and playbooks", "Versioned artifact library", "You own every export"],
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="capabilities" className="landing-section border-t border-white/[0.04]">
      <div className="landing-container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="landing-eyebrow mb-4">Capabilities</p>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]">
            Professional speed.
            <span className="text-muted-foreground"> Human judgment.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {CAPABILITIES.map((capability) => (
            <article
              key={capability.title}
              className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] p-8 transition-colors hover:border-white/[0.1]"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-brand">
                <capability.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-semibold">{capability.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {capability.description}
              </p>
              <ul className="mt-6 space-y-2.5 border-t border-white/[0.06] pt-6">
                {capability.highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
