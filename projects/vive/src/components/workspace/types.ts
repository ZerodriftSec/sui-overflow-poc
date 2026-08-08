export type { WorkspaceMode } from "../../lib/workflow";

export type Phase = "script" | "design" | "storyboard" | "film";

export const PHASES: { id: Phase; label: string }[] = [
  { id: "script", label: "Script" },
  { id: "design", label: "Design" },
  { id: "storyboard", label: "Storyboard" },
  { id: "film", label: "Film" },
];
