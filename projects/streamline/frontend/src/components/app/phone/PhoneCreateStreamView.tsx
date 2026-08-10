"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient, useSuiClientContext } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { queueStreamLabel, rememberStreamLabel } from "@/lib/stream-labels";
import {
  durationToMs,
  formatUsd,
  toBaseUnits,
  type DurationUnit,
} from "@/lib/stream-math";
import {
  buildCreateStreamV2,
  splitMilestoneAmounts,
  DEFAULT_DISPUTE_WINDOW_MS,
  DEFAULT_STREAM_YIELD_BPS,
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
import { proveSplitAfterDeposit } from "@/lib/overfund-split";
import { buildSpend } from "@/lib/shielded";
import {
  PhoneDurationField,
  PhoneField,
  PhoneToggleRow,
  phoneInputClass,
} from "./PhoneFormParts";
import { PhoneContactPicker } from "./PhoneContactPicker";
import { btnPrimary, btnSecondary, PhoneFlowShell } from "./PhoneFlowShell";
import {
  looksLikeRecipient,
  resolveRecipientOrThrow,
} from "@/lib/use-resolve-recipient";
import { suinsBrand } from "@/lib/handle";
type PhoneCreateStreamViewProps = {
  onClose: () => void;
};

type CreateStep = 1 | 2 | 3;

const STEP_TITLES: Record<CreateStep, string> = {
  1: "Recipient",
  2: "Stream details",
  3: "Stream settings",
};
export function PhoneCreateStreamView({ onClose }: PhoneCreateStreamViewProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const { execute, isPending } = useGaslessExecute();
  const poolId = SHIELDED_POOL[(network as NetworkName) ?? "testnet"];

  const [step, setStep] = useState<CreateStep>(1);
  const [freelancer, setFreelancer] = useState("");
  const [streamName, setStreamName] = useState("");
  const [amount, setAmount] = useState("800");
  const [durationValue, setDurationValue] = useState("14");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("days");
  const [note, setNote] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [useMilestones, setUseMilestones] = useState(false);
  const [milestones, setMilestones] = useState<string[]>([
    "request start",
    "Milestone 2",
    "Milestone 3",
  ]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [proving, setProving] = useState(false);
  const [created, setCreated] = useState(false);

  const deployed = packageId && packageId !== "0x0";
  const busy = isPending || proving;
  const effectiveMilestones = useMilestones
    ? ["request start", ...milestones.slice(1)]
    : ["request start"];

  useEffect(() => {
    setStep(1);
    setCreated(false);
    setStepError(null);
    setStatus(null);
  }, []);

  const validateStep = (current: CreateStep): string | null => {
    if (current === 1) {
      if (!looksLikeRecipient(freelancer)) {
        return `Pick a contact, enter @${suinsBrand()} handle, or a full Sui address.`;
      }
    }
    if (current === 2) {
      if (!(Number(amount) > 0)) return "Enter a valid amount.";
      if (!isPrivate && !(Number(durationValue) > 0)) {
        return "Enter a valid duration.";
      }
    }
    return null;
  };

  const goNext = async () => {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    if (step === 1) {
      // A shielded receive address (sl1…) is the worker's private-note key —
      // it needs no SuiNS/0x resolution and is only meaningful for a private
      // engagement (the worker is paid via a note encrypted to this address).
      const t = freelancer.trim();
      if (/^sl1[A-Za-z0-9+/_-]+$/.test(t)) {
        if (!isPrivate) {
          setStepError(
            "An sl1… receive address only works for a private stream — toggle Private, or use a @handle / 0x address."
          );
          return;
        }
        setStepError(null);
        setStatus(null);
        setStep(2);
        return;
      }
      try {
        setStepError(null);
        setStatus("Resolving recipient…");
        const resolved = await resolveRecipientOrThrow(client, freelancer);
        if (resolved.address === account?.address) {
          setStepError("Recipient must be different from your wallet.");
          setStatus(null);
          return;
        }
        setFreelancer(resolved.address);
        setStatus(
          resolved.handle
            ? `Resolved ${resolved.displayName}`
            : null
        );
      } catch (e) {
        setStepError(e instanceof Error ? e.message : String(e));
        setStatus(null);
        return;
      }
    }
    setStepError(null);
    if (step < 3) setStep((s) => (s + 1) as CreateStep);
  };

  const goBack = () => {
    setStepError(null);
    if (step > 1) setStep((s) => (s - 1) as CreateStep);
  };

  const onCreateFullPrivate = async () => {
    if (!account) return;
    if (!poolId || poolId === "0x0") {
      setStatus("Shielded pool not configured on this network.");
      return;
    }
    setProving(true);
    try {
      const totalBase = toBaseUnits(Number(amount));
      const durationMs = durationToMs(Number(durationValue) || 1, durationUnit);
      const durationSec = BigInt(Math.max(1, Math.floor(durationMs / 1000)));
      const sk = getSpendKey(account.address);
      const recipient = freelancer.trim();
      const shielded = /^sl1[A-Za-z0-9+/_-]+$/.test(recipient)
        ? recipient
        : undefined;
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
        recipientShielded: shielded,
        label: streamName || undefined,
      });
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

      let fundingCm = prepared.cm;
      let fundingRho = prepared.rho;
      let fundingValue = totalBase;
      let changeCm: bigint | null = null;
      let changeRho: bigint | null = null;

      if (prepared.changeBase > 0n) {
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
        fundingCm = split.cmWork;
        fundingRho = split.rhoWork;
        changeCm = split.cmChange;
        changeRho = split.rhoChange;
      }

      setStatus("Confirming on-chain…");
      const engagementId = await findCreatedEngagement(client, openDigest);
      if (engagementId) {
        rememberStreamLabel(engagementId, streamName || "Private engagement");
        addEngagement(account.address, {
          engagementId,
          coinType: usdcType,
          poolId,
          fundingCm: fundingCm.toString(),
          fundingRho: fundingRho.toString(),
          fundingValue: fundingValue.toString(),
          rate: prepared.rate.toString(),
          start: prepared.start.toString(),
          cap: totalBase.toString(),
          rParams: prepared.rParams.toString(),
          paramsCommitment: prepared.paramsCommitment.toString(),
          workerShielded: shielded,
          label: streamName || undefined,
          createdAt: Date.now(),
        });
        addNote(account.address, {
          commitment: fundingCm.toString(),
          value: fundingValue.toString(),
          rho: fundingRho.toString(),
          spent: false,
          createdAt: Date.now(),
        });
        if (changeCm && changeRho && prepared.changeBase > 0n) {
          addNote(account.address, {
            commitment: changeCm.toString(),
            value: prepared.changeBase.toString(),
            rho: changeRho.toString(),
            spent: false,
            createdAt: Date.now(),
          });
        }
      }
      setCreated(true);
      setStatus(
        prepared.changeBase > 0n
          ? `Private engagement opened — public edge ${formatUsd(Number(prepared.depositBase) / 1e6)}; work ${formatUsd(Number(amount))}.`
          : `Private engagement opened — amount, who, and when hidden in the pool.`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  };

  const onCreatePrivate = async () => {
    if (!account) return;
    const recipient = freelancer.trim();
    setProving(true);
    try {
      setStatus("Generating commitments + proof in your browser…");
      const totalBase = toBaseUnits(Number(amount));
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
          setCreated(true);
          setStatus(`Private stream created — locked ${formatUsd(Number(amount))}.`);
        },
        onError: (e) => setStatus(e.message),
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  };

  const onCreate = () => {
    const err = validateStep(3);
    if (err) {
      setStepError(err);
      return;
    }
    if (!account) return;
    if (!deployed) {
      setStatus("Move package not deployed on this network yet.");
      return;
    }
    if (isPrivate && !useMilestones) {
      void onCreateFullPrivate();
      return;
    }
    if (isPrivate) {
      void onCreatePrivate();
      return;
    }

    const totalBase = toBaseUnits(Number(amount));
    const tx = buildCreateStreamV2({
      packageId,
      usdcType,
      sender: account.address,
      freelancer: freelancer.trim(),
      milestoneNames: effectiveMilestones,
      milestoneAmountsBase: splitMilestoneAmounts(totalBase, effectiveMilestones.length),
      totalBase,
      durationMs: durationToMs(Number(durationValue), durationUnit),
      yieldBps: DEFAULT_STREAM_YIELD_BPS,
    });
    setStatus("Awaiting wallet signature…");
    execute(tx, {
      onSuccess: (r) => {
        queueStreamLabel(streamName, freelancer.trim(), Number(totalBase));
        setCreated(true);
        setStatus(`Stream created — locked ${formatUsd(Number(amount))}. Digest ${r.digest.slice(0, 10)}…`);
      },
      onError: (e) => setStatus(e.message),
    });
  };

  const onDone = () => {
    setCreated(false);
    onClose();
  };

  if (created) {
    return (
      <div data-demo="create-done">
      <PhoneFlowShell
        step={3}
        totalSteps={3}
        title="Stream created"
        footer={
          <button
            type="button"
            onClick={onDone}
            className={btnPrimary}
            data-demo-action="create-done-btn"
          >
            Done
          </button>
        }
      >
        <p className="text-center text-[12px] leading-snug text-[#666]">
          {status ??
            "Funds are locked. Share the stream with the recipient — private by default."}
        </p>
      </PhoneFlowShell>
      </div>
    );
  }

  return (
    <PhoneFlowShell
      step={step}
      totalSteps={3}
      title={STEP_TITLES[step]}
      footer={
        <>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className={btnPrimary}
              data-demo-action="create-continue"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onCreate}
              disabled={!account || !deployed || busy}
              className={btnPrimary}
              data-demo="create-submit"
            >
              {busy ? "Creating…" : "Create stream"}
            </button>
          )}
          {step > 1 ? (
            <button type="button" onClick={goBack} className={btnSecondary}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
          )}
        </>
      }
    >
      {step === 1 && (
        <>
          <PhoneField label="Recipient">
            <input
              data-demo="create-recipient"
              value={freelancer}
              onChange={(e) => setFreelancer(e.target.value)}
              placeholder={`@${suinsBrand()} or 0x…`}
              className={`${phoneInputClass} text-[11px]`}
              spellCheck={false}
              autoComplete="off"
            />
          </PhoneField>
          <PhoneContactPicker
            selected={freelancer}
            onSelect={(address) => {
              setFreelancer(address);
              setStepError(null);
            }}
          />
        </>
      )}

      {step === 2 && (
        <>
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
              data-demo="create-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={phoneInputClass}
            />
          </PhoneField>

          {!isPrivate && (
            <PhoneDurationField
              value={durationValue}
              unit={durationUnit}
              onValueChange={setDurationValue}
              onUnitChange={setDurationUnit}
            />
          )}

          <PhoneField label="Note (optional)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Design + implementation"
              className={phoneInputClass}
            />
          </PhoneField>
        </>
      )}

      {step === 3 && (
        <>
          <PhoneToggleRow
            data-demo="create-private"
            title="Private stream"
            subtitle="Hide amount, who & when"
            checked={isPrivate}
            onChange={(v) => {
              setIsPrivate(v);
              if (v) setUseMilestones(false);
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
                    <span className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-[12px] text-[#444] backdrop-blur-sm">
                      request start
                    </span>
                  ) : (
                    <input
                      value={m}
                      onChange={(e) =>
                        setMilestones((prev) =>
                          prev.map((item, idx) => (idx === i ? e.target.value : item))
                        )
                      }
                      className="w-full rounded-xl border border-black/15 bg-white/80 px-3 py-2 text-[12px] outline-none backdrop-blur-sm focus:border-[#5b54e6]"
                    />
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((prev) => prev.filter((_, idx) => idx !== i))
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
                  setMilestones((prev) => [...prev, `Milestone ${prev.length + 1}`])
                }
                className="self-start rounded-lg border border-black/15 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#444] backdrop-blur-sm"
              >
                + add milestone
              </button>
            </div>
          </PhoneToggleRow>

          <p className="text-center text-[10px] leading-snug text-[#888]">
            Locked funds earn yield automatically — payments stream from the pool as
            milestones are approved.
          </p>

          {!deployed && (
            <p className="text-center text-[11px] text-[#888]">
              Move package not set for this network.
            </p>
          )}
          {status && (
            <p className="text-center text-[11px] leading-snug text-[#666]">{status}</p>
          )}
        </>
      )}

      {stepError && <p className="text-center text-[11px] text-[#c0533a]">{stepError}</p>}
    </PhoneFlowShell>
  );
}
