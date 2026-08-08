"use client";

import { useProWorkspace } from "./ProWorkspaceContext";

/** Banner when Seal-sealed roster needs an org-wallet unlock. */
export function RosterUnlockBanner() {
  const { workspace, unlockRoster, rosterUnlocking, isDemo, address } =
    useProWorkspace();

  if (isDemo || !address || !workspace.rosterLocked) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div>
        <p className="text-[12px] font-semibold text-white">Roster locked</p>
        <p className="mt-0.5 text-[11px] text-white/45">
          Worker names and salaries are Seal-encrypted to your org wallet. Sign
          once to unlock this session.
        </p>
      </div>
      <button
        type="button"
        className="sl-glass-btn-dark sl-glass-btn-dark-primary !px-4 !py-2 !text-[11px]"
        disabled={rosterUnlocking}
        onClick={() => void unlockRoster()}
      >
        {rosterUnlocking ? "Unlocking…" : "Unlock roster"}
      </button>
    </div>
  );
}

export function HireModeBadge({
  mode,
}: {
  mode?: "private" | "public";
}) {
  const privateHire = (mode ?? "private") === "private";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
        privateHire
          ? "bg-emerald-500/15 text-emerald-300/90"
          : "bg-white/10 text-white/50"
      }`}
    >
      {privateHire ? "Private" : "Public"}
    </span>
  );
}
