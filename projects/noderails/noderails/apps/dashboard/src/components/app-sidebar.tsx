'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Package,
  Link2,
  Layers,
  ChevronLeft,
  ChevronUp,
  Sparkles,
  Plus,
  ChevronsUpDown,
  Check,
  AlertTriangle,
  Landmark,
} from 'lucide-react';
import { useAuth, usePermission, useAppAccess } from '@/lib/auth';
import { resolveMerchantDisplayName } from '@noderails/common';
import { NodeRailsLogo } from './noderails-logo';
import * as api from '@/lib/api';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';

/* ── Navigation items ── */
const platformNavItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/apps', label: 'Apps', icon: Layers },
  { href: '/dashboard/bank', label: 'Bank', icon: Landmark },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

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
  { segment: '/disputes', label: 'Disputes', icon: AlertTriangle, permission: 'DISPUTES_VIEW' },
  { segment: '/settings', label: 'Settings', icon: Settings, permission: 'APPS_EDIT' },
];

/** Extract app ID from pathname */
function getAppIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/dashboard\/apps\/([^/]+)/);
  return match ? match[1] : null;
}

interface AppInfo {
  id: string;
  name: string;
  environment: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { merchant, teamMember, token, logout } = useAuth();
  const hasPermission = usePermission();
  const hasAppAccess = useAppAccess();
  const { state } = useSidebar();

  const appId = getAppIdFromPath(pathname);
  const isInsideApp = !!appId;
  const appBase = appId ? `/dashboard/apps/${appId}` : '';

  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);

  // Fetch all apps for the switcher
  useEffect(() => {
    if (!token) return;
    api
      .getApps(token)
      .then((result) => {
        const list = Array.isArray(result) ? result : [];
        setApps(list);
      })
      .catch(() => setApps([]));
  }, [token]);

  // If navigating to an app not in the list, refetch to get the newly created app
  useEffect(() => {
    if (!appId || !token) return;
    const appExists = apps.some((a) => a.id === appId);
    if (!appExists) {
      api
        .getApps(token)
        .then((result) => {
          const list = Array.isArray(result) ? result : [];
          setApps(list);
        })
        .catch(() => {});
    }
  }, [appId, token, apps]);

  const currentApp = apps.find((a) => a.id === appId);

  // Filter app nav items by permission
  const visibleAppNavItems = appNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  // Filter apps by app access for team members
  const visibleApps = apps.filter((a) => hasAppAccess(a.id));

  const userEmail = merchant?.email ?? teamMember?.email ?? '';
  const orgName =
    (merchant ? resolveMerchantDisplayName(merchant) : null) ??
    teamMember?.orgName ??
    null;
  const displayName = orgName ?? userEmail.split('@')[0] ?? 'User';
  const userInitials = (orgName ?? userEmail).slice(0, 2).toUpperCase() || 'NR';
  const userLabel = teamMember ? 'Team Member' : userEmail;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* ── Header / Logo ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex items-center justify-center size-8 shrink-0">
                  <NodeRailsLogo className="size-10 text-foreground" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold text-[15px] tracking-tight">NodeRails</span>
                  <span className="text-[10px] text-muted-foreground">Crypto Payment Infrastructure</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Platform navigation ── */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {platformNavItems.map((item) => {
              const isActive =
                item.href === '/dashboard'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* ── App Switcher + App Navigation ── */}
        {visibleApps.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>App</span>
              <button
                onClick={() => router.push('/dashboard/apps')}
                className="inline-flex items-center justify-center rounded-md h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Create new app"
              >
                <Plus className="size-3.5" />
              </button>
            </SidebarGroupLabel>
            <SidebarMenu>
              {/* App Switcher Dropdown */}
              <SidebarMenuItem>
                <DropdownMenu open={appSwitcherOpen} onOpenChange={setAppSwitcherOpen}>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      className="w-full justify-between bg-primary/10 text-primary hover:bg-primary/15 data-[state=open]:bg-primary/15 border border-primary/20 rounded-lg"
                      tooltip={currentApp?.name ?? 'Select an app'}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className="size-4 shrink-0" />
                        <span className="truncate text-sm font-semibold">
                          {currentApp?.name ?? 'Select an app'}
                        </span>
                      </div>
                      <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-48"
                    align="start"
                    sideOffset={4}
                  >
                    {visibleApps.map((app) => (
                      <DropdownMenuItem
                        key={app.id}
                        onClick={() => router.push(`/dashboard/apps/${app.id}`)}
                        className="cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="size-3.5 shrink-0" />
                          <span className="truncate">{app.name}</span>
                        </div>
                        {app.id === appId && (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => router.push('/dashboard/apps')}
                      className="cursor-pointer"
                    >
                      <Plus className="mr-2 size-3.5" />
                      Create new app
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* App sub-navigation (shown when inside an app) */}
            {isInsideApp && (
              <SidebarMenu className="mt-1">
                {visibleAppNavItems.map((item) => {
                  const href = `${appBase}${item.segment}`;
                  const isActive =
                    item.segment === ''
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
                    <SidebarMenuItem key={item.segment}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer / User ── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {displayName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {userLabel}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="end"
                sideOffset={4}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Account Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
