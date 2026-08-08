import Link from "next/link";

import type { SceneTheme } from "./heroScenes";

type LegalFooterProps = {
  theme?: SceneTheme;
};

const LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
] as const;

export function LegalFooter({ theme = "light" }: LegalFooterProps) {
  const linkClass =
    theme === "pro"
      ? "text-white/45 transition-colors hover:text-white/70"
      : "text-black/40 transition-colors hover:text-black/65";

  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] font-medium">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={linkClass}>
          {link.label}
        </Link>
      ))}
    </footer>
  );
}
