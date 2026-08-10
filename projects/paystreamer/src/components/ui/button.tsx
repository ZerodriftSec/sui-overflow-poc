import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Loader2 } from "lucide-react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "gradient";
  size?: "default" | "sm" | "lg";
  loading?: boolean;
};

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  href,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
      "bg-primary text-primary-foreground shadow hover:bg-primary/90":
        variant === "default",
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80":
        variant === "secondary",
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground":
        variant === "outline",
      "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
      "bg-gradient-to-br from-accent-primary to-accent-secondary text-white shadow hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all":
        variant === "gradient",
    },
    {
      "h-9 px-4 py-2": size === "default",
      "h-8 rounded-md px-3 text-xs": size === "sm",
      "h-10 rounded-md px-8": size === "lg",
    },
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </a>
    );
  }

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export { Button };
