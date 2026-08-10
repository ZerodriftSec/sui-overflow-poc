"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient, useSuiClientContext } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { toBaseUnits, USDC_BASE } from "@/lib/stream-math";
import { randomBlinding } from "@/lib/confidential";
import { SHIELDED_POOL, type NetworkName } from "@/lib/constants";
import {
  pk,
  nullifier,
  noteCommit,
  merklePath,
  fetchCommitments,
  fetchUsedNullifiers,
  proveDeposit,
  proveShielded,
  proveWithdraw,
  signalsBig,
  buildDeposit,
  buildSpend,
  buildWithdraw,
  scanIncoming,
} from "@/lib/shielded";
import {
  myShieldedAddress,
  parseShieldedAddress,
  encryptNote,
} from "@/lib/shielded-address";
import {
  getSpendKey,
  loadNotes,
  addNote,
  markSpent,
  type ShieldedNote,
} from "@/lib/shielded-store";
import {
  usePrivacyRelayer,
  relaySubmit,
} from "@/lib/privacy-relayer";
import {
  overfundAmount,
  proveOverfundDeposit,
  proveSplitAfterDeposit,
} from "@/lib/overfund-split";

const s = (x: bigint) => x.toString();
const usd = (base: bigint | string) => `$${(Number(base) / USDC_BASE).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** First unspent note holding at least `need` base units. */
function pickNote(notes: ShieldedNote[], need: bigint): ShieldedNote | null {
  return notes.find((n) => !n.spent && BigInt(n.value) >= need) ?? null;
}

export function ShieldedPanel() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const { execute, isPending } = useGaslessExecute();
  const address = account?.address ?? "";
  const poolId = SHIELDED_POOL[(network as NetworkName) ?? "testnet"];
  const { data: relayer } = usePrivacyRelayer();
  const relayOn = !!relayer?.enabled && !!relayer.address;

  const [useRelay, setUseRelay] = useState(true);
  const [overfundSplit, setOverfundSplit] = useState(true);
  const [depositAmt, setDepositAmt] = useState("100");
  const [transferAmt, setTransferAmt] = useState("25");
  const [recipientAddr, setRecipientAddr] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("50");
  const [payTo, setPayTo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [myAddr, setMyAddr] = useState("");
  const [tick, setTick] = useState(0);

  const desiredDeposit = (() => {
    try {
      return toBaseUnits(Number(depositAmt) || 0);
    } catch {
      return 0n;
    }
  })();
  const publicDeposit =
    overfundSplit && desiredDeposit > 0n
      ? overfundAmount(desiredDeposit)
      : desiredDeposit;

  const notes = address ? loadNotes(address) : [];
  const balance = notes.reduce((a, n) => a + (n.spent ? 0n : BigInt(n.value)), 0n);
  const bump = () => setTick((t) => t + 1);

  // My shareable receive address (pk ‖ x25519 enc pubkey), derived from sk.
  useEffect(() => {
    if (!address) return;
    const sk = getSpendKey(address);
    pk(sk).then((pkv) => setMyAddr(myShieldedAddress(sk, pkv)));
  }, [address]);

  // Copy the receive address. navigator.clipboard is gated in some browsers
  // (Brave shields, non-focused contexts) — fall back to a hidden textarea so
  // the button always works, and flash "Copied!" so the click is visible.
  const [copied, setCopied] = useState(false);
  const copyAddr = useCallback(async () => {
    const ok = await (async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(myAddr);
          return true;
        }
      } catch {
        /* fall through to legacy path */
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = myAddr;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const done = document.execCommand("copy");
        document.body.removeChild(ta);
        return done;
      } catch {
        return false;
      }
    })();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [myAddr]);

  // Reconcile the local note store against chain: any note whose nullifier is
  // already spent on-chain (e.g. a prior spend whose local mark was lost) gets
  // flagged spent, so the balance / "Your notes" list is accurate and pickNote
  // never selects a spent note (which aborts with ENullifierUsed). Runs on load
  // and after each op (tick).
  useEffect(() => {
    if (!address || packageId === "0x0") return;
    let cancelled = false;
    (async () => {
      try {
        const used = await fetchUsedNullifiers(client, packageId);
        if (cancelled || used.size === 0) return;
        const sk = getSpendKey(address);
        let changed = false;
        for (const n of loadNotes(address)) {
          if (n.spent) continue;
          const nf = await nullifier(sk, BigInt(n.rho));
          if (used.has(nf.toString())) {
            markSpent(address, n.commitment);
            changed = true;
          }
        }
        if (changed && !cancelled) bump();
      } catch {
        /* best-effort; a spend still dry-runs before submit */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, packageId, client, tick]);

  // Common prep: my spending key, its pk, and the current on-chain leaf list.
  const prep = useCallback(async () => {
    const sk = getSpendKey(address);
    const pkv = await pk(sk);
    const commitments = await fetchCommitments(client, packageId);
    return { sk, pkv, commitments };
  }, [address, client, packageId]);

  const onDeposit = useCallback(async () => {
    if (!address) return;
    setStatus(null);
    try {
      const desired = toBaseUnits(Number(depositAmt));
      if (desired <= 0n) return;
      const sk = getSpendKey(address);
      const doSplit = overfundSplit;
      const doRelay = useRelay && relayOn && relayer?.address;

      let depositBase = desired;
      let cm: bigint;
      let rho: bigint;
      let pkv: bigint;
      let depositProof: Uint8Array;
      let changeBase = 0n;

      if (doSplit) {
        setStatus("Proving overfunded deposit note…");
        const of = await proveOverfundDeposit({ sk, desiredBase: desired });
        depositBase = of.depositBase;
        changeBase = of.changeBase;
        cm = of.cmDeposit;
        rho = of.rhoDeposit;
        pkv = of.pkv;
        depositProof = of.depositProof;
      } else {
        pkv = await pk(sk);
        rho = randomBlinding();
        setStatus("Proving the deposit note…");
        const proofBytes = await proveDeposit(desired, pkv, rho);
        depositProof = proofBytes.proof;
        cm = BigInt(proofBytes.publicSignals[0]);
      }

      const submitDeposit = async () => {
        // Deposit is user-signed (Enoki-sponsored gas); the relayer is never
        // asked to fund principal — that path was drainable. Spends/withdraws
        // still relay for origin-hiding (proof-only, no funds leave the relayer).
        setStatus("Awaiting signature…");
        const tx = buildDeposit({
          packageId,
          coinType: usdcType,
          poolId,
          sender: address,
          capBase: depositBase,
          cm,
          proof: depositProof,
        });
        let digest = "";
        let execErr: Error | null = null;
        await execute(tx, {
          onSuccess: (r) => {
            digest = r.digest;
          },
          onError: (e) => {
            execErr = e;
          },
        });
        if (execErr) throw execErr;
        return digest;
      };

      await submitDeposit();

      if (!doSplit) {
        addNote(address, {
          commitment: s(cm),
          value: s(desired),
          rho: s(rho),
          spent: false,
          createdAt: Date.now(),
        });
        bump();
        setStatus(
          doRelay
            ? `Relayed deposit ${usd(desired)} — chain sees relayer, not you.`
            : `Deposited ${usd(desired)} into the shield — now a private note.`
        );
        return;
      }

      // Keep overfund opening locally in case the split tx fails mid-flow.
      addNote(address, {
        commitment: s(cm),
        value: s(depositBase),
        rho: s(rho),
        spent: false,
        createdAt: Date.now(),
      });

      setStatus("Proving private split (work + change)…");
      const split = await proveSplitAfterDeposit({
        client,
        packageId,
        sk,
        pkv,
        cmDeposit: cm,
        rhoDeposit: rho,
        depositBase,
        desiredBase: desired,
      });

      const finishSplitLocal = () => {
        markSpent(address, s(cm));
        addNote(address, {
          commitment: s(split.cmWork),
          value: s(desired),
          rho: s(split.rhoWork),
          spent: false,
          createdAt: Date.now(),
        });
        if (changeBase > 0n) {
          addNote(address, {
            commitment: s(split.cmChange),
            value: s(changeBase),
            rho: s(split.rhoChange),
            spent: false,
            createdAt: Date.now(),
          });
        }
        bump();
      };

      if (doRelay) {
        setStatus("Relaying private split…");
        await relaySubmit({
          network: (network as NetworkName) ?? "testnet",
          kind: "spend",
          packageId,
          coinType: usdcType,
          poolId,
          proof: split.proof,
          root: split.root,
          nf: split.nf,
          cm1: split.cmWork,
          cm2: split.cmChange,
        });
        finishSplitLocal();
        setStatus(
          `Shielded ${usd(desired)} privately — public edge was ${usd(depositBase)}; change ${usd(changeBase)} kept. Origin hidden.`
        );
        return;
      }

      setStatus("Awaiting signature for private split…");
      const spendTx = buildSpend({
        packageId,
        coinType: usdcType,
        poolId,
        root: split.root,
        nf: split.nf,
        cm1: split.cmWork,
        cm2: split.cmChange,
        proof: split.proof,
      });
      await execute(spendTx, {
        onSuccess: () => {
          finishSplitLocal();
          setStatus(
            `Shielded ${usd(desired)} privately — public edge was ${usd(depositBase)}; change ${usd(changeBase)} kept.`
          );
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [
    address,
    depositAmt,
    packageId,
    usdcType,
    poolId,
    execute,
    useRelay,
    relayOn,
    relayer,
    client,
    network,
    overfundSplit,
  ]);

  const onTransfer = useCallback(async () => {
    if (!address) return;
    setStatus(null);
    try {
      const v1 = toBaseUnits(Number(transferAmt));
      const note = pickNote(notes, v1);
      if (!note) {
        setStatus("No single unspent note large enough — deposit more first.");
        return;
      }
      const valueIn = BigInt(note.value);
      const v2 = valueIn - v1; // change back to me
      const { sk, pkv, commitments } = await prep();
      const leafIndex = commitments.indexOf(BigInt(note.commitment));
      if (leafIndex < 0) {
        setStatus("Note not found on-chain yet — wait for indexing.");
        return;
      }
      const { pathElements, pathIndices } = await merklePath(commitments, leafIndex);
      // Output 1 → recipient (their address, or me if blank); output 2 → my change.
      const toSelf = !recipientAddr.trim();
      const recip = toSelf ? null : parseShieldedAddress(recipientAddr);
      const pk1 = recip ? recip.pk : pkv;
      const rho1 = randomBlinding();
      const rho2 = randomBlinding();
      setStatus("Proving the private spend…");
      const pf = await proveShielded({
        valueIn,
        sk,
        rhoIn: BigInt(note.rho),
        pathElements,
        pathIndices,
        v1,
        pk1,
        rho1,
        v2,
        pk2: pkv,
        rho2,
      });
      const [root, nf, cm1, cm2] = signalsBig(pf);
      // For a real recipient, hand them the opening on-chain, encrypted to them.
      const cipher1 = recip ? await encryptNote(recip.encPub, v1, rho1) : undefined;
      const finishLocal = () => {
        markSpent(address, note.commitment);
        if (toSelf) {
          addNote(address, {
            commitment: s(cm1),
            value: s(v1),
            rho: s(rho1),
            spent: false,
            createdAt: Date.now(),
          });
        }
        if (v2 > 0n) {
          addNote(address, {
            commitment: s(cm2),
            value: s(v2),
            rho: s(rho2),
            spent: false,
            createdAt: Date.now(),
          });
        }
        bump();
      };

      if (useRelay && relayOn) {
        setStatus("Relaying private spend (hides your address)…");
        await relaySubmit({
          network: (network as NetworkName) ?? "testnet",
          kind: "spend",
          packageId,
          coinType: usdcType,
          poolId,
          proof: pf.proof,
          root,
          nf,
          cm1,
          cm2,
          cipher1,
        });
        finishLocal();
        setStatus(
          toSelf
            ? `Relayed split — origin hidden; link to the original is broken on-chain.`
            : `Relayed ${usd(v1)} privately; ${usd(v2)} change kept.`
        );
        return;
      }

      setStatus("Awaiting signature…");
      const tx = buildSpend({
        packageId,
        coinType: usdcType,
        poolId,
        root,
        nf,
        cm1,
        cm2,
        proof: pf.proof,
        cipher1,
      });
      await execute(tx, {
        onSuccess: () => {
          finishLocal();
          setStatus(
            toSelf
              ? `Split note privately — link to the original is broken on-chain.`
              : `Sent ${usd(v1)} to a hidden recipient; ${usd(v2)} change kept. They can now "Scan for incoming".`
          );
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [address, transferAmt, recipientAddr, notes, prep, packageId, usdcType, poolId, execute, useRelay, relayOn, network]);

  const onScan = useCallback(async () => {
    if (!address) return;
    setStatus("Scanning for notes sent to you…");
    try {
      const sk = getSpendKey(address);
      const myPk = await pk(sk);
      const found = await scanIncoming(client, packageId, sk, myPk);
      const known = new Set(loadNotes(address).map((n) => n.commitment));
      let added = 0;
      for (const f of found) {
        if (known.has(f.commitment)) continue;
        addNote(address, { ...f, spent: false, createdAt: Date.now() });
        added++;
      }
      bump();
      setStatus(
        added > 0
          ? `Received ${added} note(s) — now in your shielded balance.`
          : "No new incoming notes."
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [address, client, packageId]);

  const onWithdraw = useCallback(async () => {
    if (!address) return;
    setStatus(null);
    try {
      const amount = toBaseUnits(Number(withdrawAmt));
      const note = pickNote(notes, amount);
      if (!note) {
        setStatus("No single unspent note large enough — deposit more first.");
        return;
      }
      const valueIn = BigInt(note.value);
      const changeValue = valueIn - amount;
      const { sk, pkv, commitments } = await prep();
      const leafIndex = commitments.indexOf(BigInt(note.commitment));
      if (leafIndex < 0) {
        setStatus("Note not found on-chain yet — wait for indexing.");
        return;
      }
      const { pathElements, pathIndices } = await merklePath(commitments, leafIndex);
      const rhoChange = randomBlinding();
      const recipient = (payTo.trim() || address).toLowerCase();
      setStatus("Proving the withdrawal…");
      const pf = await proveWithdraw({
        valueIn,
        sk,
        rhoIn: BigInt(note.rho),
        pathElements,
        pathIndices,
        changeValue,
        pkChange: pkv,
        rhoChange,
      });
      const [root, nf, amt, cmChange] = signalsBig(pf);
      const finishWd = () => {
        markSpent(address, note.commitment);
        if (changeValue > 0n) {
          addNote(address, {
            commitment: s(cmChange),
            value: s(changeValue),
            rho: s(rhoChange),
            spent: false,
            createdAt: Date.now(),
          });
        }
        bump();
      };

      if (useRelay && relayOn) {
        setStatus("Relaying withdraw (hides your address)…");
        await relaySubmit({
          network: (network as NetworkName) ?? "testnet",
          kind: "withdraw",
          packageId,
          coinType: usdcType,
          poolId,
          proof: pf.proof,
          root,
          nf,
          amount: amt,
          cmChange,
          recipient,
        });
        finishWd();
        setStatus(
          `Relayed withdraw ${usd(amount)} to ${short(recipient)} — origin hidden.`
        );
        return;
      }

      setStatus("Awaiting signature…");
      const tx = buildWithdraw({
        packageId,
        coinType: usdcType,
        poolId,
        root,
        nf,
        amount: amt,
        cmChange,
        proof: pf.proof,
        recipient,
      });
      await execute(tx, {
        onSuccess: () => {
          finishWd();
          setStatus(`Withdrew ${usd(amount)} to ${short(recipient)} — source note hidden.`);
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [address, withdrawAmt, payTo, notes, prep, packageId, usdcType, poolId, execute, useRelay, relayOn, network]);

  if (!address) return null;
  const field =
    "mt-1 w-full rounded-lg border border-black/10 px-2 py-1.5 text-[12px]";
  const btn =
    "mt-3 rounded-full bg-[#6c5ce7] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50";

  return (
    <div className="space-y-4" data-tick={tick}>
      <div className="rounded-2xl border border-[#6c5ce7]/25 bg-[#6c5ce7]/[0.04] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] text-[#666]">Your shielded balance</p>
            <p className="text-[22px] font-bold text-[#111]">{usd(balance)}</p>
            <p className="mt-0.5 text-[10px] text-[#aaa]">
              {notes.filter((n) => !n.spent).length} private note(s) · openings stored
              locally in this browser
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={onScan}
            className="rounded-full border border-[#6c5ce7]/40 px-3 py-1.5 text-[10px] font-semibold text-[#6c5ce7] disabled:opacity-50"
          >
            Scan for incoming
          </button>
        </div>
        {myAddr && (
          <div className="mt-3 border-t border-[#6c5ce7]/15 pt-2.5">
            <p className="text-[10px] text-[#888]">
              Your receive address — share it to get paid privately
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-white px-2 py-1 font-mono text-[10px] text-[#333]">
                {myAddr}
              </code>
              <button
                type="button"
                onClick={copyAddr}
                className="rounded-lg border border-black/10 px-2 py-1 text-[10px] font-semibold text-[#333]"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {relayOn && (
        <label className="flex items-center gap-2 rounded-2xl border border-[#6c5ce7]/20 bg-[#6c5ce7]/[0.03] px-4 py-3 text-[11px] text-[#333]">
          <input
            type="checkbox"
            checked={useRelay}
            onChange={(e) => setUseRelay(e.target.checked)}
            className="accent-[#6c5ce7]"
          />
          <span>
            <strong className="font-semibold">Privacy relayer</strong> — hide your
            address as tx sender (deposit is two-step; amounts still public at the edge)
          </span>
        </label>
      )}

      {/* Deposit */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <p className="text-[13px] font-semibold text-[#111]">Shield funds (deposit)</p>
        <p className="mt-1 text-[11px] text-[#666]">
          Public USDC → private notes. With overfund on, the chain sees a round
          amount; a private spend immediately splits into your desired note + change.
        </p>
        <label className="mt-3 block text-[10px] text-[#888]">
          Desired amount (USDC)
          <input
            className={field}
            inputMode="decimal"
            value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)}
          />
        </label>
        {desiredDeposit > 0n && (
          <p className="mt-1.5 text-[10px] text-[#888]">
            {overfundSplit
              ? `Public edge: ${usd(publicDeposit)} · private note: ${usd(desiredDeposit)} · change: ${usd(publicDeposit - desiredDeposit)}`
              : `Public edge = ${usd(desiredDeposit)} (matches your note)`}
          </p>
        )}
        <label className="mt-3 flex items-center gap-2 text-[11px] text-[#333]">
          <input
            type="checkbox"
            checked={overfundSplit}
            onChange={(e) => setOverfundSplit(e.target.checked)}
            className="accent-[#6c5ce7]"
          />
          <span>
            <strong className="font-semibold">Overfund + private split</strong> — edge
            amount ≠ economic amount
          </span>
        </label>
        <button type="button" disabled={isPending} onClick={onDeposit} className={btn}>
          {isPending ? "Working…" : overfundSplit ? "Shield (overfund + split)" : "Shield"}
        </button>
      </div>

      {/* Private transfer */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <p className="text-[13px] font-semibold text-[#111]">Private transfer</p>
        <p className="mt-1 text-[11px] text-[#666]">
          Spend a note into two — breaks the on-chain link. Leave recipient blank to
          re-randomize to yourself, or paste a recipient&apos;s <em>receive address</em>{" "}
          to pay them (they get the opening encrypted on-chain — no side channel).
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-[10px] text-[#888]">
            Amount (USDC)
            <input
              className={field}
              inputMode="decimal"
              value={transferAmt}
              onChange={(e) => setTransferAmt(e.target.value)}
            />
          </label>
          <label className="col-span-2 text-[10px] text-[#888]">
            Recipient address (blank = self)
            <input
              className={`${field} font-mono text-[11px]`}
              placeholder="sl1…"
              value={recipientAddr}
              onChange={(e) => setRecipientAddr(e.target.value)}
            />
          </label>
        </div>
        <button type="button" disabled={isPending} onClick={onTransfer} className={btn}>
          {isPending ? "Working…" : "Send privately"}
        </button>
      </div>

      {/* Withdraw */}
      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <p className="text-[13px] font-semibold text-[#111]">Unshield (withdraw)</p>
        <p className="mt-1 text-[11px] text-[#666]">
          Private note → public USDC at any address. The pay-out amount is revealed;
          which deposit funded it stays hidden.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-[#888]">
            Amount (USDC)
            <input
              className={field}
              inputMode="decimal"
              value={withdrawAmt}
              onChange={(e) => setWithdrawAmt(e.target.value)}
            />
          </label>
          <label className="text-[10px] text-[#888]">
            Pay to (blank = you)
            <input
              className={`${field} font-mono text-[11px]`}
              placeholder="0x…"
              value={payTo}
              onChange={(e) => setPayTo(e.target.value)}
            />
          </label>
        </div>
        <button type="button" disabled={isPending} onClick={onWithdraw} className={btn}>
          {isPending ? "Working…" : "Unshield"}
        </button>
      </div>

      {status && <p className="text-[11px] leading-snug text-[#6c5ce7]">{status}</p>}

      {notes.filter((n) => !n.spent).length > 0 && (
        <div className="rounded-2xl border border-black/10 bg-white p-3.5">
          <p className="text-[11px] font-semibold text-[#111]">Your notes</p>
          <div className="mt-2 space-y-1.5">
            {notes
              .filter((n) => !n.spent)
              .map((n) => (
                <div
                  key={n.commitment}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className="font-mono text-[#888]">{short(n.commitment)}</span>
                  <span className="font-semibold text-[#111]">{usd(n.value)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
