"use client";

import type { StreamRecord } from "@/lib/indexer";
import { USDC_BASE } from "@/lib/stream-math";
import { Card, EmptyPanel, StateBadge } from "./dashboard-ui";

const usd = (base: number) => `$${(base / USDC_BASE).toFixed(2)}`;
const scanAddr = (a: string) =>
  `https://suiscan.xyz/testnet/account/${a}`;
const scanObj = (id: string) =>
  `https://suiscan.xyz/testnet/object/${id}`;

/**
 * Fully-settled streams, parked here permanently so the active tabs stay clean.
 * Public streams reveal the counterparty's full address (the client on a
 * freelancer's dashboard, the payee on a client's) now that the deal is done.
 */
export function CompletedStreams({
  streams,
  counterpartyLabel,
  counterpartyOf,
}: {
  streams: StreamRecord[];
  /** e.g. "Client" (freelancer view) or "Paid to" (client view). */
  counterpartyLabel: string;
  counterpartyOf: (s: StreamRecord) => string;
}) {
  if (streams.length === 0) {
    return (
      <EmptyPanel>
        No completed streams yet. A stream moves here once every milestone is
        settled — and stays.
      </EmptyPanel>
    );
  }

  return (
    <Card title={`Completed streams · ${streams.length}`} padded={false}>
      <div className="flex flex-col">
        {streams.map((s) => {
          const counterparty = counterpartyOf(s);
          return (
            <div
              key={s.id}
              className="grid grid-cols-1 gap-3 border-t border-[#2b2a5e]/10 p-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={scanObj(s.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[13px] underline-offset-2 hover:underline"
                  >
                    {s.id.slice(0, 8)}…{s.id.slice(-4)}
                  </a>
                  <StateBadge state="done" />
                  <span className="text-[11px] text-[#2b2a5e]/50">
                    {s.n_milestones} milestone{s.n_milestones === 1 ? "" : "s"} settled
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <span className="uppercase tracking-[0.12em] text-[#2b2a5e]/45">
                    {counterpartyLabel}
                  </span>
                  <a
                    href={scanAddr(counterparty)}
                    target="_blank"
                    rel="noreferrer"
                    className="select-all break-all font-mono text-[12px] text-[#5b54e6] underline-offset-2 hover:underline"
                    title="Revealed now that the stream is complete"
                  >
                    {counterparty}
                  </a>
                </div>
              </div>

              <div className="text-left md:text-right">
                <p className="tabular text-[15px] font-bold">{usd(s.total)}</p>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#2b2a5e]/45">
                  total settled
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
