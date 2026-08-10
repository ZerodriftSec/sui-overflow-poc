"use client";

import { useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
} from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import {
  durationToMs,
  dripIntervalMs,
  formatInterval,
  formatUsd,
  ratePerSecond,
  toBaseUnits,
  type DurationUnit,
} from "@/lib/stream-math";
import {
  buildCreateStreamV2,
  splitMilestoneAmounts,
  DEFAULT_DISPUTE_WINDOW_MS,
} from "@/lib/streamline-tx";
import {
  buildCreateConfidentialStreamV2,
  commit,
  proveWrap,
  randomBlinding,
} from "@/lib/confidential";
import { encryptSecrets } from "@/lib/seal";
import {
  addSecret,
  findCreatedConfidentialStream,
} from "@/lib/confidential-store";
import {
  prepareOpenEngagement,
  findCreatedEngagement,
} from "@/lib/private-stream";
import { addEngagement } from "@/lib/private-engagement-store";
import { getSpendKey, addNote } from "@/lib/shielded-store";
import { SHIELDED_POOL, type NetworkName } from "@/lib/constants";
import {
  usePrivacyRelayer,
  relaySubmit,
} from "@/lib/privacy-relayer";
import { proveSplitAfterDeposit } from "@/lib/overfund-split";
import { buildSpend } from "@/lib/shielded";
import { DITHER_HATCH } from "./dashboard-ui";
import { usePhoneEmbedded } from "./phone/PhoneEmbeddedContext";
import {
  PhoneDurationField,
  PhoneField,
  PhoneToggleRow,
  phoneInputClass,
  phonePctInputClass,
} from "./phone/PhoneFormParts";
import { queueStreamLabel, rememberStreamLabel } from "@/lib/stream-labels";
import {
  looksLikeRecipient,
  resolveRecipientOrThrow,
} from "@/lib/use-resolve-recipient";
import { isHexAddress, suinsBrand } from "@/lib/handle";

type SplitRow = { label: string; address: string; pct: number; yield: boolean };

const DEFAULT_SPLITS: SplitRow[] = [
  { label: "Spending wallet", address: "", pct: 70, yield: false },
  { label: "Scallop (yield)", address: "", pct: 30, yield: true },
];

export type PrivacyMode = "private" | "amounts" | "public";

export type StreamCreatorPrefill = {
  freelancer?: string;
  amount?: number;
  durationValue?: number;
  durationUnit?: DurationUnit;
  isPrivate?: boolean;
  privacyMode?: PrivacyMode;
  useMilestones?: boolean;
  milestones?: string[];
  useSplitConfig?: boolean;
  splits?: SplitRow[];
};

function looksLikeShielded(s: string): boolean {
  return /^sl1[A-Za-z0-9+/_-]+$/.test(s.trim());
}

