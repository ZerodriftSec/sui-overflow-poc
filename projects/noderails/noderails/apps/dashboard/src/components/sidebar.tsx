'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { NodeRailsLogo } from './noderails-logo';
import {
  LayoutDashboard,
  CreditCard,
  ArrowUpRight,
  RefreshCw,
  FileText,
  Settings,
  LogOut,
  Users,
  ShoppingCart,
  UserCircle,
  Package,
  Link2,
  ChevronLeft,
  Layers,
} from 'lucide-react';
import { useAuth, usePermission } from '@/lib/auth';
import * as api from '@/lib/api';

// ── Main navigation (always visible) ──
const mainNavItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/apps', label: 'Apps', icon: Layers },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

// ── App sub-navigation (shown when inside an app) ──
// Each item maps to a permission — null means always visible.
const appNavItems: { segment: string; label: string; icon: any; permission: string | null }[] = [
  { segment: '', label: 'Overview', icon: LayoutDashboard, permission: null },
  { segment: '/payments', label: 'Payments', icon: CreditCard, permission: 'PAYMENTS_VIEW' },
  { segment: '/payouts', label: 'Payouts', icon: ArrowUpRight, permission: 'PAYOUTS_VIEW' },
  { segment: '/subscriptions', label: 'Subscriptions', icon: RefreshCw, permission: 'SUBSCRIPTIONS_VIEW' },
  { segment: '/invoices', label: 'Invoices', icon: FileText, permission: 'INVOICES_VIEW' },
  { segment: '/payment-links', label: 'Payment Links', icon: Link2, permission: 'PAYMENT_LINKS_MANAGE' },
  { segment: '/customers', label: 'Customers', icon: Users, permission: 'CUSTOMERS_VIEW' },
  { segment: '/product-plans', label: 'Product Plans', icon: Package, permission: 'SUBSCRIPTIONS_VIEW' },
  { segment: '/checkout-sessions', label: 'Checkout', icon: ShoppingCart, permission: 'PAYMENTS_VIEW' },
  { segment: '/settings', label: 'Settings', icon: Settings, permission: 'APPS_EDIT' },
];

/** Extract app ID from pathname like /dashboard/apps/abc-123/payments → abc-123 */
function getAppIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/apps\/([^/]+)/);
  return match ? match[1] : null;
}

export function Sidebar() {
  const pathname = usePathname();
  const { merchant, teamMember, token, logout } = useAuth();
  const hasPermission = usePermission();

  const appId = getAppIdFromPath(pathname);
  const isInsideApp = !!appId;
  const appBase = appId ? `/dashboard/apps/${appId}` : '';

  const [appName, setAppName] = useState<string>('');

  useEffect(() => {
    if (!appId || !token) { setAppName(''); return; }
    api.getApp(token, appId)
      .then((app) => setAppName(app?.name ?? ''))
      .catch(() => setAppName(''));
  }, [appId, token]);

  // Filter app nav items by permission
  const visibleAppNavItems = appNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  const userEmail = merchant?.email ?? teamMember?.email ?? '';
  const userLabel = teamMember ? 'Team Member' : 'Merchant';

  return (
    <div className="fixed left-0 top-0 z-40 flex h-screen">
      {/* ─── Primary sidebar (always visible) ─── */}
      <aside className="flex h-full w-[200px] flex-col bg-card border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <NodeRailsLogo className="h-8 w-8 text-foreground" />
          <span className="text-[15px] font-bold tracking-tight text-foreground">NodeRails</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-2 overflow-y-auto">
          {mainNavItems.map((item) => {
            const isExact = pathname === item.href;
            const isActive = item.href === '/dashboard'
              ? isExact
              : item.href === '/dashboard/apps'
                ? pathname === item.href || pathname.startsWith(item.href + '/')
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-secondary-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className={clsx('h-4 w-4', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-secondary-foreground')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          <div className="mb-2 rounded-lg bg-muted px-3 py-2">
            <div className="text-[11px] font-medium text-foreground truncate">{userEmail}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{userLabel}</div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ─── App sub-sidebar (shown only when inside an app) ─── */}
      {isInsideApp && (
        <aside className="flex h-full w-[200px] flex-col bg-muted/80 border-r border-border">
          {/* Back + App name */}
          <div className="px-4 pt-5 pb-3">
            <Link
              href="/dashboard/apps"
              className="group inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ChevronLeft className="h-3 w-3" />
              Apps
            </Link>
            <p className="text-[13px] font-semibold text-foreground truncate mt-0.5">
              {appName || 'Loading...'}
            </p>
          </div>

          {/* App nav */}
          <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto">
            {visibleAppNavItems.map((item) => {
              const href = `${appBase}${item.segment}`;
              const isActive = item.segment === ''
                ? pathname === appBase || pathname === appBase + '/'
                : item.segment === '/settings'
                  ? pathname.startsWith(`${appBase}/settings`) ||
                    pathname.startsWith(`${appBase}/chains`) ||
                    pathname.startsWith(`${appBase}/tokens`) ||
                    pathname.startsWith(`${appBase}/wallets`) ||
                    pathname.startsWith(`${appBase}/api-keys`) ||
                    pathname.startsWith(`${appBase}/webhooks`)
                  : pathname.startsWith(href);
              return (
                <Link
                  key={item.segment}
                  href={href}
                  className={clsx(
                    'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                    isActive
                      ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                      : 'text-secondary-foreground hover:bg-card/60 hover:text-foreground',
                  )}
                >
                  <item.icon className={clsx('h-3.5 w-3.5', isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-secondary-foreground')} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
      )}
    </div>
  );
}

/** Returns the total sidebar width for margin calculation */
export function useSidebarWidth(): number {
  const pathname = usePathname();
  const appId = getAppIdFromPath(pathname);
  return appId ? 400 : 200;
}
