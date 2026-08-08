import { useState, useEffect } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { buildProposeTreasuryChangeTx, buildAcceptTreasuryChangeTx, buildCancelTreasuryChangeTx } from "@paystreamer/sdk/core";
import { Copy, ExternalLink, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@paystreamer/sdk";
import { Input } from "@paystreamer/sdk";
import { Button } from "@paystreamer/sdk";
import {   CLOCK_OBJECT_ID  } from "@paystreamer/sdk";
import { getErrorMessage } from "../../lib/errors";
import { useAppConfig } from "../../hooks/useAppConfig";

interface TreasuryManagerProps {
  platformId: string;
  initialSharedVersion: number;
  currentTreasury?: string;
  pendingTreasury?: string;
  pendingTreasuryChangeTime?: number;
}

function truncateAddress(address: string): string {
  if (!address || address.length <= 12) return address || "Not set";
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function formatExplorerLink(address: string, network: string): string {
  return `https://suiscan.xyz/${network}/account/${address}`;
}

function getTimeRemaining(changeTimeMs: number): { hours: number; minutes: number; seconds: number; isEligible: boolean } {
  const now = Date.now();
  const remaining = changeTimeMs - now;

  if (remaining <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isEligible: true };
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);

  return { hours, minutes, seconds, isEligible: false };
}

export function TreasuryManager({
  platformId,
  initialSharedVersion,
  currentTreasury,
  pendingTreasury,
  pendingTreasuryChangeTime,
}: TreasuryManagerProps) {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [newTreasury, setNewTreasury] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, isEligible: false });

  const hasPendingChange = !!pendingTreasury && !!pendingTreasuryChangeTime;

  useEffect(() => {
    if (!pendingTreasuryChangeTime) return;

    const updateCountdown = () => {
      setCountdown(getTimeRemaining(pendingTreasuryChangeTime));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pendingTreasuryChangeTime]);

  async function proposeTreasuryChange() {
    if (!account || !newTreasury) return;

    if (!/^0x[0-9a-fA-F]{64}$/.test(newTreasury)) {
      setError("Invalid Sui address format");
      return;
    }

    setIsPending(true);
    setError(null);

    const tx = new Transaction();
    buildProposeTreasuryChangeTx({
      tx,
      packageId: config.PACKAGE_ID,
      clockId: CLOCK_OBJECT_ID,
      platformId,
      platformInitVersion: initialSharedVersion,
      newTreasury,
    });

    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error(
          (result.FailedTransaction as any).effects?.status?.error ?? "Transaction failed"
        );
      }
      setNewTreasury("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  async function acceptTreasuryChange() {
    if (!account || !countdown.isEligible) return;

    setIsPending(true);
    setError(null);

    const tx = new Transaction();
    buildAcceptTreasuryChangeTx({
      tx,
      packageId: config.PACKAGE_ID,
      clockId: CLOCK_OBJECT_ID,
      platformId,
      platformInitVersion: initialSharedVersion,
    });

    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error(
          (result.FailedTransaction as any).effects?.status?.error ?? "Transaction failed"
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  async function cancelTreasuryChange() {
    if (!account) return;

    setIsPending(true);
    setError(null);

    const tx = new Transaction();
    buildCancelTreasuryChangeTx({
      tx,
      packageId: config.PACKAGE_ID,
      platformId,
      platformInitVersion: initialSharedVersion,
    });

    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error(
          (result.FailedTransaction as any).effects?.status?.error ?? "Transaction failed"
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Treasury Management</CardTitle>
        <CardDescription>
          Manage your platform treasury address. Changes require a 48-hour timelock for security.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Current Treasury Address</label>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
            <span className="font-mono text-sm flex-1">{truncateAddress(currentTreasury || "")}</span>
            {currentTreasury && (
              <>
                <button
                  onClick={() => copyToClipboard(currentTreasury)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <a
                  href={formatExplorerLink(currentTreasury, config.network)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        </div>

        {!hasPendingChange && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Propose New Treasury</label>
              <Input
                placeholder="0x..."
                value={newTreasury}
                onChange={(e) => setNewTreasury(e.target.value)}
              />
            </div>
            <Button onClick={proposeTreasuryChange} disabled={!account || !newTreasury || isPending} loading={isPending}>
              Propose Change
            </Button>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Takes 48 hours to take effect for security
            </p>
          </div>
        )}

        {hasPendingChange && (
          <div className="space-y-4 p-4 rounded-lg border border-amber-200 bg-amber-50/50">
            <div className="space-y-2">
              <p className="text-sm font-medium">Pending Treasury Change</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{truncateAddress(pendingTreasury)}</span>
                <button
                  onClick={() => copyToClipboard(pendingTreasury!)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Time Remaining</p>
              <p className="text-xl font-mono font-bold">
                {String(countdown.hours).padStart(2, "0")}:
                {String(countdown.minutes).padStart(2, "0")}:
                {String(countdown.seconds).padStart(2, "0")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={acceptTreasuryChange}
                disabled={!account || !countdown.isEligible || isPending}
                loading={isPending}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                onClick={cancelTreasuryChange}
                disabled={!account || isPending}
                loading={isPending}
              >
                Cancel
              </Button>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Takes 48 hours to take effect for security
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}