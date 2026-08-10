import { Link, useLocation } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { cn } from "../lib/utils";

interface AppTopNavLinksProps {
  className?: string;
}

export function AppTopNavLinks({ className }: AppTopNavLinksProps) {
  const { pathname } = useLocation();

  const isProjectsActive =
    pathname === "/app" || pathname.startsWith("/app/projects");
  const isSkillsActive = pathname.startsWith("/app/skills");

  const itemClass =
    "rounded px-2 py-0.5 text-[11px] transition-colors";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Link
        to="/"
        aria-label="Vive home"
        className="text-text-secondary hover:text-foreground transition-opacity hover:opacity-80"
      >
        <BrandLogo imageClassName="h-5 w-5" />
      </Link>
      <Link
        to="/app"
        className={cn(
          itemClass,
          isProjectsActive
            ? "bg-bg-raised text-foreground"
            : "text-text-secondary hover:bg-bg-raised hover:text-foreground",
        )}
      >
        Projects
      </Link>
      <Link
        to="/app/skills"
        className={cn(
          itemClass,
          isSkillsActive
            ? "bg-bg-raised text-foreground"
            : "text-text-secondary hover:bg-bg-raised hover:text-foreground",
        )}
      >
        Skills
      </Link>
    </div>
  );
}
