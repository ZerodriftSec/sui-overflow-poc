'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { NodeRailsLogo } from './noderails-logo';
import {
  LayoutDashboard,
  Link2,
  Coins,
  Users,
  Activity,
  Settings,
  LogOut,
  Shield,
  Clock,
  Percent,
  Webhook,
  AlertTriangle,
  Zap,
  DollarSign,
  MessageSquare,
} from 'lucide-react';
import { useAdminAuth } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/chains', label: 'Chains', icon: Link2 },
  { href: '/dashboard/tokens', label: 'Tokens', icon: Coins },
  { href: '/dashboard/currencies', label: 'Currencies', icon: DollarSign },
  { href: '/dashboard/merchants', label: 'Merchants', icon: Users },
  { href: '/dashboard/apps', label: 'All Apps', icon: Zap },
  { href: '/dashboard/health', label: 'System Health', icon: Activity },
  { href: '/dashboard/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/dashboard/feedback', label: 'Feedback', icon: MessageSquare },
  { href: '/dashboard/settings/timelocks', label: 'Timelocks', icon: Clock },
  { href: '/dashboard/settings/fees', label: 'Platform Fees', icon: Percent },
  { href: '/dashboard/settings/webhooks', label: 'Webhook Delivery', icon: Webhook },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdminAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-white border-r border-[#e3e8ee]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <NodeRailsLogo className="h-9 w-9 text-[#0a2540]" />
        <div>
          <span className="text-lg font-bold tracking-tight text-[#0a2540]">NodeRails</span>
          <span className="ml-1.5 rounded-md bg-[#fdf2f4] px-1.5 py-0.5 text-[10px] font-semibold text-[#df1b41]">
            ADMIN
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2 overflow-y-auto">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#a3acb9]">
          Platform
        </p>
        {navItems.map((item) => {
          const isExact = pathname === item.href;
          const isActive =
            item.href === '/dashboard'
              ? isExact
              : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-[#f0f0ff] text-[#635bff]'
                  : 'text-[#425466] hover:bg-[#f6f8fa] hover:text-[#0a2540]',
              )}
            >
              <div
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150',
                  isActive
                    ? 'bg-[#635bff] shadow-[0_1px_4px_rgba(99,91,255,0.3)]'
                    : 'bg-[#f0f2f5] group-hover:bg-[#e3e8ee]',
                )}
              >
                <item.icon
                  className={clsx(
                    'h-3.5 w-3.5',
                    isActive ? 'text-white' : 'text-[#697386] group-hover:text-[#425466]',
                  )}
                />
              </div>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#e3e8ee] p-4">
        <div className="mb-3 rounded-lg bg-[#f6f8fa] px-3 py-2">
          <div className="text-[11px] font-medium text-[#0a2540] truncate">{admin?.email}</div>
          <div className="text-[10px] text-[#df1b41] font-semibold mt-0.5">Platform Admin</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#697386] hover:bg-[#f6f8fa] hover:text-[#0a2540] transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