export function StreamCreator({
  onCancel,
  prefill,
}: {
  onCancel?: () => void;
  prefill?: StreamCreatorPrefill;
} = {}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const embedded = usePhoneEmbedded();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const { execute, isPending } = useGaslessExecute();
  const poolId = SHIELDED_POOL[(network as NetworkName) ?? "testnet"];
  const { data: relayer } = usePrivacyRelayer();
  const relayOn = !!relayer?.enabled && !!relayer.address;

  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(
    prefill?.privacyMode ??
      (prefill?.isPrivate === false ? "public" : "private")
  );
  const isPrivate = privacyMode !== "public";
  const isFullPrivate = privacyMode === "private";
  const setIsPrivate = (v: boolean) =>
    setPrivacyMode(v ? "private" : "public");
  const [streamName, setStreamName] = useState("");
  const [freelancer, setFreelancer] = useState(prefill?.freelancer ?? "");
  const [amount, setAmount] = useState(prefill?.amount ?? 800);
  const [durationValue, setDurationValue] = useState(prefill?.durationValue ?? 14);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(
    prefill?.durationUnit ?? "days"
  );
  const [milestones, setMilestones] = useState<string[]>(
    prefill?.milestones ?? ["request start", "Milestone 2", "Milestone 3"]
  );
  const [splits, setSplits] = useState<SplitRow[]>(prefill?.splits ?? DEFAULT_SPLITS);
  const [status, setStatus] = useState<string | null>(null);
  const [proving, setProving] = useState(false);
  const [showPrivateArea, setShowPrivateArea] = useState(true);
  const [showMilestonesArea, setShowMilestonesArea] = useState(true);
  const [useMilestones, setUseMilestones] = useState(prefill?.useMilestones ?? false);
  const [useSplitConfig, setUseSplitConfig] = useState(prefill?.useSplitConfig ?? false);

  const durationMs = durationToMs(durationValue, durationUnit);
  const effectiveMilestones = useMilestones
    ? ["request start", ...milestones.slice(1)]
    : ["request start"];
  const rate = ratePerSecond(amount, durationMs);
  const interval = dripIntervalMs(amount, durationMs);
  const splitSum = splits.reduce((s, r) => s + (Number(r.pct) || 0), 0);

  const deployed = packageId && packageId !== "0x0";
  const errors = useMemo(() => {
    const e: string[] = [];
    if (amount <= 0) e.push("Amount must be greater than 0.");
    if (effectiveMilestones.length === 0) e.push("Add at least one milestone.");
    if (amount / Math.max(effectiveMilestones.length, 1) < 0.01)
      e.push("Each milestone must be ≥ 0.01 USDC.");
    if (isFullPrivate) {
      if (!looksLikeShielded(freelancer) && !looksLikeRecipient(freelancer))
        e.push(
          `Recipient: shielded sl1… address (preferred) or @${suinsBrand()} / 0x.`
        );
      if (durationValue <= 0) e.push("Duration must be greater than 0.");
      if (useMilestones)
        e.push("Milestones need Amounts-only or Public mode.");
    } else if (!looksLikeRecipient(freelancer)) {
      e.push(
        `Recipient must be a @${suinsBrand()} handle or a full Sui address (0x + 64 hex).`
      );
    }
    if (!isPrivate) {
      if (durationValue <= 0) e.push("Duration must be greater than 0.");
      if (splitSum !== 100)
        e.push(`Splits must total 100% (currently ${splitSum}%).`);
    }
    return e;
  }, [
    amount,
    durationValue,
    effectiveMilestones.length,
    splitSum,
    isPrivate,
    isFullPrivate,
    freelancer,
    useMilestones,
  ]);

  const canCreate = errors.length === 0 && !!account;
  const recipientInvalid = isFullPrivate
    ? !looksLikeShielded(freelancer) && !looksLikeRecipient(freelancer)
    : isPrivate && !looksLikeRecipient(freelancer);
  const updateMilestone = (i: number, v: string) =>
    setMilestones((m) => m.map((x, j) => (j === i ? v : x)));
  const updateSplit = (i: number, patch: Partial<SplitRow>) =>
    setSplits((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onCreate = async () => {
    if (!canCreate) return;
    if (!deployed) {
      setStatus(
        "Move package not deployed on this network yet — PTB is previewed above."
      );
      return;
    }
    if (isFullPrivate) {
      void onCreateFullPrivate();
      return;
    }
    let recipientAddr = freelancer.trim();
    try {
      if (!isHexAddress(recipientAddr)) {
        setStatus("Resolving recipient…");
        const resolved = await resolveRecipientOrThrow(client, freelancer);
        recipientAddr = resolved.address;
        setFreelancer(resolved.address);
        setStatus(`Resolved ${resolved.displayName}`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      return;
    }
    if (privacyMode === "amounts") {
      void onCreatePrivate(recipientAddr);
      return;
    }
    const totalBase = toBaseUnits(amount);
    // Auto-yield: route the yield-flagged split %% into the vault on every drip.
    const yieldBps = Math.round(
      splits
        .filter((s) => s.yield)
        .reduce((a, s) => a + (Number(s.pct) || 0), 0) * 100
    );
    const tx = buildCreateStreamV2({
      packageId,
      usdcType,
      sender: account!.address,
      freelancer: recipientAddr,
      milestoneNames: effectiveMilestones,
      milestoneAmountsBase: splitMilestoneAmounts(totalBase, effectiveMilestones.length),
      totalBase,
      durationMs,
      yieldBps,
    });
    setStatus("Awaiting wallet signature…");
    execute(tx, {
      onSuccess: (r) => {
        queueStreamLabel(streamName, recipientAddr, Number(totalBase));
        setStatus(`Stream created — locked ${formatUsd(amount)}. Digest ${r.digest}`);
      },
      onError: (e) => setStatus(e.message),
    });
  };

  /** Default private path: shielded pool + lazy vesting (amount + who + when). */
  const onCreateFullPrivate = async () => {
    if (!account) return;
    if (!poolId || poolId === "0x0") {
      setStatus("Shielded pool not configured on this network.");
      return;
    }
    setProving(true);
    try {
      const totalBase = toBaseUnits(amount);
      const durationSec = BigInt(Math.max(1, Math.floor(durationMs / 1000)));
      const sk = getSpendKey(account.address);
      const recipient = freelancer.trim();
      setStatus("Proving overfunded deposit + pinning vesting schedule…");
      const prepared = await prepareOpenEngagement({
        packageId,
        coinType: usdcType,
        poolId,
        sender: account.address,
        sk,
        client,
        capBase: totalBase,
        durationSec,
        recipientShielded: looksLikeShielded(recipient) ? recipient : undefined,
        label: streamName || undefined,
      });

      const saveAfterSplit = async (
        openDigest: string,
        funding: {
          cm: bigint;
          rho: bigint;
          value: bigint;
        },
        change?: { cm: bigint; rho: bigint; value: bigint }
      ) => {
        setStatus("Confirming on-chain…");
        const engagementId = await findCreatedEngagement(client, openDigest);
        if (engagementId) {
          rememberStreamLabel(engagementId, streamName || "Private engagement");
          addEngagement(account.address, {
            engagementId,
            coinType: usdcType,
            poolId,
            fundingCm: funding.cm.toString(),
            fundingRho: funding.rho.toString(),
            fundingValue: funding.value.toString(),
            rate: prepared.rate.toString(),
            start: prepared.start.toString(),
            cap: totalBase.toString(),
            rParams: prepared.rParams.toString(),
            paramsCommitment: prepared.paramsCommitment.toString(),
            workerShielded: looksLikeShielded(recipient) ? recipient : undefined,
            label: streamName || undefined,
            createdAt: Date.now(),
          });
          addNote(account.address, {
            commitment: funding.cm.toString(),
            value: funding.value.toString(),
            rho: funding.rho.toString(),
            spent: false,
            createdAt: Date.now(),
          });
          if (change && change.value > 0n) {
            addNote(account.address, {
              commitment: change.cm.toString(),
              value: change.value.toString(),
              rho: change.rho.toString(),
              spent: false,
              createdAt: Date.now(),
            });
          }
        }
        const edge = prepared.depositBase;
        setStatus(
          prepared.changeBase > 0n
            ? `Private engagement opened — public edge ${formatUsd(Number(edge) / 1e6)}; work note ${formatUsd(amount)}. Digest ${openDigest}`
            : `Private engagement opened — amount, parties, and drip cadence hidden. Digest ${openDigest}`
        );
      };

      const runSplit = async (openDigest: string) => {
        if (prepared.changeBase <= 0n) {
          await saveAfterSplit(openDigest, {
            cm: prepared.cm,
            rho: prepared.rho,
            value: totalBase,
          });
          return;
        }
        setStatus("Proving private split (work note + change)…");
        const split = await proveSplitAfterDeposit({
          client,
          packageId,
          sk,
          pkv: prepared.pkv,
          cmDeposit: prepared.cm,
          rhoDeposit: prepared.rho,
          depositBase: prepared.depositBase,
          desiredBase: totalBase,
        });
        if (relayOn) {
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
        } else {
          setStatus("Awaiting signature for private split…");
          let splitErr: Error | null = null;
          await execute(
            buildSpend({
              packageId,
              coinType: usdcType,
              poolId,
              root: split.root,
              nf: split.nf,
              cm1: split.cmWork,
              cm2: split.cmChange,
              proof: split.proof,
            }),
            {
              onSuccess: () => {},
              onError: (e) => {
                splitErr = e;
              },
            }
          );
          if (splitErr) throw splitErr;
        }
        await saveAfterSplit(
          openDigest,
          {
            cm: split.cmWork,
            rho: split.rhoWork,
            value: totalBase,
          },
          {
            cm: split.cmChange,
            rho: split.rhoChange,
            value: prepared.changeBase,
          }
        );
      };

      // Funding open is user-signed below (Enoki-sponsored gas); the relayer is
      // never asked to fund principal — that path was drainable. The private
      // split spend still relays (proof-only, moves no funds from the relayer).
      setStatus("Awaiting wallet signature…");
      let openDigest = "";
      let openErr: Error | null = null;
      await execute(prepared.tx, {
        onSuccess: async ({ digest }) => {
          openDigest = digest;
        },
        onError: (e) => {
          openErr = e;
        },
      });
      if (openErr) throw openErr;
      await runSplit(openDigest);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  };

  /**
   * Private path: commit to the amount, prove the wrap in-browser, Seal-encrypt
   * the blindings to both wallets, and lock the funds — one signature.
   */
  const onCreatePrivate = async (resolvedRecipient?: string) => {
    if (!account) return;
    const recipient = (resolvedRecipient ?? freelancer).trim();
    setProving(true);
    try {
      setStatus("Generating commitments + proof in your browser…");
      const totalBase = toBaseUnits(amount);
      const rRemaining = randomBlinding();
      const rEarned = randomBlinding();
      const remainingC = await commit(totalBase, rRemaining);
      const earnedC = await commit(0n, rEarned);
      const wrap = await proveWrap(totalBase, rRemaining);

      setStatus("Encrypting stream secrets to both wallets (Seal)…");
      const envelope = await encryptSecrets({
        suiClient: client,
        sealNamespace: originalPackageId,
        sender: account.address,
        freelancer: recipient,
        payload: {
          v: 1,
          coinType: usdcType,
          totalBase: totalBase.toString(),
          milestones: effectiveMilestones.length,
          freelancer: recipient,
          remainingBase: totalBase.toString(),
          rRemaining: rRemaining.toString(),
          earnedBase: "0",
          rEarned: rEarned.toString(),
        },
      });

      const tx = buildCreateConfidentialStreamV2({
        packageId,
        coinType: usdcType,
        sender: account.address,
        totalBase,
        freelancer: recipient,
        nMilestones: effectiveMilestones.length,
        remainingCommitment: remainingC,
        wrapProof: wrap.proof,
        earnedCommitment: earnedC,
        disputeWindowMs: DEFAULT_DISPUTE_WINDOW_MS,
        encryptedSecrets: envelope,
      });

      setStatus("Awaiting wallet signature…");
      await execute(tx, {
        onSuccess: async ({ digest }) => {
          setStatus("Confirming on-chain…");
          const streamId = await findCreatedConfidentialStream(client, digest);
          if (streamId) {
            rememberStreamLabel(streamId, streamName);
            // Local cache so this wallet can act without a Seal round-trip.
            addSecret(account.address, {
              streamId,
              coinType: usdcType,
              totalBase: totalBase.toString(),
              milestones: effectiveMilestones.length,
              freelancer: recipient,
              remainingBase: totalBase.toString(),
              rRemaining: rRemaining.toString(),
              earnedBase: "0",
              rEarned: rEarned.toString(),
              createdAt: Date.now(),
            });
          }
          setStatus(
            `Private stream created — amount hidden on-chain. The recipient can decrypt via Seal. Digest ${digest}`
          );
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  };

  if (embedded) {
    return (
      <div className="flex flex-col gap-4">
        <PhoneField label="Recipient">
          <input
            value={freelancer}
            onChange={(e) => setFreelancer(e.target.value)}
            placeholder={isFullPrivate ? "sl1… shielded (or @handle)" : `@${suinsBrand()} or 0x…`}
            className={`${phoneInputClass} text-[11px] ${
              recipientInvalid ? "border-[#c0533a]" : ""
            }`}
            spellCheck={false}
            autoComplete="off"
          />
        </PhoneField>

        <PhoneField label="Stream name">
          <input
            value={streamName}
            onChange={(e) => setStreamName(e.target.value)}
            placeholder="Design sprint"
            className={phoneInputClass}
          />
        </PhoneField>

        <PhoneField label="Amount (USDC)">
          <input
            type="number"
            value={amount === 0 ? "" : amount}
            min={0}
            placeholder="800"
            onChange={(e) =>
              setAmount(e.target.value === "" ? 0 : Number(e.target.value))
            }
            className={phoneInputClass}
          />
        </PhoneField>

        {!isPrivate && (
          <PhoneDurationField
            value={durationValue === 0 ? "" : String(durationValue)}
            unit={durationUnit}
            onValueChange={(v) =>
              setDurationValue(v === "" ? 0 : Number(v))
            }
            onUnitChange={setDurationUnit}
          />
        )}

        <PhoneToggleRow
          title="Private stream"
          subtitle="Hide amount, who & when (pool)"
          checked={isPrivate}
          onChange={(v) => {
            setPrivacyMode(v ? "private" : "public");
            if (v) {
              setUseSplitConfig(false);
              setUseMilestones(false);
            }
          }}
        />

        <PhoneToggleRow
          title="Use milestones"
          subtitle="Define payment stages"
          checked={useMilestones}
          onChange={setUseMilestones}
        >
          <div className="flex flex-col gap-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111] text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                {i === 0 ? (
                  <span className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[#f5f5f5] px-3 py-2 text-[12px] text-[#444]">
                    Start
                  </span>
                ) : (
                  <input
                    value={m}
                    onChange={(e) => updateMilestone(i, e.target.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-[12px] outline-none focus:border-[#5b54e6]"
                  />
                )}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMilestones((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="px-2 text-[#c0533a]"
                    aria-label="Remove milestone"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setMilestones((m) => [...m, `Milestone ${m.length + 1}`])
              }
              className="self-start rounded-lg border border-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444]"
            >
              + add milestone
            </button>
          </div>
        </PhoneToggleRow>

        <PhoneToggleRow
          title="Split config"
          subtitle={
            isPrivate ? "Not available for private" : `Route each drip (${splitSum}%)`
          }
          checked={useSplitConfig}
          disabled={isPrivate}
          onChange={setUseSplitConfig}
        >
          <div className="flex flex-col gap-2">
            {splits.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) => updateSplit(i, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-[11px] outline-none focus:border-[#5b54e6]"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={row.pct === 0 ? "" : row.pct}
                  placeholder="0"
                  onChange={(e) =>
                    updateSplit(i, {
                      pct: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  className={phonePctInputClass}
                />
                <span className="text-[10px] text-[#777]">%</span>
                <label className="flex items-center gap-1 text-[10px] text-[#666]">
                  <input
                    type="checkbox"
                    checked={row.yield}
                    onChange={(e) => updateSplit(i, { yield: e.target.checked })}
                  />
                  yield
                </label>
                <button
                  type="button"
                  onClick={() => setSplits((s) => s.filter((_, j) => j !== i))}
                  className="px-1 text-[#c0533a]"
                  aria-label="Remove split"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSplits((s) => [
                  ...s,
                  { label: "Destination", address: "", pct: 0, yield: false },
                ])
              }
              className="self-start rounded-lg border border-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444]"
            >
              + add split
            </button>
          </div>
        </PhoneToggleRow>

        {!deployed && (
          <p className="text-[11px] text-[#888]">
            Move package not set for this network — set NEXT_PUBLIC_PACKAGE_ID to
            enable on-chain creation.
          </p>
        )}
        {errors[0] && !canCreate && (
          <p className="text-[11px] text-[#c0533a]">{errors[0]}</p>
        )}
        {status && (
          <p className="break-words text-[11px] text-[#666]">{status}</p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || !deployed || isPending || proving}
            className="w-full rounded-2xl bg-[#111] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
          >
            {isPending || proving
              ? isPrivate
                ? "Proving…"
                : "Signing…"
              : isPrivate
                ? "Create private stream"
                : "Create stream"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-2xl border border-black/12 bg-white px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-8">
        <button
          type="button"
          onClick={() => setShowPrivateArea((v) => !v)}
          className="flex items-center justify-between border border-[#2b2a5e]/15 bg-white px-4 py-2.5 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#666]">
            Privacy options
          </span>
          <span className="text-[11px] text-[#777]">{showPrivateArea ? "Hide" : "Show"}</span>
        </button>
        {showPrivateArea && (
          <div className="border border-[#2b2a5e]/15 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold">
                  Full private {isFullPrivate && "🔒"}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#2b2a5e]/60">
                  {isFullPrivate
                    ? "Default: shielded pool + lazy vest — hides amount, who↔whom, and drip cadence. Opens with overfund + private split so the public edge ≠ the work amount."
                    : privacyMode === "amounts"
                      ? "Compat: ConfidentialStream hides amounts only (parties + milestones public)."
                      : "Public stream — amounts and parties on-chain. Toggle for full private."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isFullPrivate}
                onClick={() => {
                  setPrivacyMode(isFullPrivate ? "public" : "private");
                  if (!isFullPrivate) {
                    setUseSplitConfig(false);
                    setUseMilestones(false);
                  }
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  isFullPrivate ? "bg-[#5b54e6]" : "bg-[#2b2a5e]/25"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    isFullPrivate ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <button
              type="button"
              className="mt-2 text-[11px] text-[#5b54e6] underline-offset-2 hover:underline"
              onClick={() => setPrivacyMode("amounts")}
            >
              Need milestones / dispute? Switch to amounts-only compat
            </button>
          </div>
        )}
        <Field label="Recipient (handle or address)">
          <input
            value={freelancer}
            onChange={(e) => setFreelancer(e.target.value)}
            placeholder={
              isFullPrivate
                ? "sl1… shielded (preferred) or @handle"
                : `@${suinsBrand()} or 0x…`
            }
            spellCheck={false}
            autoComplete="off"
            className={`w-full border bg-white px-3 py-2.5 font-mono text-[13px] outline-none focus:border-[#5b54e6] ${
              recipientInvalid
                ? "border-[#c0533a] bg-[#c0533a]/[0.03]"
                : "border-[#2b2a5e]/20"
            }`}
          />
        </Field>

        <Field label="Stream name">
          <input
            value={streamName}
            onChange={(e) => setStreamName(e.target.value)}
            placeholder="Design sprint"
            className="w-full border border-[#2b2a5e]/20 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#5b54e6]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Total amount (USDC)">
            <input
              type="number"
              value={amount === 0 ? "" : amount}
              min={0}
              placeholder="800"
              onChange={(e) =>
                setAmount(e.target.value === "" ? 0 : Number(e.target.value))
              }
              className="w-full border border-[#2b2a5e]/20 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#5b54e6]"
            />
          </Field>
          {privacyMode !== "amounts" && (
            <Field label="Duration">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={durationValue === 0 ? "" : durationValue}
                  min={0}
                  placeholder="14"
                  onChange={(e) =>
                    setDurationValue(
                      e.target.value === "" ? 0 : Number(e.target.value)
                    )
                  }
                  className="w-full border border-[#2b2a5e]/20 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#5b54e6]"
                />
                <select
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                  className="border border-[#2b2a5e]/20 bg-white px-2 text-[13px] outline-none focus:border-[#5b54e6]"
                >
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
              </div>
            </Field>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowMilestonesArea((v) => !v)}
          className="flex items-center justify-between border border-[#2b2a5e]/15 bg-white px-4 py-2.5 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#666]">
            Milestones
          </span>
          <span className="text-[11px] text-[#777]">{showMilestonesArea ? "Hide" : "Show"}</span>
        </button>
        {showMilestonesArea && (
          <Field label={`Milestones (${milestones.length})`}>
            <div className="flex flex-col gap-2">
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <span className="flex w-8 items-center justify-center bg-[#2b2a5e] text-[12px] text-white">
                    {i + 1}
                  </span>
                  <input
                    value={m}
                    onChange={(e) => updateMilestone(i, e.target.value)}
                    className="w-full border border-[#2b2a5e]/20 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#5b54e6]"
                  />
                  <button
                    onClick={() =>
                      setMilestones((arr) => arr.filter((_, j) => j !== i))
                    }
                    className="px-3 text-[#c0533a] hover:opacity-60"
                    aria-label="Remove milestone"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => setMilestones((m) => [...m, `Milestone ${m.length + 1}`])}
                className="self-start border border-[#2b2a5e]/20 px-3 py-1.5 text-[12px] hover:border-[#5b54e6]"
              >
                + add milestone
              </button>
            </div>
          </Field>
        )}

        {!isPrivate && (
        <Field label={`Split config (${splitSum}%)`}>
          <div className="flex flex-col gap-2">
            {splits.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={r.label}
                  onChange={(e) => updateSplit(i, { label: e.target.value })}
                  className="w-40 border border-[#2b2a5e]/20 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#5b54e6]"
                />
                <input
                  type="number"
                  value={r.pct === 0 ? "" : r.pct}
                  placeholder="0"
                  onChange={(e) =>
                    updateSplit(i, {
                      pct: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-20 border border-[#2b2a5e]/20 bg-white px-3 py-2 text-[13px] outline-none focus:border-[#5b54e6]"
                />
                <span className="text-[12px] text-[#2b2a5e]/50">%</span>
                <label className="flex items-center gap-1 text-[11px] text-[#2b2a5e]/60">
                  <input
                    type="checkbox"
                    checked={r.yield}
                    onChange={(e) => updateSplit(i, { yield: e.target.checked })}
                  />
                  yield
                </label>
                <button
                  onClick={() => setSplits((s) => s.filter((_, j) => j !== i))}
                  className="ml-auto px-2 text-[#c0533a] hover:opacity-60"
                  aria-label="Remove split"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setSplits((s) => [
                  ...s,
                  { label: "Destination", address: "", pct: 0, yield: false },
                ])
              }
              className="self-start border border-[#2b2a5e]/20 px-3 py-1.5 text-[12px] hover:border-[#5b54e6]"
            >
              + add split
            </button>
          </div>
        </Field>
        )}
      </div>

      <aside className="flex flex-col gap-4 border border-[#2b2a5e]/15 bg-white p-6 lg:min-h-[480px]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#2b2a5e]/50">
          PTB preview
        </p>
        <Summary
          label={isPrivate ? "Locks (hidden on-chain)" : "Locks"}
          value={formatUsd(amount)}
        />
        {!isPrivate && (
          <>
            <Summary label="Rate" value={`${formatUsd(rate)} / sec`} />
            <Summary label="Settles every" value={formatInterval(interval)} />
          </>
        )}
        <Summary label="Milestones" value={String(milestones.length)} />
        <Summary
          label="Per milestone"
          value={formatUsd(amount / Math.max(milestones.length, 1))}
        />
        {!isPrivate && (
          <div className="border-t border-[#2b2a5e]/10 pt-3 text-[12px] leading-relaxed text-[#2b2a5e]/70">
            {splits.map((s, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {s.label} {s.yield && "↗"}
                </span>
                <span className="tabular">{s.pct}%</span>
              </div>
            ))}
          </div>
        )}
        {isPrivate ? (
          <p className="text-[11px] leading-relaxed text-[#2b2a5e]/60">
            Amounts stay off-chain. Groth16 proofs in your browser; secrets
            Seal-encrypted to you and the recipient.
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-[#1d9e75]">
            All gasless via Address Balances. {formatInterval(interval)}.
          </p>
        )}

        <div className="flex-1" />

        <StreamCreateAction
          isPrivate={isPrivate}
          amount={amount}
          milestones={milestones.length}
          ready={canCreate && !!deployed}
          busy={isPending || proving}
          blockReason={errors[0]}
          onClick={onCreate}
        />
        {!deployed && (
          <p className="text-[11px] text-[#2b2a5e]/50">
            Note: Move package not set for this network — set
            NEXT_PUBLIC_PACKAGE_ID to enable on-chain creation.
          </p>
        )}
        {status && (
          <p className="break-words text-[11px] text-[#2b2a5e]/70">{status}</p>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.16em] text-[#2b2a5e]/60">
        {label}
      </span>
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-[#2b2a5e]/55">{label}</span>
      <span className="text-[14px] font-semibold tabular">{value}</span>
    </div>
  );
}

const DOT_FIELD =
  "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)";

function StreamCreateAction({
  isPrivate,
  amount,
  milestones,
  ready,
  busy,
  blockReason,
  onClick,
}: {
  isPrivate: boolean;
  amount: number;
  milestones: number;
  ready: boolean;
  busy: boolean;
  blockReason?: string;
  onClick: () => void;
}) {
  const locked = formatUsd(amount);
  const each = formatUsd(amount / Math.max(milestones, 1));
  const accent = isPrivate ? "#5b54e6" : "#2b2a5e";

  if (busy) {
    return (
      <div
        className="relative overflow-hidden p-5 text-white"
        style={{ background: accent }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: DOT_FIELD, backgroundSize: "7px 7px" }}
        />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/75">
            {isPrivate ? "Private stream" : "Creating stream"}
          </p>
          <p className="mt-2 text-[32px] font-black tabular leading-none tracking-[-0.02em]">
            {locked}
          </p>
          <p className="mt-4 animate-pulse text-[13px] font-medium text-white/90">
            {isPrivate
              ? "Generating proof & encrypting secrets…"
              : "Awaiting wallet signature…"}
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="border-2 border-dashed border-[#2b2a5e]/25 px-5 py-5"
        style={{ backgroundImage: DITHER_HATCH }}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#2b2a5e]/45">
          {isPrivate ? "Private stream preview" : "Stream preview"}
        </p>
        <p className="mt-2 text-[36px] font-black tabular leading-none tracking-[-0.02em] text-[#2b2a5e]">
          {locked}
        </p>
        <p className="mt-2 text-[12px] text-[#2b2a5e]/55">
          {milestones} milestones
          {isPrivate ? " · hidden on-chain" : ` · ${each} each · gasless`}
        </p>
        <div className="mt-5 border-t border-[#2b2a5e]/12 pt-4">
          <p className="text-[13px] font-semibold text-[#2b2a5e]">
            {isPrivate ? "Create private stream" : "Create stream"}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#c0533a]">
            {blockReason ?? "Complete the form above"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
    >
      <div
        className="relative overflow-hidden p-5 text-white shadow-[0_10px_30px_rgba(43,42,94,0.2)] transition-shadow group-hover:shadow-[0_14px_36px_rgba(43,42,94,0.28)]"
        style={{ background: accent }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: DOT_FIELD, backgroundSize: "7px 7px" }}
        />
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/75">
              {isPrivate ? "Private · Seal encrypted" : "Gasless · no SUI needed"}
            </p>
            <p className="mt-1 text-[40px] font-black tabular leading-none tracking-[-0.03em]">
              {locked}
            </p>
            <p className="mt-2 text-[12px] text-white/80">
              {milestones} milestones
              {!isPrivate && ` · ${each} each`}
            </p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-white/15 text-[20px] ring-1 ring-white/25 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
        <p className="relative mt-4 border-t border-white/20 pt-3.5 text-[14px] font-bold tracking-[-0.01em]">
          {isPrivate ? "Create private stream" : "Create stream"}
        </p>
      </div>
    </button>
  );
}
