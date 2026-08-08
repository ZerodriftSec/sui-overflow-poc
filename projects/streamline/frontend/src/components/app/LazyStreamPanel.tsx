"use client";

import { useCallback, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import type { SuiClient } from "@mysten/sui/client";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { toBaseUnits, USDC_BASE } from "@/lib/stream-math";
import {
  buildCreateLazyStream,
  buildSettleLazy,
  buildClaimLazy,
  commit,
  commitParams,
  lazyNewCommitments,
  proveLazyDrip,
  proveUnwrap,
  proveWrap,
  randomBlinding,
} from "@/lib/confidential";
import {
  addLazy,
  loadLazy,
  updateLazy,
  vestedBase,
  type LazyStreamSecret,
} from "@/lib/lazy-stream-store";

const s = (x: bigint) => x.toString();
const usd = (base: bigint | string) => `$${(Number(base) / USDC_BASE).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Find the LazyStream shared object created by a `create` tx. */
async function findCreatedLazyStream(
  client: SuiClient,
  digest: string
): Promise<string | null> {
  try {
    await client.waitForTransaction({ digest });
    const tb = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const c = tb.objectChanges?.find(
      (o) =>
        o.type === "created" &&
        "objectType" in o &&
        typeof o.objectType === "string" &&
        o.objectType.includes("::lazy_stream::LazyStream")
    );
    return c && "objectId" in c ? c.objectId : null;
  } catch {
    return null;
  }
}

export function LazyStreamPanel() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const address = account?.address ?? "";

  const [amount, setAmount] = useState("1000");
  const [days, setDays] = useState("30");
  const [freelancer, setFreelancer] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const streams = address ? loadLazy(address) : [];
  const bump = () => setTick((t) => t + 1);

  const onCreate = useCallback(async () => {
    if (!address) return;
    setStatus(null);
    try {
      const capBase = toBaseUnits(Number(amount));
      const durationSec = Math.floor(Number(days) * 86400);
      if (capBase <= 0n || durationSec <= 0) return;
      const rate = capBase / BigInt(durationSec); // base units / second (floor)
      if (rate < 1n) {
        setStatus("Amount too small for that duration (rate < 1 unit/sec).");
        return;
      }
      const recipient = (freelancer.trim() || address).toLowerCase();
      const start = BigInt(Math.floor(Date.now() / 1000));
      const rRem = randomBlinding();
      const rEarned = randomBlinding();
      const rParams = randomBlinding();

      setStatus("Proving the locked amount (wrap)…");
      const remainingCommitment = await commit(capBase, rRem);
      const earnedCommitment = await commit(0n, rEarned);
      const paramsCommitment = await commitParams(rate, start, capBase, rParams);
      const wrap = await proveWrap(capBase, rRem);

      setStatus("Awaiting signature…");
      const tx = buildCreateLazyStream({
        packageId,
        coinType: usdcType,
        sender: address,
        capBase,
        freelancer: recipient,
        remainingCommitment,
        wrapProof: wrap.proof,
        earnedCommitment,
        paramsCommitment,
        encryptedSecrets: new Uint8Array(),
      });
      await execute(tx, {
        onSuccess: async ({ digest }) => {
          const streamId = await findCreatedLazyStream(client, digest);
          if (streamId) {
            addLazy(address, {
              streamId,
              coinType: usdcType,
              sender: address,
              freelancer: recipient,
              capBase: s(capBase),
              rate: s(rate),
              start: s(start),
              remainingBase: s(capBase),
              rRem: s(rRem),
              earnedBase: "0",
              rEarned: s(rEarned),
              rParams: s(rParams),
              createdAt: Date.now(),
            });
            bump();
          }
          setStatus(`Lazy stream created — ${usd(capBase)} locked, hidden vesting.`);
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [address, amount, days, freelancer, packageId, usdcType, execute, client]);

  const onSettle = useCallback(
    async (sec: LazyStreamSecret) => {
      if (!address) return;
      setStatus(null);
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const vested = vestedBase(sec, nowSec);
        const earnedOld = BigInt(sec.earnedBase);
        const delta = vested - earnedOld;
        if (delta <= 0n) {
          setStatus("Nothing newly vested yet — wait a bit.");
          return;
        }
        const rRemNew = randomBlinding();
        const rEarnedNew = randomBlinding();
        setStatus("Proving the confidential settle…");
        const pf = await proveLazyDrip({
          remainingOld: BigInt(sec.remainingBase),
          rRemOld: BigInt(sec.rRem),
          rRemNew,
          earnedOld,
          rEarnedOld: BigInt(sec.rEarned),
          rEarnedNew,
          delta,
          rate: BigInt(sec.rate),
          start: BigInt(sec.start),
          cap: BigInt(sec.capBase),
          rParams: BigInt(sec.rParams),
          nowSec: BigInt(nowSec),
        });
        const { newRemaining, newEarned } = lazyNewCommitments(pf);
        setStatus("Awaiting signature…");
        const tx = buildSettleLazy({
          packageId,
          coinType: sec.coinType,
          streamId: sec.streamId,
          newRemaining,
          newEarned,
          proof: pf.proof,
          nowSec: BigInt(nowSec),
        });
        await execute(tx, {
          onSuccess: () => {
            updateLazy(address, sec.streamId, {
              remainingBase: s(BigInt(sec.remainingBase) - delta),
              rRem: s(rRemNew),
              earnedBase: s(vested),
              rEarned: s(rEarnedNew),
            });
            bump();
            setStatus(`Settled ${usd(delta)} — hidden on-chain ✓`);
          },
          onError: (e) => setStatus(e.message),
        });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [address, packageId, execute]
  );

  const onClaim = useCallback(
    async (sec: LazyStreamSecret) => {
      if (!address) return;
      setStatus(null);
      try {
        const earned = BigInt(sec.earnedBase);
        if (earned <= 0n) {
          setStatus("Nothing earned to claim — settle first.");
          return;
        }
        setStatus("Proving the claim (unwrap)…");
        const pf = await proveUnwrap(earned, BigInt(sec.rEarned));
        setStatus("Awaiting signature…");
        const tx = buildClaimLazy({
          packageId,
          coinType: sec.coinType,
          streamId: sec.streamId,
          amount: earned,
          unwrapProof: pf.proof,
          recipient: sec.freelancer,
        });
        await execute(tx, {
          onSuccess: () => {
            // Contract reset earned to Poseidon(0,0) — mirror (0, 0) locally.
            updateLazy(address, sec.streamId, { earnedBase: "0", rEarned: "0" });
            bump();
            setStatus(`Claimed ${usd(earned)} to ${short(sec.freelancer)}.`);
          },
          onError: (e) => setStatus(e.message),
        });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [address, packageId, execute]
  );

  if (!address) return null;
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="space-y-4" data-tick={tick}>
      <div className="rounded-2xl border border-[#6c5ce7]/25 bg-white p-4">
        <p className="text-[13px] font-semibold text-[#111]">New lazy private stream</p>
        <p className="mt-1 text-[11px] text-[#666]">
          Vests linearly, settles in one proof — no drips, no keeper. Amounts hidden;
          only the locked total is public.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-[10px] text-[#888]">
            Amount (USDC)
            <input
              className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12px]"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="text-[10px] text-[#888]">
            Duration (days)
            <input
              className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12px]"
              inputMode="decimal"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
          <label className="text-[10px] text-[#888]">
            Recipient (blank = you)
            <input
              className="mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 font-mono text-[11px]"
              placeholder="0x…"
              value={freelancer}
              onChange={(e) => setFreelancer(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={onCreate}
          className="mt-3 rounded-full bg-[#6c5ce7] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "Working…" : "Create lazy stream"}
        </button>
      </div>

      {status && (
        <p className="text-[11px] leading-snug text-[#6c5ce7]">{status}</p>
      )}

      {streams.map((sec) => {
        const vested = vestedBase(sec, nowSec);
        const claimable = vested - BigInt(sec.earnedBase);
        return (
          <div
            key={sec.streamId}
            className="rounded-2xl border border-black/10 bg-white p-3.5"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] text-[#888]">
                {short(sec.streamId)} → {short(sec.freelancer)}
              </p>
              <span className="rounded-full bg-[#6c5ce7]/12 px-2 py-0.5 text-[8px] font-bold uppercase text-[#6c5ce7]">
                🔒 lazy
              </span>
            </div>
            <p className="mt-2 text-[16px] font-bold text-[#111]">
              {usd(sec.capBase)}{" "}
              <span className="text-[10px] font-medium text-[#888]">locked</span>
            </p>
            <p className="mt-1 text-[10px] text-[#666]">
              vested {usd(vested)} · earned {usd(sec.earnedBase)} · newly claimable{" "}
              {usd(claimable > 0n ? claimable : 0n)}
            </p>
            <p className="mt-1 text-[9px] text-[#aaa]">
              (these figures are local; on-chain only the locked total is visible)
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => onSettle(sec)}
                className="rounded-full border border-[#6c5ce7]/40 px-3 py-1 text-[10px] font-semibold text-[#6c5ce7] disabled:opacity-50"
              >
                Settle earned
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => onClaim(sec)}
                className="rounded-full border border-black/15 px-3 py-1 text-[10px] font-semibold text-[#333] disabled:opacity-50"
              >
                Claim to cash
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
