import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { Pencil, PowerOff, Power } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { TierModal } from "./TierModal";
import { getErrorMessage } from "../../lib/errors";
import { formatMistToPUSD, formatFrequency } from "../../lib/format";
import { useAppConfig } from "../../hooks/useAppConfig";

interface TierCardProps {
  platformId: string;
  initialSharedVersion: number;
  tier: {
    name: string;
    amount: string;
    frequency: string;
    subscriber_count: number;
    is_active: boolean;
  };
  tierIndex: number;
}



export function TierCard({ platformId, initialSharedVersion, tier, tierIndex }: TierCardProps) {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freqLabel = formatFrequency(tier);

  async function deactivateTier() {
    if (!account) return;

    setIsPending(true);
    setError(null);

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.PACKAGE_ID}::platform::deactivate_tier_by_index`,
      arguments: [
        tx.sharedObjectRef({
          objectId: platformId,
          initialSharedVersion,
          mutable: true,
        }),
        tx.pure.u64(tierIndex),
      ],
    });

    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === "FailedTransaction") {
        throw new Error(
          (result.FailedTransaction as any).effects?.status?.error ?? "Transaction failed"
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-platforms", account.address] });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">{tier.name}</CardTitle>
              <CardDescription>{freqLabel}</CardDescription>
            </div>
            {tier.is_active ? (
              <Badge variant="default" className="bg-green-600">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">
                {formatMistToPUSD(tier.amount)}
              </p>
              <p className="text-sm text-muted-foreground">
                {tier.subscriber_count} subscriber{tier.subscriber_count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={!account || isPending}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {tier.is_active ? (
              <Button
                size="sm"
                variant="outline"
                onClick={deactivateTier}
                disabled={!account || isPending}
                loading={isPending}
              >
                <PowerOff className="h-4 w-4 mr-1" />
                Deactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {}}
                disabled={!account || isPending}
              >
                <Power className="h-4 w-4 mr-1" />
                Activate
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <TierModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        platformId={platformId}
        initialSharedVersion={initialSharedVersion}
        tier={tier}
        tierIndex={tierIndex}
      />
    </>
  );
}