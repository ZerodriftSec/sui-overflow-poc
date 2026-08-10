"use client";

import { useCallback, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

import { useNetworkVariable } from "@/lib/networks";
import { useGaslessExecute } from "@/lib/use-gasless";
import { formatUsd, toBaseUnits } from "@/lib/stream-math";
import {
  buildCreateStreamV3,
  splitMilestoneAmounts,
  DEFAULT_DISPUTE_WINDOW_MS,
} from "@/lib/streamline-tx";
import { resolveRecipientOrThrow } from "@/lib/use-resolve-recipient";
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
  resolveStreamRequest,
  validateResolvedStreamRequest,
  type StreamRequestParams,
} from "@/lib/request-link";
import { queueStreamLabel, rememberStreamLabel } from "@/lib/stream-labels";

export function useCreateStreamFromRequest() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const packageId = useNetworkVariable("packageId");
  const usdcType = useNetworkVariable("usdcType");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const { execute, isPending } = useGaslessExecute();
  const [proving, setProving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const deployed = packageId && packageId !== "0x0";
  const busy = isPending || proving;

  const createFromRequest = useCallback(
    async (request: StreamRequestParams): Promise<boolean> => {
      if (!account) return false;
      if (!deployed) {
        setStatus("Move package not deployed on this network yet.");
        return false;
      }

      const resolved = resolveStreamRequest(request);
      const errors = validateResolvedStreamRequest(resolved);
      if (errors.length > 0) {
        setStatus(errors[0]);
        return false;
      }

      const {
        freelancer,
        amount,
        durationMs,
        isPrivate,
        milestones,
        splits,
      } = resolved;

      if (isPrivate) {
        setProving(true);
        try {
          setStatus("Generating commitments + proof in your browser…");
          const totalBase = toBaseUnits(amount);
          const recipient = freelancer.trim();
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
              milestones: milestones.length,
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
            nMilestones: milestones.length,
            remainingCommitment: remainingC,
            wrapProof: wrap.proof,
            earnedCommitment: earnedC,
            disputeWindowMs: DEFAULT_DISPUTE_WINDOW_MS,
            encryptedSecrets: envelope,
          });

          setStatus("Awaiting wallet signature…");
          let success = false;
          await execute(tx, {
            onSuccess: async ({ digest }) => {
              success = true;
              setStatus("Confirming on-chain…");
              const streamId = await findCreatedConfidentialStream(client, digest);
              if (streamId) {
                rememberStreamLabel(streamId, request.streamName);
                addSecret(account.address, {
                  streamId,
                  coinType: usdcType,
                  totalBase: totalBase.toString(),
                  milestones: milestones.length,
                  freelancer: recipient,
                  remainingBase: totalBase.toString(),
                  rRemaining: rRemaining.toString(),
                  earnedBase: "0",
                  rEarned: rEarned.toString(),
                  createdAt: Date.now(),
                });
              }
              setStatus(
                `Private stream created — locked ${formatUsd(amount)}. Digest ${digest}`
              );
            },
            onError: (e) => setStatus(e.message),
          });
          return success;
        } catch (e) {
          setStatus(e instanceof Error ? e.message : String(e));
          return false;
        } finally {
          setProving(false);
        }
      }

      const totalBase = toBaseUnits(amount);
      // Resolve each split's destination: blank → the recipient's own wallet,
      // 0x… → as-is, name/@handle → SuiNS. Each drip routes by weight (bps).
      setStatus("Resolving payout destinations…");
      let destinations: string[];
      try {
        destinations = [];
        for (const s of splits) {
          const a = s.address.trim();
          if (!a) destinations.push(freelancer);
          else if (/^0x[0-9a-fA-F]{64}$/.test(a)) destinations.push(a);
          else destinations.push((await resolveRecipientOrThrow(client, a)).address);
        }
      } catch (e) {
        setStatus(
          e instanceof Error ? e.message : "Could not resolve a destination."
        );
        return false;
      }
      // Weights must sum to exactly 10000 (validate already checks 100%);
      // absorb rounding drift into the last leg.
      const weightsBps = splits.map((s) => Math.round((Number(s.pct) || 0) * 100));
      weightsBps[weightsBps.length - 1] +=
        10_000 - weightsBps.reduce((x, y) => x + y, 0);
      const yieldFlags = splits.map((s) => s.yield);
      const tx = buildCreateStreamV3({
        packageId,
        usdcType,
        sender: account.address,
        freelancer,
        milestoneNames: milestones,
        milestoneAmountsBase: splitMilestoneAmounts(totalBase, milestones.length),
        totalBase,
        durationMs,
        destinations,
        weightsBps,
        yieldFlags,
      });
      setStatus("Awaiting wallet signature…");
      let success = false;
      await execute(tx, {
        onSuccess: (r) => {
          success = true;
          queueStreamLabel(request.streamName, freelancer, Number(totalBase));
          setStatus(`Stream created — locked ${formatUsd(amount)}. Digest ${r.digest}`);
        },
        onError: (e) => setStatus(e.message),
      });
      return success;
    },
    [
      account,
      client,
      deployed,
      execute,
      originalPackageId,
      packageId,
      usdcType,
    ]
  );

  return { createFromRequest, busy, status, deployed };
}
