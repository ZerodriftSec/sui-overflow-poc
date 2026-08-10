"use client";

import { useMemo, useState } from "react";

import { shortAddress } from "@/lib/format";
import {
  validateResolvedStreamRequest,
  resolveStreamRequest,
  type StreamRequestParams,
} from "@/lib/request-link";
import { useCreateStreamFromRequest } from "@/lib/use-create-stream-from-request";
import { RequestPreviewCard } from "./RequestPreviewCard";

type PhoneFulfillRequestViewProps = {
  request: StreamRequestParams;
  onAccepted: () => void;
  onDecline: () => void;
};

export function PhoneFulfillRequestView({
  request,
  onAccepted,
  onDecline,
}: PhoneFulfillRequestViewProps) {
  const resolved = useMemo(() => resolveStreamRequest(request), [request]);
  const validationErrors = useMemo(
    () => validateResolvedStreamRequest(resolved),
    [resolved]
  );
  const { createFromRequest, busy, status, deployed } = useCreateStreamFromRequest();
  const [completed, setCompleted] = useState(false);

  const onAccept = async () => {
    const ok = await createFromRequest(request);
    if (ok) setCompleted(true);
  };

  const blockReason = !deployed
    ? "Move package not set for this network."
    : validationErrors[0];

  return (
    <div
      className="sl-scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-4 pt-6"
      data-demo="fulfill-review"
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
            Review request
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-[#666]">
            Fund this stream exactly as requested — accept to lock USDC on-chain.
          </p>
        </div>

        <RequestPreviewCard request={request} />

        <div className="rounded-2xl border border-black/10 bg-transparent px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
            Recipient
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-[#444]">
            {shortAddress(request.recipient, 10, 8)}
          </p>
        </div>

        {blockReason && !busy && (
          <p className="text-[11px] text-[#c0533a]">{blockReason}</p>
        )}
        {status && (
          <p className="break-words text-[11px] text-[#666]">{status}</p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {completed ? (
            <button
              type="button"
              onClick={onAccepted}
              data-demo-action="fulfill-done"
              className="w-full rounded-2xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onAccept}
                disabled={!!blockReason || busy}
                data-demo-action="fulfill-accept"
                className="w-full rounded-2xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
              >
                {busy ? "Processing…" : "Accept & fund"}
              </button>
              <button
                type="button"
                onClick={onDecline}
                disabled={busy}
                className="w-full rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] disabled:opacity-40"
              >
                Decline
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
