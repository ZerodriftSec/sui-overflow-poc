"use client";

import { useCallback, useMemo, useState } from "react";
import {
  useCurrentAccount,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientContext,
  useSuiClientQuery,
} from "@mysten/dapp-kit";
import { toBase64 } from "@mysten/sui/utils";

import { useNetworkVariable, type NetworkName } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import {
  commit,
  proveDrip,
  proveUnwrap,
  randomBlinding,
  buildConfidentialDripV2,
  buildClaimV2,
  buildConfRaiseCompletion,
  buildConfApproveMilestone,
  buildConfDispute,
} from "@/lib/confidential";
import {
  decryptSecrets,
  encryptSecrets,
  loadOrCreateSessionKey,
  type PrivateStreamPayload,
} from "@/lib/seal";
import { type PrivateStreamOnChain } from "@/lib/private-streams";
import { usePrivateStreams } from "@/lib/use-private-streams";
import {
  loadSecrets,
  saveSecrets,
  updateSecret,
  type PrivateStreamSecret,
} from "@/lib/confidential-store";
import { Card, StateBadge } from "./dashboard-ui";
import { usePhoneEmbedded } from "@/components/app/phone/PhoneEmbeddedContext";

const STATE_LABELS = [
  "locked",
  "pending_review",
  "dripping",
  "paused",
  "done",
] as const;

const usd = (base: bigint) => `$${(Number(base) / 1e6).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;
const scan = (id: string) => `https://suiscan.xyz/testnet/object/${id}`;

const btnPrimary =
  "w-full rounded-2xl bg-[#111] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";
const btnSoft =
  "w-full rounded-2xl border border-black/12 bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111] disabled:opacity-40";
const btnAccent =
  "w-full rounded-2xl bg-[#1d9e75] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40";
const btnDanger =
  "w-full rounded-2xl border border-[#c0533a]/35 bg-[#c0533a]/[0.06] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#c0533a] disabled:opacity-40";
const btnLegacy =
  "border border-[#2b2a5e]/30 px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#2b2a5e]/80 hover:border-[#5b54e6] disabled:opacity-40";
const btnLegacyPrimary =
  "bg-[#2b2a5e] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40";
const btnLegacyAccent =
  "bg-[#1d9e75] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40";
const btnLegacyOutline =
  "border border-[#5b54e6] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#5b54e6] hover:bg-[#5b54e6]/[0.06] disabled:opacity-40";
const btnLegacyDanger =
  "border border-[#c0533a] px-4 py-2 text-[11px] uppercase tracking-[0.1em] text-[#c0533a] hover:bg-[#c0533a]/[0.06] disabled:opacity-40";

