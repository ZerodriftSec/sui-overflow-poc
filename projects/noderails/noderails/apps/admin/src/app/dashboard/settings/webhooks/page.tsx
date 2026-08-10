'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Input, Spinner, Badge } from '@/components/ui';
import { Webhook, Save, RotateCcw, AlertTriangle, CheckCircle, Clock, Zap, RefreshCw } from 'lucide-react';
import { useAdminAuth } from '@/lib/auth';
import * as api from '@/lib/api';

interface WebhookConfig {
  redundantSends: number;
  redundantDelaysMs: number[];
  baseDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  maxRetries: number;
}

// ── Helpers ──

function msToHuman(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms % 1_000 === 0 ? 0 : 1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(ms % 60_000 === 0 ? 0 : 1)}min`;
  return `${(ms / 3_600_000).toFixed(ms % 3_600_000 === 0 ? 0 : 1)}h`;
}

function computeRetryDelay(attempt: number, baseDelay: number, multiplier: number, maxDelay: number): number {
  return Math.min(Math.round(baseDelay * Math.pow(multiplier, attempt)), maxDelay);
}

// ── Retry Schedule Preview ──

function RetrySchedulePreview({ config }: { config: WebhookConfig }) {
  const MAX_PREVIEW = 50;
  const delays: number[] = [];
  let cumulative = 0;

  for (let i = 0; i < Math.min(config.maxRetries, MAX_PREVIEW); i++) {
    const d = computeRetryDelay(i, config.baseDelayMs, config.backoffMultiplier, config.maxDelayMs);
    delays.push(d);
    cumulative += d;
  }

  // Find milestones
  let retriesAt30m = 0, retriesAt1h = 0, retriesAt24h = 0;
  let runningTotal = 0;
  for (let i = 0; i < delays.length; i++) {
    runningTotal += delays[i];
    if (runningTotal <= 30 * 60_000) retriesAt30m = i + 1;
    if (runningTotal <= 60 * 60_000) retriesAt1h = i + 1;
    if (runningTotal <= 24 * 60 * 60_000) retriesAt24h = i + 1;
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-[#0a2540]">Retry Schedule Preview</h4>

      {/* Milestone badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">~{retriesAt30m} retries in 30 min</Badge>
        <Badge variant="default">~{retriesAt1h} retries in 1 hour</Badge>
        <Badge variant="default">~{retriesAt24h} retries in 24 hours</Badge>
        <Badge variant="outline">Total span: {msToHuman(cumulative)}</Badge>
      </div>

      {/* Delay table */}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-[#e3e8ee]">
        <table className="w-full text-xs">
          <thead className="bg-[#f6f8fa] sticky top-0">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-[#697386]">Retry #</th>
              <th className="px-3 py-1.5 text-left font-medium text-[#697386]">Delay</th>
              <th className="px-3 py-1.5 text-left font-medium text-[#697386]">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {delays.map((d, i) => {
              const cum = delays.slice(0, i + 1).reduce((a, b) => a + b, 0);
              return (
                <tr key={i} className={i % 2 === 0 ? '' : 'bg-[#f6f8fa]/50'}>
                  <td className="px-3 py-1 font-mono text-[#425466]">{i + 1}</td>
                  <td className="px-3 py-1 font-mono text-[#425466]">{msToHuman(d)}</td>
                  <td className="px-3 py-1 font-mono text-[#697386]">{msToHuman(cum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {config.maxRetries > MAX_PREVIEW && (
        <p className="text-[10px] text-[#697386]">Showing first {MAX_PREVIEW} of {config.maxRetries} retries</p>
      )}
    </div>
  );
}

// ── Redundant Sends Preview ──

function RedundantSendsPreview({ config }: { config: WebhookConfig }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#0a2540]">Redundant Sends</h4>
      <p className="text-xs text-[#697386]">
        Each webhook event fires <strong>{config.redundantSends}×</strong> with these delays:
      </p>
      <div className="flex gap-2">
        {config.redundantDelaysMs.map((d, i) => (
          <div key={i} className="rounded-lg bg-[#f0f0ff] px-3 py-2 text-center">
            <p className="text-xs font-semibold text-[#635bff]">Send {i + 1}</p>
            <p className="text-[10px] text-[#697386]">{d === 0 ? 'Immediately' : `+ ${msToHuman(d)}`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──

export default function WebhookSettingsPage() {
  const { token } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<WebhookConfig>({
    redundantSends: 3,
    redundantDelaysMs: [0, 60_000, 300_000],
    baseDelayMs: 5_000,
    backoffMultiplier: 1.3,
    maxDelayMs: 3_600_000,
    maxRetries: 50,
  });

  // Editable form state
  const [form, setForm] = useState<WebhookConfig>({ ...config });

  const isDirty = JSON.stringify(form) !== JSON.stringify(config);

  const fetchConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getWebhookConfig(token);
      setConfig(result);
      setForm(result);
    } catch (err) {
      setError('Failed to load webhook config');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateWebhookConfig(token, form);
      setConfig(result);
      setForm(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({ ...config });
    setError(null);
  };

  // Update redundant delays when count changes
  const handleRedundantSendsChange = (count: number) => {
    const newDelays = [...form.redundantDelaysMs];
    // Pad or trim
    while (newDelays.length < count) {
      const last = newDelays[newDelays.length - 1] ?? 0;
      newDelays.push(last + 60_000);
    }
    while (newDelays.length > count) newDelays.pop();
    setForm(f => ({ ...f, redundantSends: count, redundantDelaysMs: newDelays }));
  };

  const handleDelayChange = (index: number, ms: number) => {
    const newDelays = [...form.redundantDelaysMs];
    newDelays[index] = ms;
    setForm(f => ({ ...f, redundantDelaysMs: newDelays }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhook Delivery Settings</h1>
          <p className="mt-1 text-sm text-[#697386]">
            Configure how merchant webhooks are delivered, retried, and duplicated for reliability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="ghost" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="gap-1.5"
          >
            {saving ? <Spinner /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg bg-[#edfcf2] px-4 py-3 text-sm text-[#097c43]">
          <CheckCircle className="h-4 w-4" />
          Webhook delivery settings saved successfully.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Redundant Sends Section */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f0ff]">
            <Zap className="h-4 w-4 text-[#635bff]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0a2540]">Redundant Sends</h3>
            <p className="text-xs text-[#697386]">
              Fire each event multiple times with staggered delays for reliability
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#425466] mb-1.5">
                Number of sends per event
              </label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.redundantSends}
                onChange={e => handleRedundantSendsChange(parseInt(e.target.value) || 1)}
              />
              <p className="text-[10px] text-[#a3acb9] mt-1">1–10 sends per event</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#425466] mb-2">
              Delay per send (ms)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {form.redundantDelaysMs.map((d, i) => (
                <div key={i}>
                  <label className="block text-[10px] text-[#a3acb9] mb-1">Send {i + 1}</label>
                  <Input
                    type="number"
                    min={0}
                    value={d}
                    onChange={e => handleDelayChange(i, parseInt(e.target.value) || 0)}
                  />
                  <p className="text-[10px] text-[#a3acb9] mt-0.5">{d === 0 ? 'Immediate' : msToHuman(d)}</p>
                </div>
              ))}
            </div>
          </div>

          <RedundantSendsPreview config={form} />
        </div>
      </Card>

      {/* Exponential Backoff Section */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fef9ee]">
            <RefreshCw className="h-4 w-4 text-[#9e6c00]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0a2540]">Retry Backoff</h3>
            <p className="text-xs text-[#697386]">
              Exponential backoff formula: <code className="text-[10px] bg-[#f6f8fa] px-1 py-0.5 rounded">
                min(baseDelay × multiplier^attempt, maxDelay)
              </code>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-[#425466] mb-1.5">
              Base Delay (ms)
            </label>
            <Input
              type="number"
              min={1000}
              max={300_000}
              step={1000}
              value={form.baseDelayMs}
              onChange={e => setForm(f => ({ ...f, baseDelayMs: parseInt(e.target.value) || 5000 }))}
            />
            <p className="text-[10px] text-[#a3acb9] mt-1">{msToHuman(form.baseDelayMs)} — first retry delay</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#425466] mb-1.5">
              Backoff Multiplier
            </label>
            <Input
              type="number"
              min={1.01}
              max={5}
              step={0.01}
              value={form.backoffMultiplier}
              onChange={e => setForm(f => ({ ...f, backoffMultiplier: parseFloat(e.target.value) || 1.3 }))}
            />
            <p className="text-[10px] text-[#a3acb9] mt-1">{form.backoffMultiplier}× per attempt</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#425466] mb-1.5">
              Max Delay (ms)
            </label>
            <Input
              type="number"
              min={60_000}
              max={86_400_000}
              step={60_000}
              value={form.maxDelayMs}
              onChange={e => setForm(f => ({ ...f, maxDelayMs: parseInt(e.target.value) || 3_600_000 }))}
            />
            <p className="text-[10px] text-[#a3acb9] mt-1">{msToHuman(form.maxDelayMs)} — delay cap</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#425466] mb-1.5">
              Max Retries
            </label>
            <Input
              type="number"
              min={1}
              max={200}
              value={form.maxRetries}
              onChange={e => setForm(f => ({ ...f, maxRetries: parseInt(e.target.value) || 50 }))}
            />
            <p className="text-[10px] text-[#a3acb9] mt-1">Total retry attempts</p>
          </div>
        </div>

        <RetrySchedulePreview config={form} />
      </Card>

      {/* Warnings */}
      {form.backoffMultiplier < 1.1 && (
        <div className="flex items-center gap-2 rounded-lg bg-[#fef9ee] px-4 py-3 text-sm text-[#9e6c00]">
          <AlertTriangle className="h-4 w-4" />
          Very low multiplier — retries will be closely spaced, consuming more resources.
        </div>
      )}
      {form.maxRetries > 100 && (
        <div className="flex items-center gap-2 rounded-lg bg-[#fef9ee] px-4 py-3 text-sm text-[#9e6c00]">
          <AlertTriangle className="h-4 w-4" />
          High retry count — ensure your queue infrastructure can handle the volume.
        </div>
      )}
    </div>
  );
}
