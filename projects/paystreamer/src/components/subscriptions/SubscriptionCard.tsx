import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";
import { useCurrentClient, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalFooter } from "../ui/modal";
import { parseMoveError, isRetryableError } from "../../lib/errors";
import { formatMistToPUSD, formatFrequency } from "../../lib/format";
import { TxStatusToast } from "../TxStatusToast";
import { TxStatus } from "../TxStatusToast";
import { Pause, Play, X, Zap } from "lucide-react";
import { 
  PAYMENT_SCHEDULER_ID,
  PAYMENT_SCHEDULER_INIT_VERSION,
  CLOCK_OBJECT_ID,
} from "@paystreamer/sdk";
import { useSponsoredTransaction } from "../../hooks/useSponsoredTransaction";
import { useAppConfig } from "../../hooks/useAppConfig";

interface SubscriptionCardProps {
  accountId: string;
  capId: string;
  platformId: string;
  platformInitVersion: number;
  subscription: {
    tier_index: number;
    tier_name: string;
    amount: string | number;
    frequency_ms: string | number;
    status: { variant: number };
    next_billing_ts?: string | number;
    total_paid?: string | number;
    payment_count?: number;
  };
  denomination: string;
  onExpand?: () => void;
}


export function SubscriptionCard({
  accountId,
  capId,
  platformId,
  platformInitVersion,
  subscription,
  denomination,
  onExpand,
}: SubscriptionCardProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { executeSponsored } = useSponsoredTransaction();

  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: platform } = useQuery({
    queryKey: ["platform", platformId, config.network],
    queryFn: async () => {
      const { object } = await client.core.getObject({
        objectId: platformId,
        include: { json: true },
      });
      return object;
    },
    enabled: !!platformId,
  });

  const platformFields = platform?.json as Record<string, unknown> | undefined;
  const platformName = String(platformFields?.name ?? "Unknown Platform");

  const statusRaw = subscription?.status as any;
  const statusVariant = typeof statusRaw === 'number'
    ? statusRaw
    : (statusRaw?.variant ?? 0);

  const statusType =
    statusVariant === 0
      ? "default"
      : statusVariant === 1
      ? "secondary"
      : "destructive";

  const statusLabel =
    statusVariant === 0
      ? "Active"
      : statusVariant === 1
      ? "Paused"
      : "Cancelled";

  const nextBillingRaw = (subscription as any).next_billing_ts ?? (subscription as any).next_billing_time;
  const nextBillingMs = nextBillingRaw != null ? Number(nextBillingRaw) : null;
  const isDue = statusVariant === 0 && nextBillingMs != null && nextBillingMs <= Date.now();

  async function pauseSubscription() {
    if (!account) return;
    setIsPending(true);
    setError(null);
    setTxStatus("pending");
    setTxMessage("Pausing subscription...");

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.PACKAGE_ID}::billing::pause_subscription`,
        typeArguments: [denomination],
        arguments: [
          tx.object(capId),
          tx.object(accountId),
          tx.pure.id(platformId),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      setTxStatus("success");
      setTxMessage("Subscription paused");
      setTxDigest(result.digest!);
      await client.waitForTransaction({ digest: result.digest! });
      await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account?.address] });
    } catch (err) {
      setTxStatus("error");
      setTxMessage("Failed to pause");
      setError(parseMoveError(err));
    } finally {
      setIsPending(false);
    }
  }

  async function resumeSubscription() {
    if (!account) return;
    setIsPending(true);
    setError(null);
    setTxStatus("pending");
    setTxMessage("Resuming subscription...");

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.PACKAGE_ID}::billing::resume_subscription`,
        typeArguments: [denomination],
        arguments: [
          tx.object(capId),
          tx.object(accountId),
          tx.pure.id(platformId),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      setTxStatus("success");
      setTxMessage("Subscription resumed");
      setTxDigest(result.digest!);
      await client.waitForTransaction({ digest: result.digest! });
      await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account?.address] });
    } catch (err) {
      setTxStatus("error");
      setTxMessage("Failed to resume");
      setError(parseMoveError(err));
    } finally {
      setIsPending(false);
    }
  }

  async function cancelSubscription() {
    if (!account) return;
    setIsPending(true);
    setError(null);
    setTxStatus("pending");
    setTxMessage("Cancelling subscription...");

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${config.PACKAGE_ID}::billing::cancel_subscription`,
        typeArguments: [denomination],
        arguments: [
          tx.object(capId),
          tx.object(accountId),
          tx.pure.id(platformId),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      setTxStatus("success");
      setTxMessage("Subscription cancelled");
      setTxDigest(result.digest!);
      await client.waitForTransaction({ digest: result.digest! });
      await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account?.address] });
    } catch (err) {
      setTxStatus("error");
      setTxMessage("Failed to cancel");
      setError(parseMoveError(err));
    } finally {
      setIsPending(false);
    }
  }

  async function processPayment() {
    if (!account) return;
    if (platformInitVersion === null || platformInitVersion === undefined) {
      setTxStatus("error");
      setTxMessage("Platform version unavailable");
      setError("Could not load the platform's shared-object version. Please refresh and try again.");
      return;
    }
    setIsPending(true);
    setError(null);
    setTxStatus("pending");
    setTxMessage("Processing payment...");

    try {
      const tx = new Transaction();
      const limiters = tx.moveCall({
        target: `${config.PACKAGE_ID}::policies::empty_limiters`,
        arguments: [tx.object(CLOCK_OBJECT_ID)],
      });
      tx.moveCall({
        target: `${config.PACKAGE_ID}::policies::ensure_initialized`,
        typeArguments: [denomination],
        arguments: [tx.object(accountId), limiters, tx.object(CLOCK_OBJECT_ID)],
      });
      tx.moveCall({
        target: `${config.PACKAGE_ID}::scheduler::process_due_payment`,
        typeArguments: [denomination],
        arguments: [
          tx.sharedObjectRef({
            objectId: PAYMENT_SCHEDULER_ID,
            initialSharedVersion: PAYMENT_SCHEDULER_INIT_VERSION,
            mutable: true,
          }),
          tx.sharedObjectRef({
            objectId: platformId,
            initialSharedVersion: platformInitVersion,
            mutable: true,
          }),
          tx.object(accountId),
          limiters,
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      let digest: string | undefined;
      try {
        const result = await executeSponsored(tx);
        if (result.error) throw new Error(result.error);
        digest = result.digest;
      } catch (primaryErr) {
        const isTimeout =
          primaryErr instanceof Error &&
          (primaryErr.message.includes("504") ||
            primaryErr.message.includes("Gateway Timeout") ||
            primaryErr.message.includes("timeout") ||
            primaryErr.message.includes("exceeded") ||
            primaryErr.message.includes("network error"));

        if (isTimeout && isRetryableError(primaryErr)) {
          setTxStatus("pending");
          setTxMessage("Transaction submitted — waiting for confirmation...");
          setError("The request timed out but the transaction may still be processing on-chain. Waiting to confirm...");
          if (digest) {
            try {
              await client.core.waitForTransaction({ digest, timeout: 60_000 });
              setTxStatus("success");
              setTxMessage("Payment processed");
              setTxDigest(digest);
              await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account?.address] });
              await queryClient.invalidateQueries({ queryKey: ["account-created-events", account.address] });
              setIsPending(false);
              return;
            } catch {
              // confirmation polling failed — fall through to error state
            }
          }
          setTxStatus("error");
          setTxMessage("Transaction submitted — confirmation timed out");
          setError(
            "Your transaction was submitted but confirmation took too long. Please check the Sui Explorer to verify the payment status before retrying."
          );
          setIsPending(false);
          return;
        }
        throw primaryErr;
      }

      setTxStatus("success");
      setTxMessage("Payment processed");
      setTxDigest(digest!);
      await client.core.waitForTransaction({ digest: digest! });
      await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account?.address] });
      await queryClient.invalidateQueries({ queryKey: ["account-created-events", account.address] });
    } catch (err) {
      setTxStatus("error");
      setTxMessage("Failed to process payment");
      setError(parseMoveError(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Card className="cursor-pointer" onClick={onExpand}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{platformName}</CardTitle>
              <CardDescription>{subscription.tier_name}</CardDescription>
            </div>
            <Badge variant={statusType}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-lg font-semibold">
                {formatMistToPUSD((subscription as any).amount || (subscription as any).tier_amount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Frequency</p>
              <p className="text-lg font-semibold">
                {formatFrequency({ frequency_ms: String((subscription as any).frequency_ms || (subscription as any).tier_frequency_ms || (subscription as any).schedule_frequency_ms) })}
              </p>
            </div>
          </div>

          {((subscription as any).next_billing_ts || (subscription as any).next_billing_time) && statusVariant === 0 && (
            <div>
              <p className="text-sm text-muted-foreground">Next billing</p>
              <p className="text-sm">
                {new Date(Number((subscription as any).next_billing_ts || (subscription as any).next_billing_time)).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          )}

          {error && (
            <div className="p-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}

          {statusVariant !== 2 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {statusVariant === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    pauseSubscription();
                  }}
                  disabled={isPending}
                  loading={isPending}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause Billing
                </Button>
              ) : statusVariant === 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeSubscription();
                  }}
                  disabled={isPending}
                  loading={isPending}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume Billing
                </Button>
              ) : null}
              <Button
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  processPayment();
                }}
                disabled={isPending || !isDue || platformInitVersion == null || platformInitVersion === undefined}
                loading={isPending}
                title={
                  !isDue
                    ? "This subscription isn't due yet."
                    : undefined
                }
              >
                <Zap className="h-4 w-4 mr-1" />
                Process Now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCancelDialog(true);
                }}
                disabled={isPending}
                loading={isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel Subscription
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TxStatusToast
        status={txStatus}
        message={txMessage}
        digest={txDigest}
        onClose={() => setTxStatus("idle")}
      />

      <Modal open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Cancel Subscription?</ModalTitle>
            <ModalDescription>
              Are you sure you want to cancel this subscription? This action cannot be undone.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Subscription
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setShowCancelDialog(false);
                cancelSubscription();
              }}
              disabled={isPending}
            >
              Yes, Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
