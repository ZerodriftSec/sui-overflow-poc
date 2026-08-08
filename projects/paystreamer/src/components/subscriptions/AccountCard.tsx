import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { formatAmount, symbolFor } from "../../lib/format";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";

interface AccountCardProps {
  accountId: string;
  capId: string;
  denomination: string;
  onManage?: (accountId: string) => void;
}

function normalizeBalance(rawBalance: any): number {
  if (typeof rawBalance === "object" && rawBalance !== null) {
    return parseInt(rawBalance.public_balance ?? rawBalance.balance ?? rawBalance.value ?? "0", 10);
  }
  if (typeof rawBalance === "string" || typeof rawBalance === "number") {
    return parseInt(String(rawBalance), 10);
  }
  return 0;
}

export function AccountCard({ accountId, capId, denomination, onManage }: AccountCardProps) {
  const client = useCurrentClient();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { data: account, isPending } = useQuery({
    queryKey: ["subscription-account", accountId],
    queryFn: async () => {
      const { object } = await client.core.getObject({
        objectId: accountId,
        include: { json: true, type: true },
      });
      return object;
    },
    enabled: !!accountId,
  });

  const fields = account?.json as Record<string, unknown> | undefined;
  const rawBalance = fields?.address_balance ?? fields?.balance;
  
  const subscriptionsRaw = fields?.subscriptions as any;
  let subscriptionsCount = 0;
  if (subscriptionsRaw && typeof subscriptionsRaw === "object") {
    const contents = Array.isArray(subscriptionsRaw.contents) 
      ? subscriptionsRaw.contents 
      : (Array.isArray(subscriptionsRaw) ? subscriptionsRaw : Object.entries(subscriptionsRaw));
    subscriptionsCount = contents.length;
  }
  
  const status = (fields?.status as { variant?: number })?.variant;

  let actualDenomination = denomination;
  if (account?.type) {
    const match = account.type.match(/<([^>]+)>/);
    if (match) actualDenomination = match[1];
  }

  const symbol = symbolFor(actualDenomination);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription className="font-mono text-xs break-all">
                {accountId.slice(0, 8)}...{accountId.slice(-4)}
              </CardDescription>
            </div>
          </div>
          <Badge variant={status === 0 ? "default" : status === 1 ? "secondary" : "destructive"}>
            {status === 0 ? "Active" : status === 1 ? "Paused" : "Closed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-2xl font-bold">
              {isPending ? "..." : rawBalance !== undefined ? formatAmount(normalizeBalance(rawBalance), actualDenomination) : `0 ${symbol}`}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Subscriptions: {subscriptionsCount}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDepositOpen(true)}>
            Deposit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWithdrawOpen(true)}>
            Withdraw
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? (
              <>
                Hide Details <ChevronUp className="h-4 w-4 ml-1" />
              </>
            ) : (
              <>
                Manage <ChevronDown className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
          {onManage && (
            <Button variant="secondary" size="sm" onClick={() => onManage(accountId)}>
              View Details
            </Button>
          )}
        </div>

        {expanded && (
          <div className="pt-4 border-t space-y-2">
            <div className="text-xs space-y-2">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                <span className="text-muted-foreground shrink-0">Account ID:</span>
                <span className="font-mono break-all text-left sm:text-right">{accountId}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                <span className="text-muted-foreground shrink-0">Cap ID:</span>
                <span className="font-mono break-all text-left sm:text-right">{capId}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-muted-foreground shrink-0">Denomination:</span>
                <span>{symbol}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <DepositModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        accountId={accountId}
        capId={capId}
        denomination={actualDenomination}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["subscription-account", accountId] });
        }}
      />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        accountId={accountId}
        capId={capId}
        denomination={actualDenomination}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["subscription-account", accountId] });
        }}
      />
    </Card>
  );
}
