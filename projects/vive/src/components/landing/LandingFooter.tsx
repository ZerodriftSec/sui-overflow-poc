import { BrandLogo } from "../BrandLogo";

const FOOTER_LINKS = {
  Product: [
    { label: "Workflow", href: "#workflow" },
    { label: "Studio", href: "#studio" },
    { label: "Showcase", href: "#showcase" },
    { label: "Capabilities", href: "#capabilities" },
  ],
  Resources: [
    {
      label: "Walrus",
      href: "https://docs.wal.app",
      external: true,
    },
    {
      label: "Sui",
      href: "https://sui.io",
      external: true,
    },
  ],
} as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.04] py-16">
      <div className="landing-container">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <BrandLogo
              showWordmark
              imageClassName="h-7 w-7"
              wordmarkClassName="text-base landing-display font-semibold"
            />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Director-grade AI studio for short-form video production. From first
              idea to final export.
            </p>
          </div>

          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...("external" in link && link.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.04] pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground/70">
            © {new Date().getFullYear()} Vive. All rights reserved.
          </p>
          
        </div>
      </div>
    </footer>
  );
}
