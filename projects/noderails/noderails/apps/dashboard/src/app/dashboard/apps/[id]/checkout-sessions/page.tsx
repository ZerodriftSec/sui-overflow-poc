'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Table, Badge, Spinner, EmptyState } from '@/components/ui';
import { ShoppingCart } from 'lucide-react';

export default function AppCheckoutSessionsPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.getCheckoutSessions(token, { page: String(page), pageSize: '20', appId })
      .then((result) => {
        setSessions(result.items ?? []);
        setTotal(result.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, page, appId]);

  const statusVariant = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'success';
      case 'EXPIRED': return 'destructive';
      case 'OPEN': return 'warning';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checkout Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Checkout sessions created via API ({total})</p>
      </div>

      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No checkout sessions"
          description="Checkout sessions will appear here once created via the API"
          icon={ShoppingCart}
        />
      ) : (
        <>
          <Table headers={['ID', 'Mode', 'Items', 'Status', 'Expires', 'Created']}>
            {sessions.map((s: any) => (
              <tr key={s.id} className="hover:bg-muted transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-xs text-secondary-foreground">
                  {s.id.slice(0, 4)}...{s.id.slice(-4)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={s.mode === 'SUBSCRIPTION' ? 'default' : 'outline'}>
                    {s.mode}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-secondary-foreground">
                  {s.items?.length ?? 0} item{(s.items?.length ?? 0) !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>

          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40">Previous</button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 20)} className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
