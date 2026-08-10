import { useState } from "react";
import { Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { formatMistToPUSD } from "../../lib/format";

interface Subscriber {
  wallet: string;
  tier: string;
  status: "active" | "paused";
  since: number;
  totalPaid: string;
  paymentHistory?: Array<{
    date: string;
    amount: string;
    status: string;
  }>;
}

interface SubscriberTableProps {
  platformId: string;
  subscribers: Subscriber[];
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}



export function SubscriberTable({ platformId, subscribers }: SubscriberTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  function exportToCSV() {
    const headers = ["Wallet", "Tier", "Status", "Since", "Total Paid"];
    const rows = subscribers.map((sub) => [
      sub.wallet,
      sub.tier,
      sub.status,
      formatDate(sub.since),
      formatMistToPUSD(sub.totalPaid),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${platformId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (subscribers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No subscribers yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Subscribers</CardTitle>
          <Button size="sm" variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium sticky left-0 bg-muted/50">
                  Wallet
                </th>
                <th className="px-4 py-3 text-left font-medium">Tier</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Since</th>
                <th className="px-4 py-3 text-left font-medium">Total Paid</th>
                <th className="px-4 py-3 text-left font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((subscriber) => (
                <>
                  <tr
                    key={subscriber.wallet}
                    className="border-b cursor-pointer hover:bg-muted/30"
                    onClick={() =>
                      setExpandedRow(
                        expandedRow === subscriber.wallet ? null : subscriber.wallet
                      )
                    }
                  >
                    <td className="px-4 py-3 sticky left-0 bg-background">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{truncateAddress(subscriber.wallet)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(subscriber.wallet);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">{subscriber.tier}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            subscriber.status === "active" ? "bg-green-500" : "bg-amber-500"
                          }`}
                        />
                        <span className="capitalize">{subscriber.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatDate(subscriber.since)}</td>
                    <td className="px-4 py-3">{formatMistToPUSD(subscriber.totalPaid)}</td>
                    <td className="px-4 py-3">
                      {expandedRow === subscriber.wallet ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                  </tr>
                  {expandedRow === subscriber.wallet && subscriber.paymentHistory && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Payment History</p>
                          <div className="space-y-1">
                            {subscriber.paymentHistory.map((payment, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{payment.date}</span>
                                <span>{formatMistToPUSD(payment.amount)}</span>
                                <Badge
                                  variant={payment.status === "success" ? "default" : "destructive"}
                                >
                                  {payment.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}