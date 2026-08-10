'use client';

import { blockExplorerTxUrl } from '@noderails/common';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, StatCard, Badge, Button, Input, Spinner, EmptyState, Table } from '@/components/ui';
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  ShieldAlert,
  Shield,
  Clock,
  Zap,
  FileText,
  RefreshCw,
  Save,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ShieldBan,
  ShieldCheck,
  Percent,
  Undo2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface MerchantApp {
  id: string;
  name: string;
  environment: string;
  receivingWallet: string | null;
  createdAt: string;
  _count: { paymentIntents: number; subscriptions: number; invoices: number };
}

interface MerchantDetail {
  id: string;
  email: string;
  merchantType?: 'BUSINESS' | 'INDIVIDUAL';
  businessName?: string | null;
  individualName?: string | null;
  orgName: string | null;
  role: string;
  isSuspended: boolean;
  suspendedReason: string | null;
  emailVerified: boolean;
  disputeStartSeconds: number | null;
  settlementSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  apps: MerchantApp[];
  stats: {
    totalPayments: number;
    capturedPayments: number;
    settledPayments: number;
    disputedPayments: number;
    refundedPayments: number;
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalInvoices: number;
    paidInvoices: number;
    capturedVolume: string;
    settledVolume: string;
  };
}

interface TimelockConfig {
  disputeStartSeconds: number;
  settlementSeconds: number;
}

type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days';

const UNIT_MULTIPLIERS: Record<TimeUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return '0';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  const days = seconds / 86400;
  if (days === Math.floor(days)) return `${days}d`;
  return `${days.toFixed(1)}d`;
}

function bestUnit(seconds: number): TimeUnit {
  if (seconds === 0) return 'days';
  if (seconds < 60) return 'seconds';
  if (seconds < 3600) return 'minutes';
  if (seconds < 86400) return 'hours';
  return 'days';
}

function toUnitValue(seconds: number, unit: TimeUnit): string {
  const val = seconds / UNIT_MULTIPLIERS[unit];
  if (val === Math.floor(val)) return `${val}`;
  return val.toFixed(2).replace(/\.?0+$/, '');
}

function fromUnitValue(value: string, unit: TimeUnit): number {
  return Math.round(parseFloat(value || '0') * UNIT_MULTIPLIERS[unit]);
}

// ── Timelock Timeline ──

