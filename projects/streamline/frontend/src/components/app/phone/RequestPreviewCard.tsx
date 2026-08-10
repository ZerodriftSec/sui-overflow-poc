import {
  dripIntervalMs,
  formatInterval,
  formatUsd,
  ratePerSecond,
  type DurationUnit,
} from "@/lib/stream-math";
import {
  resolveStreamRequest,
  type StreamRequestParams,
} from "@/lib/request-link";

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-[#777]">{label}</span>
      <span className="text-right text-[11px] font-medium tabular text-[#111]">{value}</span>
    </div>
  );
}

function formatDurationLabel(value: string, unit: DurationUnit): string {
  const n = Number(value) || 0;
  const label = unit === "hours" ? "hour" : unit === "weeks" ? "week" : "day";
  return `${n} ${n === 1 ? label : `${label}s`}`;
}

export function RequestPreviewCard({ request }: { request: StreamRequestParams }) {
  const resolved = resolveStreamRequest(request);
  const amountNum = resolved.amount;
  const milestoneCount = resolved.milestones.length;
  const previewSplits = request.useSplitConfig && !request.isPrivate ? request.splits : [];
  const dripRate = ratePerSecond(amountNum, resolved.durationMs);
  const dripInterval = dripIntervalMs(amountNum, resolved.durationMs);

  return (
    <div className="w-full rounded-2xl border border-black/12 bg-[#fafafa] p-4 text-left">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
        Request preview
      </p>
      <p className="mt-2 text-[28px] font-bold tabular leading-none tracking-tight text-[#111]">
        {request.isPrivate ? "Private" : formatUsd(amountNum)}
      </p>
      {request.streamName.trim() && (
        <p className="mt-1.5 text-[12px] font-medium text-[#444]">
          {request.streamName.trim()}
        </p>
      )}
      <div className="mt-3 space-y-1.5">
        {!request.isPrivate && (
          <>
            <PreviewRow
              label="Duration"
              value={formatDurationLabel(request.durationValue, request.durationUnit)}
            />
            <PreviewRow label="Settles every" value={formatInterval(dripInterval)} />
            <PreviewRow label="Rate" value={`${formatUsd(dripRate)} / sec`} />
          </>
        )}
        <PreviewRow label="Milestones" value={String(milestoneCount)} />
        <PreviewRow
          label="Per milestone"
          value={formatUsd(amountNum / Math.max(milestoneCount, 1))}
        />
        {request.isPrivate && (
          <p className="pt-1 text-[10px] leading-snug text-[#666]">
            Amount hidden on-chain when funded.
          </p>
        )}
        {previewSplits.length > 0 && (
          <div className="border-t border-black/8 pt-2">
            {previewSplits.map((s, i) => (
              <div key={i} className="flex justify-between text-[11px] text-[#444]">
                <span>
                  {s.label}
                  {s.yield ? " · yield" : ""}
                </span>
                <span className="tabular">{s.pct}%</span>
              </div>
            ))}
          </div>
        )}
        {request.note?.trim() && (
          <PreviewRow label="Note" value={request.note.trim()} />
        )}
      </div>
    </div>
  );
}