function PhoneStatePill({ state }: { state: string }) {
  const tone =
    state === "dripping"
      ? "border-[#1d9e75]/30 bg-[#1d9e75]/12 text-[#1d9e75]"
      : state === "pending_review"
        ? "border-[#d98a2b]/30 bg-[#d98a2b]/12 text-[#d98a2b]"
        : state === "paused"
          ? "border-[#c0533a]/30 bg-[#c0533a]/12 text-[#c0533a]"
          : state === "done"
            ? "border-[#7f77dd]/30 bg-[#7f77dd]/12 text-[#7f77dd]"
            : "border-black/10 bg-[#fafafa] text-[#888]";
  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${tone}`}
    >
      {state.replace("_", " ")}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#888]">
        {label}
      </p>
      <p className="mt-1 text-[12px] font-semibold tabular-nums leading-snug text-[#111]">
        {value}
      </p>
    </div>
  );
}

/** Reject after `ms` so a hung Seal/wallet call can't pin the UI in "busy". */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

type Role = "sender" | "freelancer";

/** Map of stream id → owned StreamCap (original package type — see networks). */
function useStreamCaps(originalPackageId: string) {
  const account = useCurrentAccount();
  const { data } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address ?? "",
      filter: { StructType: `${originalPackageId}::stream::StreamCap` },
      options: { showContent: true },
    },
    { enabled: !!account && originalPackageId !== "0x0" }
  );
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.data ?? []) {
      const content = o.data?.content;
      if (content?.dataType === "moveObject") {
        const fields = content.fields as Record<string, unknown>;
        const streamId = fields["stream_id"] as string | undefined;
        if (streamId && o.data?.objectId) map.set(streamId, o.data.objectId);
      }
    }
    return map;
  }, [data]);
}

function payloadFromLocal(s: PrivateStreamSecret): PrivateStreamPayload {
  return {
    v: 1,
    coinType: s.coinType,
    totalBase: s.totalBase,
    milestones: s.milestones,
    freelancer: s.freelancer,
    remainingBase: s.remainingBase,
    rRemaining: s.rRemaining,
    earnedBase: s.earnedBase,
    rEarned: s.rEarned,
  };
}

async function matchesChain(
  payload: PrivateStreamPayload,
  stream: PrivateStreamOnChain
): Promise<boolean> {
  const c = await commit(BigInt(payload.remainingBase), BigInt(payload.rRemaining));
  return toBase64(c) === toBase64(stream.remainingCommitment);
}

export function PrivateStreamsPanel({
  role,
  only,
}: {
  role: Role;
  /** Render just this one stream (for the unified stream-tabs view). */
  only?: string;
}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { network } = useSuiClientContext();
  const packageId = useNetworkVariable("packageId");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const { execute, isPending } = useGaslessExecute();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const caps = useStreamCaps(originalPackageId);

  const { data: streams, isLoading, refetch } = usePrivateStreams(role);
  const [unlocked, setUnlocked] = useState<Map<string, PrivateStreamPayload>>(
    new Map()
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const addr = account?.address;

  const setPayload = useCallback(
    (streamId: string, payload: PrivateStreamPayload) => {
      setUnlocked((m) => new Map(m).set(streamId, payload));
    },
    []
  );

  /** Persist refreshed secrets locally so future sessions skip Seal. */
  const persistLocal = useCallback(
    (streamId: string, payload: PrivateStreamPayload) => {
      if (!addr) return;
      const existing = loadSecrets(addr);
      if (existing.some((s) => s.streamId === streamId)) {
        updateSecret(addr, streamId, {
          remainingBase: payload.remainingBase,
          rRemaining: payload.rRemaining,
          earnedBase: payload.earnedBase,
          rEarned: payload.rEarned,
        });
      } else {
        saveSecrets(addr, [
          {
            streamId,
            coinType: payload.coinType,
            totalBase: payload.totalBase,
            milestones: payload.milestones,
            freelancer: payload.freelancer,
            remainingBase: payload.remainingBase,
            rRemaining: payload.rRemaining,
            earnedBase: payload.earnedBase,
            rEarned: payload.rEarned,
            createdAt: Date.now(),
          },
          ...existing,
        ]);
      }
    },
    [addr]
  );

  /** Local cache first (no popup); fall back to Seal decryption. */
  const unlock = useCallback(
    async (stream: PrivateStreamOnChain) => {
      if (!addr) return;
      setBusy(stream.id);
      setStatus(null);
      try {
        const local = loadSecrets(addr).find((s) => s.streamId === stream.id);
        if (local) {
          const payload = payloadFromLocal(local);
          if (await matchesChain(payload, stream)) {
            setPayload(stream.id, payload);
            return;
          }
        }
        if (stream.encryptedSecrets.length === 0) {
          if (local) {
            // Stale local secrets and nothing on-chain to recover from (pre-v3
            // stream) — surface the mismatch instead of mis-proving.
            setStatus(
              "Secrets out of sync with chain and no Seal envelope found on this stream."
            );
            setPayload(stream.id, payloadFromLocal(local));
            return;
          }
          setStatus("No Seal envelope on this stream — ask the other party to re-share.");
          return;
        }
        setStatus("Approve the Seal signature in your wallet (check for a popup)…");
        const sessionKey = await withTimeout(
          loadOrCreateSessionKey({
            suiClient: client,
            address: addr,
            network: network as NetworkName,
            sealNamespace: originalPackageId,
            signPersonalMessage: (message) => signPersonalMessage({ message }),
          }),
          90_000,
          "Wallet never signed the Seal session — no signature popup appeared. Reconnect the wallet (or use one that supports Sui personal-message signing) and retry."
        );
        setStatus("Fetching decryption keys from Seal key servers…");
        const payload = await withTimeout(
          decryptSecrets({
            suiClient: client,
            currentPackageId: packageId,
            envelopeBytes: stream.encryptedSecrets,
            role,
            sessionKey,
            address: addr,
          }),
          30_000,
          "Seal key servers did not respond in time. Retry, or check the key-server status."
        );
        setPayload(stream.id, payload);
        persistLocal(stream.id, payload);
        setStatus(null);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [addr, client, network, originalPackageId, packageId, role, signPersonalMessage, setPayload, persistLocal]
  );

  /** Drip a hidden milestone-sized delta and rotate the Seal ciphertext. */
  const onDrip = useCallback(
    async (stream: PrivateStreamOnChain, payload: PrivateStreamPayload) => {
      if (!addr) return;
      setBusy(stream.id);
      try {
        const remaining = BigInt(payload.remainingBase);
        const earned = BigInt(payload.earnedBase);
        let delta = BigInt(payload.totalBase) / BigInt(payload.milestones);
        if (delta > remaining) delta = remaining;
        if (delta <= 0n) {
          setStatus("Nothing left to drip.");
          return;
        }
        setStatus("Proving the confidential drip…");
        const rRemNew = randomBlinding();
        const rEarnNew = randomBlinding();
        const newRemaining = remaining - delta;
        const newEarned = earned + delta;
        const [newRemC, newEarnC, proof] = await Promise.all([
          commit(newRemaining, rRemNew),
          commit(newEarned, rEarnNew),
          proveDrip({
            senderOld: remaining,
            rSenderOld: BigInt(payload.rRemaining),
            rSenderNew: rRemNew,
            recipientOld: earned,
            rRecipientOld: BigInt(payload.rEarned),
            rRecipientNew: rEarnNew,
            delta,
          }),
        ]);

        const next: PrivateStreamPayload = {
          ...payload,
          remainingBase: newRemaining.toString(),
          rRemaining: rRemNew.toString(),
          earnedBase: newEarned.toString(),
          rEarned: rEarnNew.toString(),
        };
        setStatus("Re-encrypting secrets for both wallets…");
        const envelope = await encryptSecrets({
          suiClient: client,
          sealNamespace: originalPackageId,
          sender: stream.sender,
          freelancer: stream.freelancer,
          payload: next,
        });

        setStatus("Submitting drip…");
        await execute(
          buildConfidentialDripV2({
            packageId,
            coinType: stream.coinType,
            streamId: stream.id,
            newRemainingCommitment: newRemC,
            newEarnedCommitment: newEarnC,
            transferProof: proof.proof,
            encryptedSecrets: envelope,
          }),
          {
            onSuccess: () => {
              setPayload(stream.id, next);
              persistLocal(stream.id, next);
              setStatus(`Dripped ${usd(delta)} — hidden on-chain ✓`);
              refetch();
            },
            onError: (e) => setStatus(e.message),
          }
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [addr, client, originalPackageId, packageId, execute, setPayload, persistLocal, refetch]
  );

  /** Freelancer cashes out their hidden earned balance. */
  const onClaim = useCallback(
    async (stream: PrivateStreamOnChain, payload: PrivateStreamPayload) => {
      if (!addr) return;
      const earned = BigInt(payload.earnedBase);
      if (earned <= 0n) {
        setStatus("Nothing to claim yet — wait for a drip.");
        return;
      }
      setBusy(stream.id);
      try {
        setStatus("Proving the claim…");
        const unwrap = await proveUnwrap(earned, BigInt(payload.rEarned));
        const resetR = randomBlinding();
        const resetC = await commit(0n, resetR);

        const next: PrivateStreamPayload = {
          ...payload,
          earnedBase: "0",
          rEarned: resetR.toString(),
        };
        const envelope = await encryptSecrets({
          suiClient: client,
          sealNamespace: originalPackageId,
          sender: stream.sender,
          freelancer: stream.freelancer,
          payload: next,
        });

        setStatus("Submitting claim…");
        await execute(
          buildClaimV2({
            packageId,
            coinType: stream.coinType,
            streamId: stream.id,
            amount: earned,
            unwrapProof: unwrap.proof,
            resetCommitment: resetC,
            recipient: addr,
            encryptedSecrets: envelope,
          }),
          {
            onSuccess: () => {
              setPayload(stream.id, next);
              persistLocal(stream.id, next);
              setStatus(`Claimed ${usd(earned)} to your wallet ✓`);
              refetch();
            },
            onError: (e) => setStatus(e.message),
          }
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [addr, client, originalPackageId, packageId, execute, setPayload, persistLocal, refetch]
  );

  const onRaise = useCallback(
    (stream: PrivateStreamOnChain) => {
      setBusy(stream.id);
      setStatus("Raising milestone for review…");
      execute(
        buildConfRaiseCompletion({
          packageId,
          coinType: stream.coinType,
          streamId: stream.id,
        }),
        {
          onSuccess: () => {
            setStatus("Milestone raised — awaiting client approval.");
            refetch();
          },
          onError: (e) => setStatus(e.message),
          onSettled: () => setBusy(null),
        }
      );
    },
    [execute, packageId, refetch]
  );

  const onApprove = useCallback(
    (stream: PrivateStreamOnChain) => {
      const capId = caps.get(stream.id);
      if (!capId) {
        setStatus("StreamCap not found in this wallet.");
        return;
      }
      setBusy(stream.id);
      setStatus("Approving milestone…");
      execute(
        buildConfApproveMilestone({
          packageId,
          coinType: stream.coinType,
          streamId: stream.id,
          capId,
        }),
        {
          onSuccess: () => {
            setStatus("Milestone approved — dripping resumed.");
            refetch();
          },
          onError: (e) => setStatus(e.message),
          onSettled: () => setBusy(null),
        }
      );
    },
    [caps, execute, packageId, refetch]
  );

  const onDispute = useCallback(
    (stream: PrivateStreamOnChain) => {
      setBusy(stream.id);
      execute(
        buildConfDispute({
          packageId,
          coinType: stream.coinType,
          streamId: stream.id,
        }),
        {
          onSuccess: () => {
            setStatus("Stream paused pending arbitration.");
            refetch();
          },
          onError: (e) => setStatus(e.message),
          onSettled: () => setBusy(null),
        }
      );
    },
    [execute, packageId, refetch]
  );

  const shown = (streams ?? []).filter((s) => (only ? s.id === only : true));
  const embedded = usePhoneEmbedded();

  if (!addr) return null;
  if (isLoading) return null;
  if (shown.length === 0) return null;

  if (embedded) {
    return (
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-[#111]">
              Private stream
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-[#666]">
              Amounts hidden on-chain — decrypted locally on this device
              {role === "freelancer" ? " via Seal" : ""}.
            </p>
          </div>
          {shown.length === 1 ? (
            <PhoneStatePill
              state={STATE_LABELS[shown[0]!.state] ?? "locked"}
            />
          ) : null}
        </div>

        {shown.map((s) => {
          const payload = unlocked.get(s.id);
          const working = busy === s.id || isPending;
          const stateLabel = STATE_LABELS[s.state] ?? "locked";
          const remaining = payload
            ? usd(BigInt(payload.remainingBase))
            : "••••";
          const earned = payload ? usd(BigInt(payload.earnedBase)) : "••••";

          return (
            <div key={s.id} className="flex flex-col gap-3">
              <section className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#888]">
                  {payload ? "Remaining · " : "Encrypted · "}
                  <a
                    href={scan(s.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[#5b54e6]"
                  >
                    {short(s.id)}
                  </a>
                </p>
                <p className="mt-2 text-[2rem] font-bold tabular-nums leading-none text-[#111]">
                  {remaining}
                </p>
                <p className="mt-1.5 text-[11px] tabular text-[#888]">
                  Earned{" "}
                  <span className="font-semibold text-[#111]">{earned}</span>
                  <span className="text-[#888]"> · </span>
                  Reserve{" "}
                  <span className="font-semibold text-[#111]">
                    {usd(s.reserve)}
                  </span>
                </p>
                <p className="mt-2 text-[11px] font-medium text-[#666]">
                  Milestone{" "}
                  {Math.min(s.currentMilestone + 1, s.nMilestones)}/
                  {s.nMilestones}
                  {!payload ? " · unlock to reveal amounts" : ""}
                </p>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Status" value={stateLabel.replace("_", " ")} />
                <MiniStat
                  label="Role"
                  value={role === "freelancer" ? "Receiver" : "Sender"}
                />
                <MiniStat label="Reserve" value={usd(s.reserve)} />
                <MiniStat
                  label="Milestone"
                  value={`${Math.min(s.currentMilestone + 1, s.nMilestones)}/${s.nMilestones}`}
                />
              </div>

              <div className="flex flex-col gap-2">
                {!payload && (
                  <button
                    type="button"
                    onClick={() => unlock(s)}
                    disabled={working}
                    className={btnPrimary}
                  >
                    {working ? "Unlocking…" : "Decrypt amounts"}
                  </button>
                )}
                {payload && s.state === 2 && (
                  <button
                    type="button"
                    onClick={() => onDrip(s, payload)}
                    disabled={working}
                    className={btnSoft}
                  >
                    {working ? "Working…" : "Drip hidden"}
                  </button>
                )}
                {role === "freelancer" && s.state === 2 && (
                  <button
                    type="button"
                    onClick={() => onRaise(s)}
                    disabled={working}
                    className={btnSoft}
                  >
                    Raise milestone
                  </button>
                )}
                {role === "freelancer" && payload && (
                  <button
                    type="button"
                    onClick={() => onClaim(s, payload)}
                    disabled={working || BigInt(payload.earnedBase) <= 0n}
                    className={btnAccent}
                  >
                    Claim {usd(BigInt(payload.earnedBase))}
                  </button>
                )}
                {role === "sender" && s.state === 1 && (
                  <button
                    type="button"
                    onClick={() => onApprove(s)}
                    disabled={working}
                    className={btnAccent}
                  >
                    {working ? "Approving…" : "Approve milestone"}
                  </button>
                )}
                {(s.state === 1 || s.state === 2) && (
                  <button
                    type="button"
                    onClick={() => onDispute(s)}
                    disabled={working}
                    className={btnDanger}
                  >
                    Dispute
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {status && (
          <p className="rounded-2xl border border-black/8 bg-[#fafafa] px-3 py-2.5 text-[11px] leading-snug text-[#555]">
            {status}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card title="Private streams 🔒" padded={false}>
      <p className="px-5 pt-4 text-[11px] text-[#2b2a5e]/55">
        Amounts hidden on-chain — values below are decrypted locally
        {role === "freelancer" ? " via Seal" : ""} and never leave this device.
      </p>
      <div className="flex flex-col">
        {shown.map((s) => {
          const payload = unlocked.get(s.id);
          const working = busy === s.id || isPending;
          const stateLabel = STATE_LABELS[s.state] ?? "locked";
          return (
            <div
              key={s.id}
              className="grid grid-cols-1 gap-4 border-t border-[#2b2a5e]/10 p-5 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={scan(s.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[13px] text-[#5b54e6] underline"
                  >
                    {short(s.id)}
                  </a>
                  <StateBadge state={stateLabel} />
                  <span className="text-[11px] text-[#2b2a5e]/50">
                    milestone {Math.min(s.currentMilestone + 1, s.nMilestones)}/
                    {s.nMilestones}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#2b2a5e]/40">
                    amounts hidden
                  </span>
                </div>
                <div className="flex flex-wrap gap-5 text-[12px] text-[#2b2a5e]/70">
                  <span>
                    reserve <strong className="tabular">{usd(s.reserve)}</strong>
                  </span>
                  {payload ? (
                    <>
                      <span>
                        remaining{" "}
                        <strong className="tabular">
                          {usd(BigInt(payload.remainingBase))}
                        </strong>
                      </span>
                      <span>
                        earned{" "}
                        <strong className="tabular">
                          {usd(BigInt(payload.earnedBase))}
                        </strong>
                      </span>
                    </>
                  ) : (
                    <span className="text-[#2b2a5e]/45">
                      remaining / earned encrypted
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!payload && (
                  <button
                    onClick={() => unlock(s)}
                    disabled={working}
                    className={btnLegacyPrimary}
                  >
                    {working ? "…" : "decrypt 🔓"}
                  </button>
                )}
                {payload && s.state === 2 && (
                  <button
                    onClick={() => onDrip(s, payload)}
                    disabled={working}
                    className={btnLegacyOutline}
                  >
                    drip hidden
                  </button>
                )}
                {role === "freelancer" && s.state === 2 && (
                  <button
                    onClick={() => onRaise(s)}
                    disabled={working}
                    className={btnLegacy}
                  >
                    raise milestone
                  </button>
                )}
                {role === "freelancer" && payload && (
                  <button
                    onClick={() => onClaim(s, payload)}
                    disabled={working || BigInt(payload.earnedBase) <= 0n}
                    className={btnLegacyAccent}
                  >
                    claim {usd(BigInt(payload.earnedBase))}
                  </button>
                )}
                {role === "sender" && s.state === 1 && (
                  <button
                    onClick={() => onApprove(s)}
                    disabled={working}
                    className={btnLegacyAccent}
                  >
                    {working ? "…" : "approve"}
                  </button>
                )}
                {(s.state === 1 || s.state === 2) && (
                  <button
                    onClick={() => onDispute(s)}
                    disabled={working}
                    className={btnLegacyDanger}
                  >
                    dispute
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {status && (
        <p className="break-words border-t border-[#2b2a5e]/10 px-5 py-3 text-[11px] text-[#2b2a5e]/70">
          {status}
        </p>
      )}
    </Card>
  );
}
