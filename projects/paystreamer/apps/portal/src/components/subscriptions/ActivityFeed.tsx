import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Badge } from "@paystreamer/sdk";
import { Button } from "@paystreamer/sdk";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@paystreamer/sdk";
import { Tabs, TabsList, TabsTrigger } from "@paystreamer/sdk";
import { 
  queryAccountCreatedEvents,
  queryPaymentProcessedEvents,
  queryDepositEvents,
  queryPaymentFailedEvents
} from "@paystreamer/sdk/core";
import {
  CheckCircle,
  XCircle,
  ArrowDownCircle,
  Download,
  AlertTriangle,
} from "lucide-react";
import { formatMistToPUSD } from "../../lib/format";
import { useAppConfig } from "../../hooks/useAppConfig";

type FilterTab = "all" | "payments" | "deposits" | "alerts";

interface EventRow {
  type: "payment" | "deposit" | "alert";
  timestamp: number;
  description: string;
  amount: number;
  status: "success" | "failed";
  reason?: string;
  digest: string;
}

export function ActivityFeed() {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // First, get the user's account IDs
  const { data: accounts } = useQuery({
    queryKey: ["account-created-events", account?.address, config.network],
    queryFn: async () => {
      if (!account?.address) return [];
      return await queryAccountCreatedEvents(account.address, config.network);
    },
    enabled: !!account,
  });

  const accountIds = accounts?.map(a => a.account_id) || [];

  const { data: events, isPending: eventsPending } = useQuery({
    queryKey: ["activity-events", accountIds, config.network],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      // Query for all accounts and flatten
      const promises = accountIds.map(id => queryPaymentProcessedEvents(id, undefined, config.network));
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: accountIds.length > 0,
  });

  const { data: depositEvents, isPending: depositsPending } = useQuery({
    queryKey: ["deposit-events", accountIds, config.network],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      const promises = accountIds.map(id => queryDepositEvents(id, config.network));
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: accountIds.length > 0,
  });

  const { data: failedEvents, isPending: failedPending } = useQuery({
    queryKey: ["failed-events", accountIds, config.network],
    queryFn: async () => {
      if (accountIds.length === 0) return [];
      const promises = accountIds.map(id => queryPaymentFailedEvents(id, config.network));
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: accountIds.length > 0,
  });

  const accountsPending = accounts === undefined && !!account;
  const isPending = accountsPending || (accountIds.length > 0 && (eventsPending || depositsPending || failedPending));


  const allRows: EventRow[] = [
    ...(events || []).map((e) => ({
      type: "payment" as const,
      timestamp: e.timestamp,
      description: `Payment to ${e.platform_id?.slice(0, 8)}...`,
      amount: Number(e.amount),
      status: "success" as const,
      digest: e.id, // Using id as digest
    })),
    ...(depositEvents || []).map((e) => ({
      type: "deposit" as const,
      timestamp: e.timestamp,
      description: "Account deposit",
      amount: Number(e.amount),
      status: "success" as const,
      digest: e.id,
    })),
    ...(failedEvents || []).map((e) => ({
      type: "alert" as const,
      timestamp: e.timestamp,
      description: `Payment failed to ${e.platform_id?.slice(0, 8)}...`,
      amount: 0, // Failed events don't have amount in the new event structure
      status: "failed" as const,
      reason: e.reason,
      digest: e.id,
    })),
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);

  const filteredRows = allRows.filter((row) => {
    if (activeTab === "all") return true;
    if (activeTab === "payments") return row.type === "payment";
    if (activeTab === "deposits") return row.type === "deposit";
    if (activeTab === "alerts") return row.type === "alert";
    return true;
  });

  function exportCSV() {
    const headers = ["Timestamp", "Type", "Description", "Amount", "Status", "Digest"];
    const rows = filteredRows.map((r) => [
      new Date(r.timestamp).toISOString(),
      r.type,
      r.description,
      r.amount.toString(),
      r.status,
      r.digest,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpand(digest: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(digest)) {
        next.delete(digest);
      } else {
        next.add(digest);
      }
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>Activity</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="deposits">Deposits</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No activity yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground sticky left-0 bg-card">
                    Timestamp
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Description</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Amount</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={`${row.type}-${row.timestamp}-${index}`} className="border-b">
                    <td className="py-3 px-2 font-mono text-xs sticky left-0 bg-card">
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-2">
                      {row.type === "payment" && (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          Payment
                        </span>
                      )}
                      {row.type === "deposit" && (
                        <span className="inline-flex items-center gap-1 text-blue-600">
                          <ArrowDownCircle className="h-4 w-4" />
                          Deposit
                        </span>
                      )}
                      {row.type === "alert" && (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          Alert
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <button
                        onClick={() => toggleExpand(row.digest || `${row.type}-${index}`)}
                        className="hover:underline text-left"
                      >
                        {row.description}
                      </button>
                      {expandedRows.has(row.digest || `${row.type}-${index}`) && row.reason && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {row.reason}
                        </p>
                      )}
                    </td>
                    <td className={`py-3 px-2 text-right font-mono ${row.type === "deposit" ? "text-blue-600" : "text-foreground"}`}>
                      {row.type === "deposit" ? "+" : "-"}
                      {formatMistToPUSD(row.amount)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <Badge variant={row.status === "success" ? "default" : "destructive"}>
                        {row.status === "success" ? "Success" : "Failed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