function TimelockTimeline({ disputeStartSeconds, settlementSeconds }: TimelockConfig) {
  const disputeStartDays = disputeStartSeconds / 86400;
  const settlementDays = settlementSeconds / 86400;
  const disputeWindowDays = settlementDays - disputeStartDays;

  const total = settlementDays;
  const preDisputePct = total > 0 ? (disputeStartDays / total) * 100 : 0;
  const disputeWindowPct = total > 0 ? (disputeWindowDays / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="flex justify-between text-[10px] font-medium text-[#697386] mb-1.5">
          <span>Capture</span>
          {disputeStartDays > 0 && (
            <span style={{ left: `${preDisputePct}%`, position: 'absolute' }}>Dispute Opens</span>
          )}
          <span>Settlement</span>
        </div>
        <div className="flex h-8 rounded-lg overflow-hidden border border-[#e3e8ee]">
          {preDisputePct > 0 && (
            <div
              className="bg-[#edfcf2] flex items-center justify-center text-[10px] font-medium text-[#097c43] border-r border-[#b8ebc9]"
              style={{ width: `${preDisputePct}%` }}
            >
              {disputeStartDays >= 0.01 ? `${formatDuration(disputeStartSeconds)} grace` : ''}
            </div>
          )}
          {disputeWindowPct > 0 && (
            <div
              className="bg-[#fef9ee] flex items-center justify-center text-[10px] font-medium text-[#9e6c00]"
              style={{ width: `${disputeWindowPct}%` }}
            >
              {disputeWindowDays >= 0.01 ? `${formatDuration(disputeWindowDays * 86400)} dispute` : ''}
            </div>
          )}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-[#a3acb9]">
          <span>0</span>
          <span>{formatDuration(settlementSeconds)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Timelock Config Section ──

function TimelockConfigSection({ merchantId }: { merchantId: string }) {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasOverride, setHasOverride] = useState(false);
  const [effective, setEffective] = useState<TimelockConfig>({ disputeStartSeconds: 86400, settlementSeconds: 604800 });
  const [disputeValue, setDisputeValue] = useState('1');
  const [disputeUnit, setDisputeUnit] = useState<TimeUnit>('days');
  const [settlementValue, setSettlementValue] = useState('7');
  const [settlementUnit, setSettlementUnit] = useState<TimeUnit>('days');

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getMerchantTimelockConfig(token, merchantId);
      setEffective(result.effective);
      setHasOverride(!!result.override);
      const source = result.override ?? result.effective;
      const dUnit = bestUnit(source.disputeStartSeconds);
      const sUnit = bestUnit(source.settlementSeconds);
      setDisputeUnit(dUnit);
      setSettlementUnit(sUnit);
      setDisputeValue(toUnitValue(source.disputeStartSeconds, dUnit));
      setSettlementValue(toUnitValue(source.settlementSeconds, sUnit));
    } catch {
      setError('Failed to load timelock config');
    } finally {
      setLoading(false);
    }
  }, [token, merchantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const disputeStart = fromUnitValue(disputeValue, disputeUnit);
      const settlement = fromUnitValue(settlementValue, settlementUnit);
      if (settlement <= disputeStart) {
        setError('Settlement must be greater than dispute start');
        return;
      }
      await api.setMerchantTimelockConfig(token, merchantId, {
        disputeStartSeconds: disputeStart,
        settlementSeconds: settlement,
      });
      setSuccessMsg('Merchant timelock override saved');
      await loadConfig();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!token || !confirm('Remove this merchant\'s timelock override? They will use platform defaults.')) return;
    setRemoving(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.removeMerchantTimelockConfig(token, merchantId);
      setSuccessMsg('Override removed — using platform defaults');
      await loadConfig();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove override');
    } finally {
      setRemoving(false);
    }
  };

  const previewDisputeStart = fromUnitValue(disputeValue || '0', disputeUnit);
  const previewSettlement = fromUnitValue(settlementValue || '0', settlementUnit);
  const isValid = previewSettlement > previewDisputeStart && previewSettlement > 0;

  if (loading) return <Spinner />;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#635bff]" />
          <h3 className="text-sm font-semibold text-[#0a2540]">Timelock Configuration</h3>
        </div>
        <Badge variant={hasOverride ? 'warning' : 'outline'}>
          {hasOverride ? 'Custom Override' : 'Platform Defaults'}
        </Badge>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-xs text-green-700 mb-4 flex items-center gap-2">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Timeline Preview */}
      {isValid && (
        <div className="mb-5">
          <TimelockTimeline
            disputeStartSeconds={previewDisputeStart}
            settlementSeconds={previewSettlement}
          />
        </div>
      )}

      {/* Current effective values */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg bg-[#f6f8fa] border border-[#e3e8ee] p-3">
          <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wide">Effective Dispute Start</p>
          <p className="text-lg font-semibold text-[#0a2540] mt-0.5">{formatDuration(effective.disputeStartSeconds)}</p>
        </div>
        <div className="rounded-lg bg-[#f6f8fa] border border-[#e3e8ee] p-3">
          <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wide">Effective Settlement</p>
          <p className="text-lg font-semibold text-[#0a2540] mt-0.5">{formatDuration(effective.settlementSeconds)}</p>
        </div>
      </div>

      {/* Override form */}
      <div className="border-t border-[#e3e8ee] pt-4">
        <p className="text-xs font-medium text-[#425466] mb-3">
          Set custom timelock values for this merchant (overrides platform defaults):
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Dispute Start</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={disputeValue}
                onChange={(e) => setDisputeValue(e.target.value)}
                className="flex-1"
              />
              <select
                className="rounded-lg border border-[#e3e8ee] bg-white px-2.5 py-2 text-sm text-[#0a2540] focus:outline-none focus:ring-2 focus:ring-[#635bff]/30"
                value={disputeUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as TimeUnit;
                  const secs = fromUnitValue(disputeValue, disputeUnit);
                  setDisputeUnit(newUnit);
                  setDisputeValue(toUnitValue(secs, newUnit));
                }}
              >
                <option value="seconds">seconds</option>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <p className="text-[10px] text-[#a3acb9]">{formatDuration(previewDisputeStart)}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Settlement</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                step="1"
                value={settlementValue}
                onChange={(e) => setSettlementValue(e.target.value)}
                className="flex-1"
              />
              <select
                className="rounded-lg border border-[#e3e8ee] bg-white px-2.5 py-2 text-sm text-[#0a2540] focus:outline-none focus:ring-2 focus:ring-[#635bff]/30"
                value={settlementUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as TimeUnit;
                  const secs = fromUnitValue(settlementValue, settlementUnit);
                  setSettlementUnit(newUnit);
                  setSettlementValue(toUnitValue(secs, newUnit));
                }}
              >
                <option value="seconds">seconds</option>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <p className="text-[10px] text-[#a3acb9]">{formatDuration(previewSettlement)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !isValid} size="sm">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Set Override'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => {
            const dUnit = bestUnit(effective.disputeStartSeconds);
            const sUnit = bestUnit(effective.settlementSeconds);
            setDisputeUnit(dUnit);
            setSettlementUnit(sUnit);
            setDisputeValue(toUnitValue(effective.disputeStartSeconds, dUnit));
            setSettlementValue(toUnitValue(effective.settlementSeconds, sUnit));
          }}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          {hasOverride && (
            <Button variant="destructive" size="sm" onClick={handleRemove} disabled={removing}>
              <Trash2 className="h-3.5 w-3.5" />
              {removing ? 'Removing...' : 'Remove Override'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Fee Config Section ──

const MAX_FEE_BPS = 1000;

function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  if (pct === Math.floor(pct)) return `${pct}%`;
  return `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;
}

function FeeConfigSection({ merchantId }: { merchantId: string }) {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasOverride, setHasOverride] = useState(false);
  const [effective, setEffective] = useState(200);
  const [feeBps, setFeeBps] = useState(200);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getMerchantFeeConfig(token, merchantId);
      setEffective(result.effective);
      setHasOverride(!!result.override);
      setFeeBps(result.override?.platformFeeBps ?? result.effective);
    } catch {
      setError('Failed to load fee config');
    } finally {
      setLoading(false);
    }
  }, [token, merchantId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      if (feeBps < 0 || feeBps > MAX_FEE_BPS) {
        setError(`Fee must be between 0 and ${MAX_FEE_BPS} bps`);
        return;
      }
      await api.setMerchantFeeConfig(token, merchantId, { feeBps });
      setSuccessMsg('Merchant fee override saved');
      await loadConfig();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!token || !confirm('Remove this merchant\'s fee override? They will use platform defaults.')) return;
    setRemoving(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.removeMerchantFeeConfig(token, merchantId);
      setSuccessMsg('Override removed — using platform defaults');
      await loadConfig();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove override');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-[#635bff]" />
          <h3 className="text-sm font-semibold text-[#0a2540]">Platform Fee</h3>
        </div>
        <Badge variant={hasOverride ? 'warning' : 'outline'}>
          {hasOverride ? 'Custom Override' : 'Platform Default'}
        </Badge>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-xs text-green-700 mb-4 flex items-center gap-2">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Current effective value */}
      <div className="rounded-lg bg-[#f6f8fa] border border-[#e3e8ee] p-3 mb-5">
        <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wide">Effective Fee</p>
        <p className="text-lg font-semibold text-[#0a2540] mt-0.5">
          {bpsToPercent(effective)} <span className="text-sm font-normal text-[#697386]">({effective} bps)</span>
        </p>
      </div>

      {/* Override form */}
      <div className="border-t border-[#e3e8ee] pt-4">
        <p className="text-xs font-medium text-[#425466] mb-3">
          Set a custom platform fee for this merchant (overrides platform default):
        </p>
        <div className="space-y-3 mb-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Fee (basis points)</label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                min="0"
                max={MAX_FEE_BPS}
                step="1"
                value={feeBps}
                onChange={(e) => setFeeBps(parseInt(e.target.value) || 0)}
                className="flex-1"
              />
              <span className="text-sm font-medium text-[#697386] whitespace-nowrap">
                = {bpsToPercent(feeBps)}
              </span>
            </div>
            <p className="text-[10px] text-[#a3acb9]">0 – {MAX_FEE_BPS} bps (0% – {bpsToPercent(MAX_FEE_BPS)})</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 100, 150, 200, 250, 300, 500].map((bps) => (
              <button
                key={bps}
                onClick={() => setFeeBps(bps)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  feeBps === bps
                    ? 'bg-[#635bff] text-white'
                    : 'bg-[#f6f8fa] text-[#425466] hover:bg-[#e3e8ee]'
                }`}
              >
                {bpsToPercent(bps)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Set Override'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setFeeBps(effective)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          {hasOverride && (
            <Button variant="destructive" size="sm" onClick={handleRemove} disabled={removing}>
              <Trash2 className="h-3.5 w-3.5" />
              {removing ? 'Removing...' : 'Remove Override'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Refund History Section ──

function RefundHistorySection({ merchantId }: { merchantId: string }) {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  const loadRefunds = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getMerchantRefunds(token, merchantId, {
        page: String(page),
        pageSize: '10',
      });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, merchantId, page]);

  useEffect(() => { loadRefunds(); }, [loadRefunds]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const truncateHash = (h: string) => `${h.slice(0, 4)}...${h.slice(-4)}`;

  if (loading) return <Spinner />;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Undo2 className="h-5 w-5 text-[#df1b41]" />
          <h3 className="text-sm font-semibold text-[#0a2540]">
            Refund History {data?.total != null && `(${data.total})`}
          </h3>
        </div>
        <button
          onClick={loadRefunds}
          className="p-1.5 rounded-lg hover:bg-[#f6f8fa] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5 text-[#697386]" />
        </button>
      </div>

      {!data || data.items?.length === 0 ? (
        <p className="text-sm text-[#697386] text-center py-4">No refunds yet</p>
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((refund: any) => {
              const chainId = refund.authorizationChainId as number | null | undefined;
              const refundTx = refund.transactions?.[0];
              const txHash = refund.refundTxHash || refundTx?.txHash;
              const txExplorerHref =
                chainId != null && txHash ? blockExplorerTxUrl(chainId, txHash) : null;

              return (
                <div key={refund.id} className="rounded-lg border border-[#e3e8ee] p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#0a2540]">
                        ${Number(refund.amount).toFixed(2)}
                      </span>
                      <span className="text-xs text-[#a3acb9]">{refund.currency}</span>
                      <Badge variant="destructive">Refunded</Badge>
                    </div>
                    <span className="text-[10px] text-[#a3acb9]">
                      {refund.refundedAt ? formatDate(refund.refundedAt) : formatDate(refund.createdAt)}
                    </span>
                  </div>

                  {/* Reason */}
                  {refund.refundReason && (
                    <div className="mb-2">
                      <span className="text-[10px] font-medium text-[#697386] uppercase tracking-wide">Reason</span>
                      <p className="text-xs text-[#425466] mt-0.5">{refund.refundReason}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {/* Payment ID */}
                    <div>
                      <span className="text-[#697386]">Payment: </span>
                      <span className="font-mono text-[#0a2540]">{refund.id.slice(0, 4)}...{refund.id.slice(-4)}</span>
                    </div>
                    {/* App */}
                    <div>
                      <span className="text-[#697386]">App: </span>
                      <span className="text-[#0a2540]">{refund.app?.name ?? '—'}</span>
                    </div>
                    {/* Customer */}
                    {refund.customerAccount && (
                      <div>
                        <span className="text-[#697386]">Customer: </span>
                        <span className="text-[#0a2540]">{refund.customerAccount.email ?? refund.customerAccount.name ?? '—'}</span>
                      </div>
                    )}
                    {/* Refund Time */}
                    {refund.refundedAt && (
                      <div>
                        <span className="text-[#697386]">Time: </span>
                        <span className="text-[#0a2540]">{formatTime(refund.refundedAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tx Hash */}
                  {txHash && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[10px] text-[#697386]">Tx:</span>
                      <button
                        className="font-mono text-[10px] text-[#0a2540] hover:text-[#635bff] transition-colors flex items-center gap-1"
                        title={txHash}
                        onClick={() => {
                          navigator.clipboard.writeText(txHash);
                          setCopiedTxHash(txHash);
                          setTimeout(() => setCopiedTxHash(null), 2000);
                        }}
                      >
                        {truncateHash(txHash)}
                        {copiedTxHash === txHash ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-40" />}
                      </button>
                      {txExplorerHref && (
                        <a
                          href={txExplorerHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-0.5 rounded hover:bg-[#e3e8ee] transition-colors"
                          title="View on explorer"
                        >
                          <ExternalLink className="h-3 w-3 text-[#697386]" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-[10px] text-[#a3acb9]">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Prev
                </Button>
                <Button variant="secondary" size="sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Main Page ──

export default function MerchantDetailPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const { token } = useAdminAuth();
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMerchant = useCallback(async () => {
    if (!token || !merchantId) return;
    setLoading(true);
    try {
      const result = await api.getMerchantDetail(token, merchantId);
      setMerchant(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load merchant');
    } finally {
      setLoading(false);
    }
  }, [token, merchantId]);

  useEffect(() => { loadMerchant(); }, [loadMerchant]);

  const handleSuspend = async () => {
    if (!token || !merchantId) return;
    const reason = prompt('Reason for suspension (optional):');
    try {
      await api.suspendMerchant(token, merchantId, reason || undefined);
      await loadMerchant();
    } catch (err: any) {
      setError(err.message ?? 'Failed to suspend merchant');
    }
  };

  const handleUnsuspend = async () => {
    if (!token || !merchantId || !confirm('Unsuspend this merchant?')) return;
    try {
      await api.unsuspendMerchant(token, merchantId);
      await loadMerchant();
    } catch (err: any) {
      setError(err.message ?? 'Failed to unsuspend merchant');
    }
  };

  if (loading) return <Spinner />;

  if (error || !merchant) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/dashboard/merchants')} className="flex items-center gap-1.5 text-sm text-[#635bff] hover:text-[#5851ea]">
          <ArrowLeft className="h-4 w-4" /> Back to Merchants
        </button>
        <EmptyState title="Merchant not found" description={error || 'Could not load merchant details'} icon={AlertTriangle} />
      </div>
    );
  }

  const { stats } = merchant;
  const displayName =
    merchant.merchantType === 'INDIVIDUAL'
      ? merchant.individualName ?? merchant.orgName
      : merchant.businessName ?? merchant.orgName;
  const formatVolume = (v: string) => {
    const num = parseFloat(v);
    if (num === 0) return '$0';
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/dashboard/merchants')} className="flex items-center gap-1.5 text-sm text-[#635bff] hover:text-[#5851ea] mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Merchants
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#0a2540]">{merchant.email}</h1>
            {merchant.isSuspended ? (
              <Badge variant="destructive">Suspended</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}
            <Badge variant={merchant.role === 'ADMIN' ? 'destructive' : 'outline'}>{merchant.role}</Badge>
            <Badge variant="outline">{merchant.merchantType === 'INDIVIDUAL' ? 'Individual' : 'Business'}</Badge>
          </div>
          {displayName && (
            <p className="text-sm text-[#697386] mt-0.5">{displayName}</p>
          )}
          <p className="text-xs text-[#a3acb9] mt-1">
            Joined {new Date(merchant.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {merchant.emailVerified ? ' · Email verified' : ' · Email not verified'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadMerchant}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {merchant.role !== 'ADMIN' && (
            merchant.isSuspended ? (
              <Button variant="secondary" size="sm" onClick={handleUnsuspend}>
                <ShieldCheck className="h-3.5 w-3.5" /> Unsuspend
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={handleSuspend}>
                <ShieldBan className="h-3.5 w-3.5" /> Suspend
              </Button>
            )
          )}
        </div>
      </div>

      {merchant.isSuspended && merchant.suspendedReason && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600 flex items-center gap-2">
          <ShieldBan className="h-4 w-4 shrink-0" />
          <span><strong>Suspension reason:</strong> {merchant.suspendedReason}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Payments" value={stats.totalPayments.toLocaleString()} subtitle={`${stats.capturedPayments} captured`} icon={CreditCard} />
        <StatCard title="Captured Volume" value={formatVolume(stats.capturedVolume)} subtitle="In escrow + settled" icon={DollarSign} />
        <StatCard title="Settled Volume" value={formatVolume(stats.settledVolume)} subtitle={`${stats.settledPayments} payments`} icon={DollarSign} />
        <StatCard title="Disputes" value={stats.disputedPayments.toString()} subtitle={`${stats.refundedPayments} refunded`} icon={ShieldAlert} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Apps" value={merchant.apps.length.toString()} icon={Zap} />
        <StatCard title="Subscriptions" value={stats.totalSubscriptions.toString()} subtitle={`${stats.activeSubscriptions} active`} icon={RefreshCw} />
        <StatCard title="Invoices" value={stats.totalInvoices.toString()} subtitle={`${stats.paidInvoices} paid`} icon={FileText} />
        <StatCard title="Dispute Rate" value={stats.totalPayments > 0 ? `${((stats.disputedPayments / stats.totalPayments) * 100).toFixed(1)}%` : '0%'} icon={Shield} />
      </div>

      {/* Timelock Config + Fee Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timelock Config */}
        <TimelockConfigSection merchantId={merchant.id} />

        {/* Fee Config */}
        <FeeConfigSection merchantId={merchant.id} />
      </div>

      {/* Refund History */}
      <RefundHistorySection merchantId={merchant.id} />

      {/* Apps List */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-[#635bff]" />
            <h3 className="text-sm font-semibold text-[#0a2540]">Apps ({merchant.apps.length})</h3>
          </div>

          {merchant.apps.length === 0 ? (
            <p className="text-sm text-[#697386]">No apps created yet</p>
          ) : (
            <div className="space-y-3">
              {merchant.apps.map((app) => (
                <div key={app.id} className="rounded-lg border border-[#e3e8ee] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#0a2540]">{app.name}</span>
                    <Badge variant={app.environment === 'LIVE' ? 'success' : 'outline'}>
                      {app.environment}
                    </Badge>
                  </div>
                  {app.receivingWallet && (
                    <p className="text-[10px] text-[#a3acb9] font-mono mb-1.5 truncate" title={app.receivingWallet}>
                      {app.receivingWallet}
                    </p>
                  )}
                  <div className="flex gap-4 text-[11px] text-[#697386]">
                    <span>{app._count.paymentIntents} payments</span>
                    <span>{app._count.subscriptions} subs</span>
                    <span>{app._count.invoices} invoices</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
