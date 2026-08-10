import { SandboxProvider } from "./_lib/demo-state";

/**
 * Authenticated-app shell layout.
 *
 * Wraps every page under /app in the SandboxProvider so the portfolio,
 * basket, tranche, and PPN pages all share one in-memory demo state.
 * The root <html>/<body> stays at `../layout.tsx`; this one only
 * renders children.
 *
 * Uses Next.js 16's global `LayoutProps<'/app'>` helper (auto-generated during
 * `next dev` / `next build` / `next typegen`) to satisfy the typed-routes
 * validator.
 */
export default function AppShellLayout({ children }: LayoutProps<'/app'>) {
  // ModeProvider now lives at the ROOT layout (../layout.tsx) so the landing page
  // shares it too; here we only need the per-/app sandbox demo state.
  return <SandboxProvider>{children}</SandboxProvider>;
}
