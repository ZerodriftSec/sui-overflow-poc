export interface StyleBriefStarter {
  label: string;
  value: string;
}

/** Clickable style presets for agentic mode — fill the style brief textarea; still editable. */
export const STYLE_BRIEF_STARTERS: StyleBriefStarter[] = [
  {
    label: "Cinematic",
    value:
      "Cinematic short-form realism, natural motivated lighting, shallow depth of field, cohesive film color grade, grounded textures.",
  },
  {
    label: "Anime",
    value:
      "Painterly anime, expressive character design, soft bloom, vibrant saturated palette, clean linework, cohesive 2D illustration look.",
  },
  {
    label: "Cyberpunk",
    value:
      "Neon cyberpunk, rain-slick urban night, high contrast, moody teal-magenta lighting, holographic accents, gritty futuristic detail.",
  },
  {
    label: "Documentary",
    value:
      "Documentary realism, handheld camera feel, natural available light, authentic locations, muted natural palette, unstyled textures.",
  },
  {
    label: "3D render",
    value:
      "Minimalist 3D render, clean studio lighting, soft shadows, smooth materials, product-ad polish, neutral backdrop.",
  },
  {
    label: "Retro film",
    value:
      "Retro 80s analog film, warm halation, subtle grain, saturated practical lighting, nostalgic color cast, soft vignette.",
  },
];
