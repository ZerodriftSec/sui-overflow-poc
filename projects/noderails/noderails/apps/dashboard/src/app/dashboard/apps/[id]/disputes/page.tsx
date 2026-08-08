'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Badge, Table, Button, Card, Spinner, EmptyState, Textarea, Select } from '@/components/ui';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CopyableId } from '@/components/filter-nav';
import { AlertTriangle, FileText, ExternalLink, CheckCircle, Clock, X } from 'lucide-react';

const statusConfig: Record<string, { variant: 'destructive' | 'success' | 'warning' | 'default' | 'outline'; label: string }> = {
  OPEN: { variant: 'destructive', label: 'Open' },
  RESOLVED_MERCHANT: { variant: 'success', label: 'Merchant Won' },
  RESOLVED_PAYER: { variant: 'warning', label: 'Customer Won' },
};

export default function AppDisputesPage() {
  const { id: appId } = useParams<{ id: string }>();
  const { token } = useAuth();

  const [disputes, setDisputes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [responding, setResponding] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [respondError, setRespondError] = useState('');
  const [respondSuccess, setRespondSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDisputes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, any> = { appId, page };
      if (statusFilter) params.status = statusFilter;
      const result = await api.getMerchantDisputes(token, params);
      setDisputes(result.items ?? result.disputes ?? []);
      setTotal(result.total ?? 0);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [token, appId, page, statusFilter]);

  useEffect(() => { loadDisputes(); }, [loadDisputes]);

  const openDetail = useCallback(async (disputeId: string) => {
    if (!token) return;
    setDetailLoading(true);
    setRespondSuccess(false);
    setResponseText('');
    setProofFile(null);
    setRespondError('');
    try {
      const detail = await api.getMerchantDispute(token, disputeId);
      setSelectedDispute(detail);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load dispute');
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedDispute) return;
    if (responseText.trim().length < 10) {
      setRespondError('Response must be at least 10 characters.');
      return;
    }
    setResponding(true);
    setRespondError('');
    try {
      await api.respondToDispute(token, selectedDispute.id, responseText.trim(), proofFile ?? undefined);
      setRespondSuccess(true);
      const updated = await api.getMerchantDispute(token, selectedDispute.id);
      setSelectedDispute(updated);
      await loadDisputes();
    } catch (err: any) {
      setRespondError(err.message ?? 'Failed to submit response');
    } finally {
      setResponding(false);
    }
  };

  const isAlreadyResponded = !!selectedDispute?.merchantResponse;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Payment disputes filed by your customers ({total})
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Select
          label=""
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'OPEN', label: 'Open' },
            { value: 'RESOLVED_MERCHANT', label: 'Merchant Won' },
            { value: 'RESOLVED_PAYER', label: 'Customer Won' },
          ]}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-48"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No disputes"
          description="No disputes have been filed against your payments yet."
          icon={AlertTriangle}
        />
      ) : (
        <>
          <Table headers={['Dispute ID', 'Status', 'Amount', 'Customer', 'Responded', 'Deadline', '']}>
            {disputes.map((d: any) => (
              <tr key={d.id} className="hover:bg-muted transition-colors">
                <td className="px-4 py-3">
                  <CopyableId value={d.id} chars={8} />
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusConfig[d.status]?.variant ?? 'default'}>
                    {statusConfig[d.status]?.label ?? d.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-sm">
                  {d.paymentIntent.amount} {d.paymentIntent.currency}
                </td>
                <td className="px-4 py-3 text-sm text-secondary-foreground">
                  {d.paymentIntent.customerEmail ?? 'N/A'}
                </td>
                <td className="px-4 py-3">
                  {d.merchantResponse ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(d.deadline).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(d.id)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </Table>

          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="rounded-lg px-3 py-1.5 text-sm text-secondary-foreground hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedDispute} onOpenChange={(open) => { if (!open) setSelectedDispute(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner />
            </div>
          ) : selectedDispute ? (
            <div className="space-y-6 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Dispute Detail</h2>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedDispute.id}</p>
                </div>
                <Badge variant={statusConfig[selectedDispute.status]?.variant ?? 'default'}>
                  {statusConfig[selectedDispute.status]?.label ?? selectedDispute.status}
                </Badge>
              </div>

              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Payment</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold">
                      {selectedDispute.paymentIntent.amount} {selectedDispute.paymentIntent.currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p>{selectedDispute.paymentIntent.customerEmail ?? 'N/A'}</p>
                    {selectedDispute.paymentIntent.customerName && (
                      <p className="text-xs text-muted-foreground">{selectedDispute.paymentIntent.customerName}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deadline</p>
                    <p>{new Date(selectedDispute.deadline).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Filed</p>
                    <p>{new Date(selectedDispute.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2">Customer Reason</h3>
                <p className="text-sm text-secondary-foreground">{selectedDispute.reason}</p>

                {selectedDispute.customerProofUrl && (
                  <a
                    href={selectedDispute.customerProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Download Customer Proof
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Card>

              {isAlreadyResponded && (
                <Card className="p-4 bg-muted/40">
                  <h3 className="text-sm font-semibold mb-2">Your Response</h3>
                  <p className="text-sm text-secondary-foreground whitespace-pre-wrap">{selectedDispute.merchantResponse}</p>
                  {selectedDispute.merchantProofUrl && (
                    <a
                      href={selectedDispute.merchantProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-xs text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Download Your Proof
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </Card>
              )}

              {selectedDispute.status === 'OPEN' && !isAlreadyResponded && (
                <form onSubmit={handleRespond} className="space-y-4">
                  <h3 className="text-sm font-semibold">Submit Your Response</h3>

                  {respondSuccess && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
                      Response submitted successfully.
                    </div>
                  )}

                  {respondError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                      {respondError}
                    </div>
                  )}

                  <Textarea
                    label="Response *"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Explain your position regarding this dispute..."
                    rows={5}
                    required
                  />

                  <div>
                    <label className="block text-[13px] font-medium text-secondary-foreground mb-1.5">
                      Proof Document
                      <span className="text-muted-foreground font-normal ml-1">(optional, PDF, max 10 MB)</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-secondary-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-medium file:bg-card file:text-foreground hover:file:bg-muted cursor-pointer"
                    />
                    {proofFile && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{proofFile.name}</span>
                        <button
                          type="button"
                          onClick={() => { setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="text-muted-foreground hover:text-secondary-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={responding}>
                    {responding ? 'Submitting...' : 'Submit Response'}
                  </Button>
                </form>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
