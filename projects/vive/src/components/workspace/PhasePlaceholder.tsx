import type { StoryboardSource } from "../../lib/project";
import type { Phase } from "./types";

const PHASE_LABELS: Record<Phase, string> = {
  script: "Script",
  design: "Design",
  storyboard: "Storyboard",
  film: "Film",
};

interface PhasePlaceholderProps {
  phase: Phase;
  storyboardSource?: StoryboardSource | null;
}

export function PhasePlaceholder({
  phase,
  storyboardSource,
}: PhasePlaceholderProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-bg-viewer px-6 text-center">
      {phase === "storyboard" && storyboardSource ? (
        <>
          <p className="text-[13px] text-foreground">
            Storyboard from{" "}
            <span className="font-semibold">{storyboardSource.scriptTitle}</span>
            <span className="text-text-secondary">
              {" "}
              · v{storyboardSource.version}
            </span>
          </p>
          <p className="font-mono text-[13px] text-text-disabled">
            Shot planning — coming soon
          </p>
        </>
      ) : (
        <p className="font-mono text-[13px] text-text-disabled">
          {PHASE_LABELS[phase]} phase — coming soon
        </p>
      )}
    </div>
  );
}
