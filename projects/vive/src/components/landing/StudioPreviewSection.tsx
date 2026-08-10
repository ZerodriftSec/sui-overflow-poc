const ASSET_FOLDERS = [
  {
    label: "Scripts",
    count: 2,
    expanded: true,
    assets: ["Summer Launch Reel", "Product Demo v2"],
    selectedAsset: "Summer Launch Reel",
  },
  { label: "Characters", count: 3, expanded: false },
  { label: "Environments", count: 1, expanded: false },
  { label: "Storyboard", count: 4, expanded: false },
  { label: "Video Clips", count: 0, expanded: false },
] as const;

const SCRIPT_LINES = [
  "HOOK (0–3s)",
  "What if your next launch video took an afternoon, not a week?",
  "",
  "PROBLEM (3–11s)",
  "Most teams bounce between docs, storyboards, and five different AI tools.",
  "",
  "DEMO (11–23s)",
  "Plan beats, approve frames, and export — all in one studio.",
] as const;

export function StudioPreviewSection() {
  return (
    <section id="studio" className="landing-section border-y border-white/[0.04] bg-white/[0.015]">
      <div className="landing-container">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="landing-eyebrow mb-4">The studio</p>
          <h2 className="landing-display text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]">
            A production workspace,
            <br />
            <span className="text-muted-foreground">not another chat box</span>
          </h2>
        </div>

        <div className="landing-studio-frame mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[oklch(0.11_0_0)] shadow-2xl shadow-black/50">
            {/* Top bar */}
            <div className="flex h-9 items-center justify-between border-b border-white/[0.06] bg-[oklch(0.14_0_0)] px-3">
              <span className="text-[11px] font-medium text-foreground">
                Summer Launch Reel
              </span>
              <span className="text-[10px] text-muted-foreground/70">Saved · 2m ago</span>
            </div>

            {/* Three-panel workspace */}
            <div className="grid min-h-[360px] grid-cols-12 gap-px bg-white/[0.04] sm:min-h-[420px] lg:min-h-[480px]">
              {/* Assets explorer */}
              <div className="col-span-3 hidden flex-col bg-[oklch(0.13_0_0)] sm:flex">
                <div className="flex h-9 items-center border-b border-white/[0.06] px-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Assets
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden py-1">
                  {ASSET_FOLDERS.map((folder) => (
                    <div key={folder.label}>
                      <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground">
                        <span className="w-3 text-[10px]">
                          {"expanded" in folder && folder.expanded ? "▾" : "▸"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                          {folder.label}
                        </span>
                        <span className="text-[10px] tabular-nums">{folder.count}</span>
                      </div>
                      {"assets" in folder && folder.expanded
                        ? folder.assets.map((asset) => (
                            <div
                              key={asset}
                              className={`ml-5 mr-2 truncate rounded px-2 py-1 text-[10px] ${
                                asset === folder.selectedAsset
                                  ? "bg-white/[0.06] ring-1 ring-brand/60 text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {asset}
                            </div>
                          ))
                        : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Asset content */}
              <div className="col-span-12 flex min-h-[280px] flex-col bg-[oklch(0.08_0_0)] sm:col-span-5 sm:min-h-0 lg:col-span-6">
                <div className="flex h-9 items-center border-b border-white/[0.06] bg-[oklch(0.12_0_0)] px-3">
                  <span className="truncate text-[11px] font-semibold text-foreground">
                    Summer Launch Reel
                  </span>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <div className="space-y-2 p-4 font-mono text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                    {SCRIPT_LINES.map((line, index) =>
                      line === "" ? (
                        <div key={index} className="h-2" />
                      ) : line.endsWith(")") ? (
                        <p key={index} className="font-sans text-[9px] font-bold uppercase tracking-wider text-brand/80">
                          {line}
                        </p>
                      ) : (
                        <p key={index} className="text-foreground/80">
                          {line}
                        </p>
                      ),
                    )}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[oklch(0.08_0_0)] to-transparent" />
                </div>
              </div>

              {/* Agent chat */}
              <div className="col-span-12 flex min-h-[220px] flex-col bg-[oklch(0.13_0_0)] sm:min-h-0 lg:col-span-3">
                <div className="flex h-9 items-center gap-1 border-b border-white/[0.06] px-2">
                  {(["Text", "Image", "Video"] as const).map((mode) => (
                    <span
                      key={mode}
                      className={`flex-1 rounded px-2 py-1 text-center text-[10px] font-medium ${
                        mode === "Text"
                          ? "bg-white/[0.06] text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {mode}
                    </span>
                  ))}
                </div>
                <div className="flex flex-1 flex-col justify-between p-3">
                  <div className="space-y-2">
                    <div className="rounded bg-white/[0.03] px-2 py-1.5 text-[10px] text-muted-foreground">
                      Tighten the hook — lead with the outcome, not the feature list.
                    </div>
                    <div className="rounded bg-brand/10 px-2 py-1.5 text-[10px] text-foreground/80">
                      Revised opening line with a stronger outcome-first hook.
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[10px] text-muted-foreground/60">
                    Ask or edit the selected asset…
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
