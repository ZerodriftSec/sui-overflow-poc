'use client';

import { blockExplorerTxUrl } from '@noderails/common';
import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Table, Badge, Button, Select, Card, Spinner, EmptyState } from '@/components/ui';
import { AlertTriangle, CheckCircle, XCircle, ArrowRight, Copy, Check, ExternalLink } from 'lucide-react';

interface Dispute {
  id: string;
  paymentIntentId: string;
  reason: string;
  evidence: string | null;
  status: 'OPEN' | 'RESOLVING' | 'RESOLVED_MERCHANT' | 'RESOLVED_PAYER';
  deadline: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  paymentIntent: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    cryptoAmount: string | null;
    cryptoTokenKey: string | null;
    authorizationWalletAddress: string | null;
    customerEmail: string | null;
    customerName: string | null;
    appName: string;
    appId: string;
  };
}

interface DisputeDetail extends Dispute {
  customerProofUrl: string | null;
  merchantResponse: string | null;
  merchantProofUrl: string | null;
  paymentIntent: Dispute['paymentIntent'] & {
    authorizationChainId: number | null;
    capturedAt: string | null;
    timelockDuration: number;
    disputeStartDuration: number;
    transactions: Array<{
      id: string;
      txHash: string | null;
      status: string;
      type: string;
      createdAt: string;
    }>;
  };
}

const statusVariant: Record<string, 'destructive' | 'success' | 'warning' | 'default' | 'outline'> = {
  OPEN: 'destructive',
  RESOLVING: 'warning',
  RESOLVED_MERCHANT: 'success',
  RESOLVED_PAYER: 'warning',
};

const statusLabel: Record<string, string> = {
  OPEN: 'Open',
  RESOLVING: 'Resolving…',
  RESOLVED_MERCHANT: 'Merchant Won',
  RESOLVED_PAYER: 'Customer Won',
};

