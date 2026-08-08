import { cn } from "../lib/utils";

const LOGO_SRC = "/logo.png";

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

export function BrandLogo({
  className,
  imageClassName = "h-8 w-8",
  showWordmark = false,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <img
        src={LOGO_SRC}
        alt=""
        aria-hidden
        className={cn("shrink-0 object-contain", imageClassName)}
      />
      {showWordmark && (
        <span className={cn("font-semibold tracking-tight", wordmarkClassName)}>
          Vive
        </span>
      )}
    </span>
  );
}
