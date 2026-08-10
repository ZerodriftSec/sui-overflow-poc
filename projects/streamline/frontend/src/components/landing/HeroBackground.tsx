import { LineWaveBackground } from "./LineWaveBackground";
import { ShinyNoiseFilter } from "./ShinyNoiseFilter";
import type { SceneTheme } from "./heroScenes";

type HeroBackgroundProps = {
  theme?: SceneTheme;
};

export function HeroBackground({ theme = "light" }: HeroBackgroundProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <ShinyNoiseFilter />
      <LineWaveBackground theme={theme} />
    </div>
  );
}
