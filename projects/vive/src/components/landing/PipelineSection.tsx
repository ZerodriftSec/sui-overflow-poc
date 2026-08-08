import { FileText, Film, ImageIcon, Palette } from "lucide-react";

const PHASES = [
  {
    icon: FileText,
    name: "Script",
    description: "Structure hooks, narration, and pacing beat by beat.",
  },
  {
    icon: Palette,
    name: "Design",
    description: "Define characters, environments, and visual style for the reel.",
  },
  {
    icon: ImageIcon,
    name: "Storyboard",
    description: "Plan every shot and frame before generating video.",
  },
  {
    icon: Film,
    name: "Film",
    description: "Generate video clips from your storyboard frames and approve every take.",
  },
] as const;

export function PipelineSection() {
  return (
    <section id="workflow" className="landing-section">
      <div className="landing-container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="landing-eyebrow mb-4">Workflow</p>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]">
            Four phases.
            <span className="text-muted-foreground"> Zero guesswork.</span>
          </h2>
          <p className="mt-5 text-base text-muted-foreground leading-relaxed sm:text-lg">
            Advance only when you approve. Agents work inside each phase — revising
            one beat, one shot, or one clip at a time.
          </p>
        </div>

        <div className="relative">
          <div className="absolute top-[2.75rem] left-[10%] right-[10%] hidden h-px bg-gradient-to-r from-transparent via-white/10 to-transparent lg:block" />

          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {PHASES.map((phase, index) => (
              <li
                key={phase.name}
                className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-brand transition-colors group-hover:border-brand/20 group-hover:bg-brand/10">
                    <phase.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold">{phase.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {phase.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
