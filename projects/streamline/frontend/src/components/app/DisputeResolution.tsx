"use client";

import { useState } from "react";
import { useSuiClientQuery } from "@mysten/dapp-kit";

import {
  buildProposeResolution,
  buildAcceptResolution,
} from "@/lib/streamline-tx";
import { useGaslessExecute } from "@/lib/use-gasless";
import { USDC_BASE } from "@/lib/stream-math";

/** Dynamic-field name of the on-chain ResolutionProposal (`b"dispute_proposal"`). */
const PROPOSAL_NAME = {
  type: "vector<u8>",
  value: Array.from(new TextEncoder().encode("dispute_proposal")),
};

type Proposal = { proposer: string; resume: boolean; freelancerBps: number };

function parseProposal(data: unknown): Proposal | null {
  const content = (data as { data?: { content?: { fields?: unknown } } })?.data
    ?.content;
  const fields = (content as { fields?: { value?: { fields?: Record<string, unknown> } } })
    ?.fields?.value?.fields;
  if (!fields) return null;
  return {
    proposer: String(fields["proposer"]),
    resume: Boolean(fields["resume"]),
    freelancerBps: Number(fields["freelancer_bps"] ?? 0),
  };
}

const usd = (base: number) => `$${(base / USDC_BASE).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Mutual dispute resolution for a PAUSED stream: either party proposes a way
 * out (resume, or split the remaining balance), the *other* party accepts.
 */
export function DisputeResolution({
  streamId,
  packageId,
  usdcType,
  me,
  remainingBase,
  onResolved,
}: {
  streamId: string;
  packageId: string;
  usdcType: string;
  me: string;
  remainingBase: number;
  onResolved?: () => void;
}) {
  const { execute, isPending } = useGaslessExecute();
  const [pct, setPct] = useState(50);
  const [status, setStatus] = useState<string | null>(null);

  const { data, refetch } = useSuiClientQuery(
    "getDynamicFieldObject",
    { parentId: streamId, name: PROPOSAL_NAME },
    { refetchInterval: 5000 }
  );
  const proposal = parseProposal(data);
  const mine = proposal?.proposer === me;

  const propose = (resume: boolean) => {
    setStatus("Awaiting signature…");
    execute(
      buildProposeResolution({
        packageId,
        usdcType,
        streamId,
        resume,
        freelancerBps: resume ? 0 : Math.round(pct * 100),
      }),
      {
        onSuccess: () => {
          setStatus("Proposal sent — waiting for the other party to accept.");
          refetch();
          onResolved?.();
        },
        onError: (e) => setStatus(e.message),
      }
    );
  };

  const accept = () => {
    setStatus("Awaiting signature…");
    execute(buildAcceptResolution({ packageId, usdcType, streamId }), {
      onSuccess: () => {
        setStatus("Dispute resolved.");
        refetch();
        onResolved?.();
      },
      onError: (e) => setStatus(e.message),
    });
  };

  const toFreelancer = Math.round((remainingBase * pct) / 100);

  return (
    <div className="mt-4 border border-[#c0533a]/30 bg-[#c0533a]/[0.04] p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#c0533a]">
        Resolve dispute (mutual)
      </p>

      {proposal && (
        <div className="mt-3 flex flex-col gap-2 border-b border-[#2b2a5e]/10 pb-3">
          <p className="text-[12px] text-[#2b2a5e]/80">
            Pending proposal from{" "}
            <span className="font-mono">{short(proposal.proposer)}</span>:{" "}
            <strong>
              {proposal.resume
                ? "resume the stream"
                : `split — freelancer ${(proposal.freelancerBps / 100).toFixed(0)}%, client refund ${(
                    (10000 - proposal.freelancerBps) /
                    100
                  ).toFixed(0)}%`}
            </strong>
          </p>
          {mine ? (
            <p className="text-[11px] text-[#2b2a5e]/55">
              Waiting for the other party to accept these terms.
            </p>
          ) : (
            <button
              onClick={accept}
              disabled={isPending}
              className="self-start bg-[#1d9e75] px-5 py-2.5 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "…" : "accept proposal"}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3">
        <p className="text-[12px] text-[#2b2a5e]/70">
          {proposal ? "Or propose different terms:" : "Propose how to settle:"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => propose(true)}
            disabled={isPending}
            className="border border-[#5b54e6] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#5b54e6] hover:bg-[#5b54e6]/[0.06] disabled:opacity-40"
          >
            propose resume
          </button>
          <span className="text-[11px] text-[#2b2a5e]/40">or split:</span>
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) =>
              setPct(Math.max(0, Math.min(100, Number(e.target.value))))
            }
            className="w-16 border border-[#2b2a5e]/20 bg-transparent px-2 py-1.5 text-[12px] tabular"
          />
          <span className="text-[11px] text-[#2b2a5e]/60">
            % to freelancer ({usd(toFreelancer)} of {usd(remainingBase)})
          </span>
          <button
            onClick={() => propose(false)}
            disabled={isPending}
            className="border border-[#c0533a] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#c0533a] hover:bg-[#c0533a]/[0.06] disabled:opacity-40"
          >
            propose split
          </button>
        </div>
        {status && (
          <p className="text-[11px] text-[#2b2a5e]/70">{status}</p>
        )}
      </div>
    </div>
  );
}
