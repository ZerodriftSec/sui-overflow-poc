'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Table, Badge, Button, Input, Card, Spinner, EmptyState } from '@/components/ui';
import { Users, ShieldBan, ShieldCheck, X, Eye } from 'lucide-react';

interface Merchant {
  id: string;
  email: string;
  merchantType?: 'BUSINESS' | 'INDIVIDUAL';
  businessName?: string | null;
  individualName?: string | null;
  orgName: string | null;
  role: string;
  isSuspended: boolean;
  suspendedReason: string | null;
  createdAt: string;
  _count?: { apps: number };
}

export default function MerchantsPage() {
  const { token } = useAdminAuth();
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Suspend modal state
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const merchantDisplayName = (m: Merchant) => {
    if (m.merchantType === 'INDIVIDUAL') return m.individualName ?? m.orgName ?? '—';
    return m.businessName ?? m.orgName ?? '—';
  };

  const loadMerchants = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getMerchants(token, { page: String(page), pageSize: '20' });
      if (result.items) {
        setMerchants(result.items);
        setTotal(result.total ?? 0);
      } else if (Array.isArray(result)) {
        setMerchants(result);
        setTotal(result.length);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  const handleSuspend = async () => {
    if (!token || !suspendingId) return;
    setActionLoading(true);
    setError('');
    try {
      await api.suspendMerchant(token, suspendingId, suspendReason || undefined);
      setSuspendingId(null);
      setSuspendReason('');
      await loadMerchants();
    } catch (err: any) {
      setError(err.message ?? 'Failed to suspend merchant');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async (merchantId: string) => {
    if (!token || !confirm('Unsuspend this merchant?')) return;
    setError('');
    try {
      await api.unsuspendMerchant(token, merchantId);
      await loadMerchants();
    } catch (err: any) {
      setError(err.message ?? 'Failed to unsuspend merchant');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Merchants</h1>
        <p className="mt-1 text-sm text-[#697386]">All registered merchants on the platform ({total})</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Suspend Modal */}
      {suspendingId && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#df1b41]">Suspend Merchant</h3>
            <button onClick={() => { setSuspendingId(null); setSuspendReason(''); }} className="text-[#a3acb9] hover:text-[#425466]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-[#697386] mb-3">
            Suspending a merchant will block all their API access and disable their apps.
          </p>
          <Input
            label="Reason (optional)"
            placeholder="Reason for suspension..."
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => { setSuspendingId(null); setSuspendReason(''); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={actionLoading}>
              {actionLoading ? 'Suspending...' : 'Suspend Merchant'}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : merchants.length === 0 ? (
        <EmptyState
          title="No merchants"
          description="No merchants have registered yet"
          icon={Users}
        />
      ) : (
        <>
          <Table headers={['Email', 'Type', 'Name', 'Role', 'Apps', 'Status', 'Created', 'Actions']}>
            {merchants.map((m) => (
              <tr key={m.id} className="hover:bg-[#f6f8fa] transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/merchants/${m.id}`)}>
                <td className="px-4 py-3 text-sm font-medium text-[#635bff] hover:underline">{m.email}</td>
                <td className="px-4 py-3 text-sm text-[#425466]">{m.merchantType === 'INDIVIDUAL' ? 'Individual' : 'Business'}</td>
                <td className="px-4 py-3 text-sm text-[#425466]">{merchantDisplayName(m)}</td>
                <td className="px-4 py-3">
                  <Badge variant={m.role === 'ADMIN' ? 'destructive' : 'outline'}>
                    {m.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-[#425466]">{m._count?.apps ?? 0}</td>
                <td className="px-4 py-3">
                  {m.isSuspended ? (
                    <div>
                      <Badge variant="destructive">Suspended</Badge>
                      {m.suspendedReason && (
                        <p className="text-[10px] text-[#df1b41] mt-0.5 max-w-[200px] truncate" title={m.suspendedReason}>
                          {m.suspendedReason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#697386]">
                  {new Date(m.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/merchants/${m.id}`); }}
                      className="text-[#635bff] hover:text-[#5851ea] transition-colors"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {m.role !== 'ADMIN' && (
                      m.isSuspended ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUnsuspend(m.id); }}
                          className="text-[#0abf53] hover:text-[#097c43] transition-colors"
                          title="Unsuspend merchant"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSuspendingId(m.id); }}
                          className="text-[#a3acb9] hover:text-[#df1b41] transition-colors"
                          title="Suspend merchant"
                        >
                          <ShieldBan className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>

          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-sm text-[#425466] hover:bg-[#f0f2f5] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-[#697386]">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="rounded-lg px-3 py-1.5 text-sm text-[#425466] hover:bg-[#f0f2f5] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
