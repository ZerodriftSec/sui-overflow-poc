'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { StatCard, Spinner } from '@/components/ui';
import { Users, Layers, Link2, Coins, CreditCard, RefreshCw, FileText } from 'lucide-react';

export default function AdminOverviewPage() {
  const { token } = useAdminAuth();
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getOverview(token)
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="mt-1 text-sm text-[#697386]">Platform-wide statistics and health</p>
      </div>

      {loading ? (
        <Spinner />
      ) : !overview ? (
        <p className="text-sm text-[#697386]">Failed to load platform data</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Merchants"
              value={String(overview.merchants ?? 0)}
              icon={Users}
            />
            <StatCard
              title="Total Apps"
              value={String(overview.apps ?? 0)}
              icon={Layers}
            />
            <StatCard
              title="Supported Chains"
              value={String(overview.chains ?? 0)}
              icon={Link2}
            />
            <StatCard
              title="Supported Tokens"
              value={String(overview.tokens ?? 0)}
              icon={Coins}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Payment Intents"
              value={String(overview.payments ?? 0)}
              icon={CreditCard}
            />
            <StatCard
              title="Subscriptions"
              value={String(overview.subscriptions ?? 0)}
              icon={RefreshCw}
            />
            <StatCard
              title="Invoices"
              value={String(overview.invoices ?? 0)}
              icon={FileText}
            />
          </div>
        </>
      )}
    </div>
  );
}
