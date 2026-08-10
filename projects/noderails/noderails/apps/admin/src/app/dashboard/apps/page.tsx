'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Table, Badge, Spinner, EmptyState } from '@/components/ui';
import { Zap } from 'lucide-react';

interface App {
  id: string;
  name: string;
  environment: string;
  receivingWallet?: string | null;
  payoutWallet?: string | null;
  merchant?: { email: string };
  createdAt: string;
}

export default function AppsPage() {
  const { token } = useAdminAuth();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadApps = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getAllApps(token, { page: String(page), pageSize: '20' });
      if (Array.isArray(res)) {
        setApps(res);
        setTotal(res.length);
        setHasMore(false);
      } else {
        setApps(res.items ?? []);
        setTotal(res.total ?? 0);
        setHasMore(res.hasMore ?? false);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const truncAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 8)}...${addr.slice(-4)}` : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Apps</h1>
        <p className="mt-1 text-sm text-[#697386]">
          View all merchant applications ({total} total)
        </p>
      </div>

      {loading ? (
        <Spinner />
      ) : apps.length === 0 ? (
        <EmptyState
          title="No apps found"
          description="No merchant applications have been created yet"
          icon={Zap}
        />
      ) : (
        <>
          <Table headers={['App Name', 'Merchant', 'Environment', 'Receiving Wallet', 'Payout Wallet', 'Created']}>
            {apps.map((app) => (
              <tr key={app.id} className="hover:bg-[#f6f8fa] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0ff]">
                      <Zap className="h-3.5 w-3.5 text-[#635bff]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#0a2540]">{app.name}</p>
                      <p className="font-mono text-[10px] text-[#a3acb9]" title={app.id}>{app.id.slice(0, 4)}...{app.id.slice(-4)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#425466]">
                  {app.merchant?.email ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={app.environment === 'PRODUCTION' ? 'success' : 'outline'}>
                    {app.environment}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#697386]">{truncAddr(app.receivingWallet)}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#697386]">{truncAddr(app.payoutWallet)}</td>
                <td className="px-4 py-3 text-sm text-[#697386]">
                  {new Date(app.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[#697386]">Page {page}</p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[#e3e8ee] px-3 py-1.5 text-xs font-medium text-[#425466] hover:bg-[#f6f8fa] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[#e3e8ee] px-3 py-1.5 text-xs font-medium text-[#425466] hover:bg-[#f6f8fa] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
