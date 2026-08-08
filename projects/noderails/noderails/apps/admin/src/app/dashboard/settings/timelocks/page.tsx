'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Spinner, Badge } from '@/components/ui';
import { Clock, Shield, AlertTriangle, CheckCircle, Save, RotateCcw } from 'lucide-react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';

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

// Keep legacy helper for timeline markers  
function secondsToDays(seconds: number): string {
  const days = seconds / 86400;
  if (days === Math.floor(days)) return `${days}`;
  return days.toFixed(1);
}

// ── Visual Timeline Component ──

function TimelockTimeline({
  disputeStartSeconds,
  settlementSeconds,
}: TimelockConfig) {
  const disputeStartDays = disputeStartSeconds / 86400;
  const settlementDays = settlementSeconds / 86400;
  const disputeWindowDays = settlementDays - disputeStartDays;

  // Calculate proportional widths
  const total = settlementDays;
  const preDisputePct = total > 0 ? (disputeStartDays / total) * 100 : 0;
  const disputeWindowPct = total > 0 ? (disputeWindowDays / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-[#0a2540]">Payment Lifecycle Timeline</h4>

      {/* Timeline bar */}
      <div className="relative">
        {/* Labels above */}
        <div className="flex justify-between text-[10px] font-medium text-[#697386] mb-2">
          <span>Capture</span>
          {disputeStartDays > 0 && (
            <span style={{ left: `${preDisputePct}%`, position: 'absolute' }}>
              Dispute Opens
            </span>
          )}
          <span>Settlement</span>
        </div>

        {/* The bar */}
        <div className="flex h-10 rounded-lg overflow-hidden border border-[#e3e8ee]">
          {/* Pre-dispute (safe zone) */}
          {preDisputePct > 0 && (
            <div
              className="bg-[#edfcf2] flex items-center justify-center text-[10px] font-medium text-[#097c43] border-r border-[#b8ebc9]"
              style={{ width: `${preDisputePct}%` }}
            >
              {disputeStartDays >= 0.5 ? `${formatDuration(disputeStartSeconds)} grace` : ''}
            </div>
          )}
          {/* Dispute window */}
          {disputeWindowPct > 0 && (
            <div
              className="bg-[#fef9ee] flex items-center justify-center text-[10px] font-medium text-[#9e6c00]"
              style={{ width: `${disputeWindowPct}%` }}
            >
              {disputeWindowDays >= 0.5 ? `${formatDuration(disputeWindowDays * 86400)} dispute window` : ''}
            </div>
          )}
        </div>

        {/* Markers */}
        <div className="flex justify-between mt-2 text-[10px] text-[#a3acb9]">
          <span>0</span>
          {disputeStartDays > 0 && disputeStartDays < settlementDays && (
            <span style={{ left: `${preDisputePct}%`, position: 'absolute' }}>
              {formatDuration(disputeStartSeconds)}
            </span>
          )}
          <span>{formatDuration(settlementSeconds)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-[#edfcf2] border border-[#b8ebc9]" />
          <span className="text-[11px] text-[#425466]">No disputes allowed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-[#fef9ee] border border-[#fde68a]" />
          <span className="text-[11px] text-[#425466]">Dispute window (payer can dispute)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-[#f0f0ff] border border-[#d4d2ff]" />
          <span className="text-[11px] text-[#425466]">Settlement (funds released to merchant)</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        <div className="rounded-lg bg-[#f6f8fa] p-3 text-center">
          <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wider">Grace Period</p>
          <p className="text-lg font-semibold text-[#0a2540] mt-0.5">
            {formatDuration(disputeStartSeconds)}
          </p>
        </div>
        <div className="rounded-lg bg-[#f6f8fa] p-3 text-center">
          <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wider">Dispute Window</p>
          <p className="text-lg font-semibold text-[#0a2540] mt-0.5">
            {formatDuration(settlementSeconds - disputeStartSeconds)}
          </p>
        </div>
        <div className="rounded-lg bg-[#f6f8fa] p-3 text-center">
          <p className="text-[10px] font-medium text-[#697386] uppercase tracking-wider">Settlement At</p>
          <p className="text-lg font-semibold text-[#0a2540] mt-0.5">
            {formatDuration(settlementSeconds)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Validation Warnings ──

function ConfigWarnings({ disputeStartSeconds, settlementSeconds }: TimelockConfig) {
  const warnings: string[] = [];

  if (settlementSeconds <= disputeStartSeconds) {
    warnings.push('Settlement must be after dispute start — payers would have no dispute window.');
  }
  if (disputeStartSeconds === 0) {
    warnings.push('Dispute window opens immediately after capture — consider adding a grace period.');
  }
  if (settlementSeconds < 86400 && settlementSeconds > 600) {
    warnings.push('Settlement under 1 day may not give enough time for dispute resolution.');
  }
  if (settlementSeconds > 2592000) {
    warnings.push('Settlement over 30 days may delay merchant payouts excessively.');
  }
  const disputeWindow = settlementSeconds - disputeStartSeconds;
  if (disputeWindow < 86400 && disputeWindow > 0) {
    warnings.push('Dispute window is less than 1 day — payers may not have enough time to dispute.');
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-[#fef9ee] px-3 py-2 text-xs text-[#9e6c00]">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function TimelockSettingsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Platform config
  const [disputeStartValue, setDisputeStartValue] = useState('1');
  const [disputeStartUnit, setDisputeStartUnit] = useState<TimeUnit>('days');
  const [settlementValue, setSettlementValue] = useState('7');
  const [settlementUnit, setSettlementUnit] = useState<TimeUnit>('days');

  // Live preview values (in seconds)
  const previewDisputeStart = fromUnitValue(disputeStartValue || '0', disputeStartUnit);
  const previewSettlement = fromUnitValue(settlementValue || '1', settlementUnit);

  const loadConfig = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const config = await api.getTimelockConfig(token);
      const dUnit = bestUnit(config.disputeStartSeconds);
      const sUnit = bestUnit(config.settlementSeconds);
      setDisputeStartUnit(dUnit);
      setSettlementUnit(sUnit);
      setDisputeStartValue(toUnitValue(config.disputeStartSeconds, dUnit));
      setSettlementValue(toUnitValue(config.settlementSeconds, sUnit));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!token) return;
    setError(null);
    setSuccessMsg(null);

    const disputeStartSeconds = fromUnitValue(disputeStartValue, disputeStartUnit);
    const settlementSeconds = fromUnitValue(settlementValue, settlementUnit);

    if (settlementSeconds <= disputeStartSeconds) {
      setError('Settlement duration must be greater than dispute start delay');
      return;
    }
    if (settlementSeconds < 60) {
      setError('Settlement must be at least 60 seconds');
      return;
    }

    try {
      setSaving(true);
      await api.updateTimelockConfig(token, { disputeStartSeconds, settlementSeconds });
      setSuccessMsg('Platform timelock defaults updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDisputeStartUnit('days');
    setSettlementUnit('days');
    setDisputeStartValue('1');
    setSettlementValue('7');
    setError(null);
    setSuccessMsg(null);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timelock Configuration</h1>
        <p className="mt-1 text-sm text-[#697386]">
          Configure dispute and settlement timelines for all payments. These are platform-wide
          defaults — per-merchant overrides can be set from the merchant detail page.
        </p>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-3">
        <Badge variant="default">
          <Clock className="h-3 w-3 mr-1" /> Platform Defaults
        </Badge>
        <Badge variant="outline">
          Server-controlled — merchants cannot override via API
        </Badge>
      </div>

      {/* Visual Timeline Preview */}
      <Card>
        <TimelockTimeline
          disputeStartSeconds={previewDisputeStart}
          settlementSeconds={Math.max(previewSettlement, previewDisputeStart + 1)}
        />
      </Card>

      {/* Configuration Form */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0ff]">
            <Shield className="h-4 w-4 text-[#635bff]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0a2540]">Platform Defaults</h3>
            <p className="text-xs text-[#697386]">Applied to all merchants without custom overrides</p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#0a2540]">Dispute Start Delay</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={disputeStartValue}
                onChange={(e) => setDisputeStartValue(e.target.value)}
                className="flex-1"
              />
              <select
                className="rounded-lg border border-[#e3e8ee] bg-white px-2.5 py-2 text-sm text-[#0a2540] focus:outline-none focus:ring-2 focus:ring-[#635bff]/30"
                value={disputeStartUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as TimeUnit;
                  const secs = fromUnitValue(disputeStartValue, disputeStartUnit);
                  setDisputeStartUnit(newUnit);
                  setDisputeStartValue(toUnitValue(secs, newUnit));
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
            <label className="text-sm font-medium text-[#0a2540]">Settlement Duration</label>
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

        <div className="mt-4 space-y-3 text-xs text-[#697386]">
          <p>
            <strong>Dispute Start Delay:</strong> Time after capture before payers can open disputes.
            Acts as a grace period for legitimate payments.
          </p>
          <p>
            <strong>Settlement Duration:</strong> Time after capture when funds are released to the
            merchant. Disputes must be opened before this deadline.
          </p>
        </div>

        {/* Validation warnings */}
        <div className="mt-4">
          <ConfigWarnings
            disputeStartSeconds={previewDisputeStart}
            settlementSeconds={previewSettlement}
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#fdf2f4] px-3 py-2 text-xs text-[#df1b41]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#edfcf2] px-3 py-2 text-xs text-[#097c43]">
            <CheckCircle className="h-3.5 w-3.5" />
            {successMsg}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save Defaults'}
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </Card>

      {/* How it works */}
      <Card>
        <h3 className="text-sm font-semibold text-[#0a2540] mb-3">How Timelocks Work</h3>
        <div className="space-y-3 text-xs text-[#425466] leading-relaxed">
          <p>
            When a payment is captured on-chain, a <strong>timelock</strong> is encoded into
            the escrow contract. This timelock controls the payment lifecycle:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 ml-2">
            <li>
              <strong>Capture</strong> — Funds are locked in the escrow contract.
            </li>
            <li>
              <strong>Grace Period</strong> — No disputes can be opened. This prevents
              frivolous disputes on fresh payments.
            </li>
            <li>
              <strong>Dispute Window</strong> — Payers can initiate disputes. The platform
              admin resolves disputes by choosing a winner.
            </li>
            <li>
              <strong>Settlement</strong> — After the settlement deadline, funds are released
              to the merchant. No more disputes can be opened.
            </li>
          </ol>
          <p className="text-[#697386] italic">
            Timelocks are packed into a single uint256 on-chain and are immutable once set.
            Per-merchant overrides can be configured from the merchant detail page.
          </p>
        </div>
      </Card>
    </div>
  );
}
