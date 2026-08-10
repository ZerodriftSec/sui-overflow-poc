'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import * as api from '@/lib/api';
import { Card, Button, Input, Badge, EmptyState, Spinner } from '@/components/ui';
import { Plus, Users, Trash2, Pencil, ChevronLeft, Shield, AppWindow, MailPlus, Clock, Check } from 'lucide-react';
import Link from 'next/link';
import {
  ORG_PERMISSIONS,
  APP_PERMISSIONS,
  PERMISSION_LABELS,
  FULL_ACCESS_PERMISSIONS,
  type Permission,
} from '@noderails/common';

interface AppInfo {
  id: string;
  name: string;
  environment: string;
}

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  permissions: string[];
  allAppsAccess: boolean;
  status: 'PENDING' | 'ACTIVE';
  createdAt: string;
  appAccess: { id: string; appId: string; app: AppInfo }[];
}

const orgPermKeys = Object.values(ORG_PERMISSIONS) as Permission[];
const appPermKeys = Object.values(APP_PERMISSIONS) as Permission[];

export default function TeamPage() {
  const { token } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [formAllAppsAccess, setFormAllAppsAccess] = useState(true);
  const [formAppIds, setFormAppIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [memberData, appData] = await Promise.all([
        api.listTeamMembers(token),
        api.getApps(token),
      ]);
      setMembers(Array.isArray(memberData) ? memberData : []);
      setApps(Array.isArray(appData) ? appData : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormEmail('');
    setFormName('');
    setFormPermissions([]);
    setFormAllAppsAccess(true);
    setFormAppIds([]);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const startEdit = (member: TeamMember) => {
    setEditingId(member.id);
    setFormEmail(member.email);
    setFormName(member.name ?? '');
    setFormPermissions([...member.permissions]);
    setFormAllAppsAccess(member.allAppsAccess);
    setFormAppIds(member.appAccess.map((a) => a.appId));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.updateTeamMember(token, editingId, {
          name: formName.trim() || undefined,
          permissions: formPermissions,
          allAppsAccess: formAllAppsAccess,
          appIds: formAllAppsAccess ? undefined : formAppIds,
        });
      } else {
        await api.addTeamMember(token, {
          email: formEmail.trim(),
          name: formName.trim() || undefined,
          permissions: formPermissions,
          allAppsAccess: formAllAppsAccess,
          appIds: formAllAppsAccess ? undefined : formAppIds,
        });
      }
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!token) return;
    try {
      await api.removeTeamMember(token, memberId);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResendInvite = async (memberId: string) => {
    if (!token) return;
    try {
      await api.resendTeamInvite(token, memberId);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const togglePermission = (perm: string) => {
    setFormPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const toggleApp = (appId: string) => {
    setFormAppIds((prev) =>
      prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId],
    );
  };

  const selectAllPerms = () => setFormPermissions([...FULL_ACCESS_PERMISSIONS]);
  const clearAllPerms = () => setFormPermissions([]);

  const permCount = (member: TeamMember) => member.permissions.length;

  if (loading) return <div className="flex justify-center p-12"><Spinner /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground">
            Invite people and manage their permissions
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Users className="h-4 w-4 text-secondary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {editingId ? 'Edit member' : 'Add team member'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {editingId ? 'Update permissions and app access' : 'Invite by email'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email & Name */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                type="email"
                placeholder="teammate@company.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={!!editingId}
                required
              />
              <Input
                label="Name (optional)"
                placeholder="Jane Doe"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Permissions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Permissions
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={selectAllPerms} className="text-xs text-primary hover:underline">
                    Select all
                  </button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button type="button" onClick={clearAllPerms} className="text-xs text-muted-foreground hover:underline">
                    Clear
                  </button>
                </div>
              </div>

              {/* Org-level permissions */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Organization
                </p>
                <div className="grid gap-2">
                  {orgPermKeys.map((perm) => {
                    const info = PERMISSION_LABELS[perm];
                    return (
                      <label
                        key={perm}
                        className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formPermissions.includes(perm)}
                          onChange={() => togglePermission(perm)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <div>
                          <span className="text-sm font-medium text-foreground">{info.label}</span>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* App-scoped permissions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  App-scoped
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {appPermKeys.map((perm) => {
                    const info = PERMISSION_LABELS[perm];
                    return (
                      <label
                        key={perm}
                        className="flex items-start gap-3 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formPermissions.includes(perm)}
                          onChange={() => togglePermission(perm)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <div>
                          <span className="text-sm font-medium text-foreground">{info.label}</span>
                          <p className="text-[11px] text-muted-foreground leading-tight">{info.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* App access */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                App access
              </label>
              <label className="flex items-center gap-3 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAllAppsAccess}
                  onChange={(e) => setFormAllAppsAccess(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm text-foreground">Access all apps (including future ones)</span>
              </label>

              {!formAllAppsAccess && (
                <>
                  {apps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No apps created yet</p>
                  ) : (
                    <div className="grid gap-2">
                      {apps.map((app) => (
                        <label
                          key={app.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={formAppIds.includes(app.id)}
                            onChange={() => toggleApp(app.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <AppWindow className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{app.name}</span>
                          <Badge variant={app.environment === 'PRODUCTION' ? 'default' : 'outline'}>
                            {app.environment}
                          </Badge>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Send invite'}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Members list */}
      {members.length === 0 && !showForm ? (
        <EmptyState
          icon={Users}
          title="No team members"
          description="Add team members to collaborate on your organization"
        />
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {member.name || member.email}
                    </span>
                    {member.status === 'PENDING' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <Check className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>
                  {member.name && (
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  )}
                  {/* Permission summary */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {permCount(member) === FULL_ACCESS_PERMISSIONS.length ? (
                      <Badge variant="default">
                        <Shield className="h-3 w-3 mr-1" />
                        Full access
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {permCount(member)} permission{permCount(member) !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {member.allAppsAccess ? (
                      <Badge variant="outline">All apps</Badge>
                    ) : member.appAccess.length > 0 ? (
                      member.appAccess.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {a.app.name}
                        </span>
                      ))
                    ) : (
                      <Badge variant="outline">No app access</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Added {new Date(member.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  {member.status === 'PENDING' && (
                    <button
                      onClick={() => handleResendInvite(member.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Resend invite"
                    >
                      <MailPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(member)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}