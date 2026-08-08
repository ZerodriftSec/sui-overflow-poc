'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Button, Card, EmptyState, Select, Spinner, Table } from '@/components/ui';
import { MessageSquare, RefreshCw } from 'lucide-react';

type FeedbackType = 'FEATURE_REQUEST' | 'CHAIN_REQUEST' | 'GENERAL_FEEDBACK';
type FeedbackStatus = 'NEW' | 'REVIEWED' | 'CLOSED';

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  email: string;
  message: string;
  source: string | null;
  status: FeedbackStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const statusVariant: Record<FeedbackStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  NEW: 'warning',
  REVIEWED: 'default',
  CLOSED: 'outline',
};

const typeLabel: Record<FeedbackType, string> = {
  FEATURE_REQUEST: 'Feature Request',
  CHAIN_REQUEST: 'Chain Request',
  GENERAL_FEEDBACK: 'Feedback',
};

export default function FeedbackPage() {
  const { token } = useAdminAuth();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [status, setStatus] = useState<string>('');
  const [type, setType] = useState<string>('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: '1', pageSize: '50' };
      if (status) params.status = status;
      if (type) params.type = type;

      const result = await api.getFeedbackSubmissions(token, params);
      setItems(result.items ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [token, status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const setSubmissionStatus = async (id: string, nextStatus: FeedbackStatus) => {
    if (!token) return;
    setUpdatingId(id);
    setError('');
    try {
      await api.updateFeedbackSubmissionStatus(token, id, nextStatus);
      await load();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update feedback status');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0a2540]">Feedback Inbox</h1>
          <p className="mt-1 text-sm text-[#697386]">Feature requests, chain requests, and product feedback from landing</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      ) : null}

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'NEW', label: 'New' },
              { value: 'REVIEWED', label: 'Reviewed' },
              { value: 'CLOSED', label: 'Closed' },
            ]}
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: '', label: 'All types' },
              { value: 'FEATURE_REQUEST', label: 'Feature Request' },
              { value: 'CHAIN_REQUEST', label: 'Chain Request' },
              { value: 'GENERAL_FEEDBACK', label: 'General Feedback' },
            ]}
          />
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No feedback yet"
          description="New submissions from landing will appear here."
        />
      ) : (
        <Table headers={['Created', 'Type', 'Email', 'Message', 'Status', 'Actions']}>
          {items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="px-4 py-3 text-xs text-[#697386] whitespace-nowrap">
                {new Date(item.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-sm text-[#425466] whitespace-nowrap">{typeLabel[item.type]}</td>
              <td className="px-4 py-3 text-sm text-[#0a2540]">{item.email}</td>
              <td className="px-4 py-3 text-sm text-[#425466] max-w-[420px] whitespace-pre-wrap break-words">{item.message}</td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={item.status === 'REVIEWED' || updatingId === item.id}
                    onClick={() => void setSubmissionStatus(item.id, 'REVIEWED')}
                  >
                    Mark Reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={item.status === 'CLOSED' || updatingId === item.id}
                    onClick={() => void setSubmissionStatus(item.id, 'CLOSED')}
                  >
                    Close
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
