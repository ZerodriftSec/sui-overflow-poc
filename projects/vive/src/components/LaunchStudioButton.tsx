import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { useLaunchStudio } from "../hooks/useLaunchStudio";

interface LaunchStudioButtonProps {
  children: ReactNode;
  className?: string;
}

export function LaunchStudioButton({ children, className }: LaunchStudioButtonProps) {
  const { launchStudio, loading } = useLaunchStudio("/app");

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void launchStudio()}
      className={cn(className, loading && "opacity-70")}
    >
      {children}
    </button>
  );
}