export default function DisputesPage() {
  const { token } = useAdminAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  // Detail / Resolve state
  const [selectedDispute, setSelectedDispute] = useState<DisputeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resolveWinner, setResolveWinner] = useState<'MERCHANT' | 'CUSTOMER'>('MERCHANT');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const loadDisputes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page: String(page) };
      if (statusFilter) params.status = statusFilter;
      const result = await api.getDisputes(token, params);
      setDisputes(result.items ?? result.disputes ?? []);
      setTotal(result.total ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter]);

  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  const handleViewDetail = async (disputeId: string) => {
    if (!token) return;
    setDetailLoading(true);
    setResolveError('');
    try {
      const detail = await api.getDispute(token, disputeId);
      setSelectedDispute(detail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!token || !selectedDispute) return;
    setResolving(true);
    setResolveError('');
    try {
      await api.resolveDispute(token, selectedDispute.id, resolveWinner);
      setSelectedDispute(null);
      await loadDisputes();
    } catch (err: any) {
      setResolveError(err.message);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0a2540]">Disputes</h1>
        <p className="mt-1 text-sm text-[#697386]">
          Review and resolve payment disputes ({total})
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          label=""
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'OPEN', label: 'Open' },
            { value: 'RESOLVED_MERCHANT', label: 'Resolved (Merchant)' },
            { value: 'RESOLVED_PAYER', label: 'Resolved (Customer)' },
          ]}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="w-52"
        />
      </div>

      {/* Dispute Detail Modal */}
      {selectedDispute && (
        <Card className="border-2 border-[#635bff]/20">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#0a2540]">Dispute Detail</h2>
              <p className="text-xs text-[#697386] mt-0.5 font-mono">{selectedDispute.id}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDispute(null)}>
              Close
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-[#697386]">Status</p>
              <Badge variant={statusVariant[selectedDispute.status] ?? 'default'}>
                {selectedDispute.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-[#697386]">Amount</p>
              <p className="text-sm font-semibold text-[#0a2540]">
                ${selectedDispute.paymentIntent.amount} {selectedDispute.paymentIntent.currency}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#697386]">Customer</p>
              <p className="text-sm text-[#0a2540]">
                {selectedDispute.paymentIntent.customerEmail ?? 'N/A'}
              </p>
              {selectedDispute.paymentIntent.customerName && (
                <p className="text-xs text-[#697386]">{selectedDispute.paymentIntent.customerName}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-[#697386]">Merchant App</p>
              <p className="text-sm text-[#0a2540]">{selectedDispute.paymentIntent.appName}</p>
            </div>
            <div>
              <p className="text-xs text-[#697386]">Payer Wallet</p>
              <p className="text-xs font-mono text-[#425466] break-all">
                {selectedDispute.paymentIntent.authorizationWalletAddress ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#697386]">Deadline</p>
              <p className="text-sm text-[#0a2540]">
                {new Date(selectedDispute.deadline).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mb-4 p-3 bg-[#f6f8fa] rounded-lg">
            <p className="text-xs text-[#697386] mb-1">Reason</p>
            <p className="text-sm text-[#0a2540]">{selectedDispute.reason}</p>

            {selectedDispute.customerProofUrl && (
              <a
                href={selectedDispute.customerProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-[#635bff] hover:underline"
              >
                <ArrowRight className="h-3 w-3" />
                Download Customer Proof
              </a>
            )}
          </div>

          {/* Merchant Response */}
          {selectedDispute.merchantResponse && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">Merchant Response</p>
              <p className="text-sm text-[#0a2540] whitespace-pre-wrap">{selectedDispute.merchantResponse}</p>
              {selectedDispute.merchantProofUrl && (
                <a
                  href={selectedDispute.merchantProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-[#635bff] hover:underline"
                >
                  <ArrowRight className="h-3 w-3" />
                  Download Merchant Proof
                </a>
              )}
            </div>
          )}

          {selectedDispute.paymentIntent.transactions?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-[#697386] mb-2">Resolution Transactions</p>
              {selectedDispute.paymentIntent.transactions.map((tx) => {
                const disputeTxExplorer =
                  selectedDispute.paymentIntent.authorizationChainId != null && tx.txHash
                    ? blockExplorerTxUrl(
                        selectedDispute.paymentIntent.authorizationChainId,
                        tx.txHash,
                      )
                    : null;
                return (
                <div key={tx.id} className="flex items-center gap-2 text-xs p-2 bg-[#f6f8fa] rounded mb-1">
                  <Badge variant={tx.status === 'CONFIRMED' ? 'success' : tx.status === 'FAILED' ? 'destructive' : 'outline'}>{tx.status}</Badge>
                  {tx.txHash ? (
                    <div className="flex items-center gap-1">
                      <button
                        className="font-mono text-[#425466] hover:text-[#0a2540] transition-colors flex items-center gap-1"
                        title={tx.txHash}
                        onClick={() => { navigator.clipboard.writeText(tx.txHash!); setCopiedTxHash(tx.txHash); setTimeout(() => setCopiedTxHash(null), 2000); }}
                      >
                        {tx.txHash.slice(0, 4)}...{tx.txHash.slice(-4)}
                        {copiedTxHash === tx.txHash ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40" />}
                      </button>
                      {disputeTxExplorer && (
                          <a
                            href={disputeTxExplorer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-0.5 rounded hover:bg-[#e3e8ee] transition-colors"
                            title="View on explorer"
                          >
                            <ExternalLink className="h-3 w-3 text-[#697386]" />
                          </a>
                        )}
                    </div>
                  ) : (
                    <span className="text-[#a3acb9]">pending</span>
                  )}
                  <span className="text-[#697386]">{new Date(tx.createdAt).toLocaleString()}</span>
                </div>
              );
              })}
              {selectedDispute.paymentIntent.transactions.some((tx) => tx.type === 'DISPUTE' && tx.status === 'FAILED') && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Resolution transaction failed on-chain. The dispute has been reverted to Open — you can retry below.</span>
                </div>
              )}
            </div>
          )}

          {/* Resolving state — tx submitted, waiting for confirmation */}
          {selectedDispute.status === 'RESOLVING' && (
            <div className="border-t border-[#e3e8ee] pt-4">
              <div className="flex items-center gap-2 text-sm text-[#697386]">
                <Spinner />
                <span>Resolution transaction submitted — waiting for on-chain confirmation…</span>
              </div>
            </div>
          )}

          {/* Resolve actions — for OPEN disputes (includes retry after tx failure) */}
          {selectedDispute.status === 'OPEN' && (
            <div className="border-t border-[#e3e8ee] pt-4">
              <p className="text-sm font-medium text-[#0a2540] mb-3">Resolve Dispute</p>

              {resolveError && (
                <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-600">
                  {resolveError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setResolveWinner('MERCHANT')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all text-left ${
                    resolveWinner === 'MERCHANT'
                      ? 'border-[#635bff] bg-[#f0f0ff]'
                      : 'border-[#e3e8ee] hover:border-[#d1d8e0]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`h-4 w-4 ${resolveWinner === 'MERCHANT' ? 'text-[#635bff]' : 'text-[#a3acb9]'}`} />
                    <span className="text-sm font-medium text-[#0a2540]">Merchant Wins</span>
                  </div>
                  <p className="text-xs text-[#697386] mt-1">Funds released to merchant</p>
                </button>

                <button
                  onClick={() => setResolveWinner('CUSTOMER')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all text-left ${
                    resolveWinner === 'CUSTOMER'
                      ? 'border-[#df1b41] bg-[#fdf2f4]'
                      : 'border-[#e3e8ee] hover:border-[#d1d8e0]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <XCircle className={`h-4 w-4 ${resolveWinner === 'CUSTOMER' ? 'text-[#df1b41]' : 'text-[#a3acb9]'}`} />
                    <span className="text-sm font-medium text-[#0a2540]">Customer Wins</span>
                  </div>
                  <p className="text-xs text-[#697386] mt-1">Funds refunded to customer</p>
                </button>
              </div>

              <Button
                variant={resolveWinner === 'CUSTOMER' ? 'destructive' : 'primary'}
                className="w-full mt-4"
                onClick={handleResolve}
                disabled={resolving}
              >
                {resolving ? 'Sending Transaction...' : (
                  <>
                    Resolve — {resolveWinner === 'MERCHANT' ? 'Merchant' : 'Customer'} Wins
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Already resolved */}
          {selectedDispute.status !== 'OPEN' && selectedDispute.status !== 'RESOLVING' && (
            <div className="border-t border-[#e3e8ee] pt-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={statusVariant[selectedDispute.status] ?? 'default'}>
                  {statusLabel[selectedDispute.status] ?? selectedDispute.status}
                </Badge>
                {selectedDispute.resolvedAt && (
                  <span className="text-[#697386]">
                    Resolved {new Date(selectedDispute.resolvedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Disputes Table */}
      {loading ? (
        <Spinner />
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No disputes"
          description={statusFilter ? 'No disputes match the selected filter.' : 'No disputes have been filed yet.'}
          icon={AlertTriangle}
        />
      ) : (
        <>
          <Table headers={['Payment', 'Customer', 'App', 'Amount', 'Status', 'Filed', 'Deadline', 'Actions']}>
            {disputes.map((d) => (
              <tr key={d.id} className="hover:bg-[#f6f8fa] transition-colors">
                <td className="px-4 py-3">
                  <button
                    className="flex items-center gap-1 font-mono text-xs text-[#425466] hover:text-[#0a2540] transition-colors cursor-pointer"
                    title={d.paymentIntentId}
                    onClick={() => { navigator.clipboard.writeText(d.paymentIntentId); setCopiedId(d.id); setTimeout(() => setCopiedId(null), 2000); }}
                  >
                    <span>{d.paymentIntentId.slice(0, 4)}...{d.paymentIntentId.slice(-4)}</span>
                    {copiedId === d.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40" />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-[#0a2540]">{d.paymentIntent.customerEmail ?? 'N/A'}</p>
                  {d.paymentIntent.customerName && (
                    <p className="text-xs text-[#697386]">{d.paymentIntent.customerName}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#425466]">{d.paymentIntent.appName}</td>
                <td className="px-4 py-3 text-sm font-medium text-[#0a2540]">
                  ${d.paymentIntent.amount} {d.paymentIntent.currency}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant[d.status] ?? 'default'}>{statusLabel[d.status] ?? d.status}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-[#697386]">
                  {new Date(d.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-xs text-[#697386]">
                  {new Date(d.deadline).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleViewDetail(d.id)}
                    disabled={detailLoading}
                  >
                    {d.status === 'OPEN' ? 'Review' : d.status === 'RESOLVING' ? 'View' : 'View'}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-sm text-[#697386]">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
