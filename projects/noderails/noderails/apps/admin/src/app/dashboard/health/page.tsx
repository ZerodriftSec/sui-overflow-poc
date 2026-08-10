'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/lib/auth';
import { Card, StatCard, Badge, Spinner } from '@/components/ui';
import { Activity, Server, Database, Radio, Clock } from 'lucide-react';

interface HealthStatus {
  server: 'up' | 'down' | 'checking';
  latencyMs: number | null;
  timestamp: string;
}

export default function SystemHealthPage() {
  const { token } = useAdminAuth();
  const [health, setHealth] = useState<HealthStatus>({
    server: 'checking',
    latencyMs: null,
    timestamp: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    if (!token) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const start = performance.now();
    try {
      const res = await fetch(`${apiBase}/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const latency = Math.round(performance.now() - start);
      setHealth({
        server: res.ok ? 'up' : 'down',
        latencyMs: latency,
        timestamp: new Date().toISOString(),
      });
    } catch {
      setHealth({
        server: 'down',
        latencyMs: null,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const statusColor = {
    up: 'success' as const,
    down: 'destructive' as const,
    checking: 'warning' as const,
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Health</h1>
          <p className="mt-1 text-sm text-[#697386]">Monitor platform services and infrastructure</p>
        </div>
        <button
          onClick={checkHealth}
          className="rounded-lg border border-[#e3e8ee] px-3 py-1.5 text-xs font-medium text-[#425466] hover:bg-[#f6f8fa] transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Service Status */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="API Server"
              value={health.server === 'up' ? 'Online' : health.server === 'down' ? 'Offline' : 'Checking...'}
              subtitle={health.latencyMs !== null ? `${health.latencyMs}ms latency` : undefined}
              icon={Server}
            />
            <StatCard
              title="Database"
              value={health.server === 'up' ? 'Connected' : 'Unknown'}
              subtitle="PostgreSQL"
              icon={Database}
            />
            <StatCard
              title="Last Check"
              value={new Date(health.timestamp).toLocaleTimeString()}
              subtitle="Auto-refresh: 30s"
              icon={Clock}
            />
            <StatCard
              title="Overall Status"
              value={health.server === 'up' ? 'Healthy' : 'Degraded'}
              icon={Activity}
            />
          </div>

          {/* Service Details */}
          <Card>
            <h3 className="text-sm font-semibold text-[#0a2540] mb-4">Service Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
                <div className="flex items-center gap-3">
                  <Server className="h-4 w-4 text-[#697386]" />
                  <span className="text-sm text-[#425466]">NodeRails API Server</span>
                </div>
                <Badge variant={statusColor[health.server]}>
                  {health.server.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
                <div className="flex items-center gap-3">
                  <Database className="h-4 w-4 text-[#697386]" />
                  <span className="text-sm text-[#425466]">PostgreSQL Database</span>
                </div>
                <Badge variant={health.server === 'up' ? 'success' : 'warning'}>
                  {health.server === 'up' ? 'CONNECTED' : 'UNKNOWN'}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#f0f2f5]">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-[#697386]" />
                  <span className="text-sm text-[#425466]">Multichain Indexer</span>
                </div>
                <Badge variant="outline">EXTERNAL</Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-[#697386]" />
                  <span className="text-sm text-[#425466]">MTXM Transaction Manager</span>
                </div>
                <Badge variant="outline">EXTERNAL</Badge>
              </div>
            </div>
          </Card>

          {/* Environment Info */}
          <Card>
            <h3 className="text-sm font-semibold text-[#0a2540] mb-4">Environment</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-[#f6f8fa] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#a3acb9]">API URL</p>
                <p className="text-sm font-mono text-[#425466] mt-0.5">
                  {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}
                </p>
              </div>
              <div className="rounded-lg bg-[#f6f8fa] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#a3acb9]">Admin Dashboard</p>
                <p className="text-sm font-mono text-[#425466] mt-0.5">localhost:3004</p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
