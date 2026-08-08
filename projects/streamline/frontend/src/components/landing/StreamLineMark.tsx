import Image from "next/image";

type StreamLineMarkProps = {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "pro";
  className?: string;
};

const SIZES = {
  sm: { className: "h-7 w-7", px: 28 },
  md: { className: "h-10 w-10", px: 40 },
  lg: { className: "h-12 w-12", px: 48 },
};

export function StreamLineMark({
  size = "md",
  variant = "default",
  className = "",
}: StreamLineMarkProps) {
  const pro = variant === "pro";
  const { className: sizeClass, px } = SIZES[size];

  return (
    <Image
      src="/logo.png"
      alt=""
      width={px}
      height={px}
      className={`shrink-0 rounded-lg object-contain ${
        pro ? "brightness-0 invert opacity-90" : ""
      } ${sizeClass} ${className}`}
      priority={size === "md"}
      aria-hidden
    />
  );
}
