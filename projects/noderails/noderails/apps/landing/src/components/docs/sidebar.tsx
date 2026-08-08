'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NodeRailsLogo } from '@/components/noderails-logo';

/* ── Navigation structure ── */

interface NavItem {
  title: string;
  href?: string;
  items?: NavItem[];
}

const navigation: NavItem[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', href: '/docs' },
      { title: 'Quick Start', href: '/docs/getting-started' },
      { title: 'Supported Chains & Tokens', href: '/docs/supported-assets' },
      { title: 'Sui', href: '/docs/chains/sui' },
    ],
  },
  {
    title: 'SDK',
    items: [
      { title: 'Installation & Config', href: '/docs/sdk' },
      { title: 'Checkout Sessions', href: '/docs/sdk/checkout-sessions' },
      { title: 'Payment Intents', href: '/docs/sdk/payment-intents' },
      { title: 'Invoices', href: '/docs/sdk/invoices' },
      { title: 'Subscriptions', href: '/docs/sdk/subscriptions' },
      { title: 'Customers', href: '/docs/sdk/customers' },
      { title: 'Payment Links', href: '/docs/sdk/payment-links' },
      { title: 'Product Plans', href: '/docs/sdk/product-plans' },
      { title: 'Webhook Endpoints', href: '/docs/sdk/webhook-endpoints' },
      { title: 'Tax Rates', href: '/docs/sdk/tax-rates' },
      { title: 'Prices', href: '/docs/sdk/prices' },
      { title: 'Error Handling', href: '/docs/errors' },
      { title: 'Webhooks', href: '/docs/webhooks' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Checkout Sessions', href: '/docs/api-reference/checkout-sessions' },
      { title: 'Payment Intents', href: '/docs/api-reference/payment-intents' },
      { title: 'Customers', href: '/docs/api-reference/customers' },
      { title: 'Invoices', href: '/docs/api-reference/invoices' },
      { title: 'Payment Links', href: '/docs/api-reference/payment-links' },
      { title: 'Subscriptions', href: '/docs/api-reference/subscriptions' },
      { title: 'Product Plans', href: '/docs/api-reference/product-plans' },
      { title: 'Tax Rates', href: '/docs/api-reference/tax-rates' },
      { title: 'Webhook Endpoints', href: '/docs/api-reference/webhooks' },
      { title: 'Prices', href: '/docs/api-reference/prices' },
    ],
  },
];

/* ── Nav link ── */

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.href ? pathname === item.href.split('#')[0] : false;

  if (!item.href) return null;

  return (
    <Link
      href={item.href}
      style={{
        display: 'block',
        padding: '6px 12px 6px 16px',
        fontSize: '14px',
        lineHeight: '1.5',
        borderRadius: '6px',
        textDecoration: 'none',
        transition: 'all 0.15s ease',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#4f46e5' : '#475569',
        backgroundColor: isActive ? '#eef2ff' : 'transparent',
        borderLeft: isActive ? '3px solid #4f46e5' : '3px solid transparent',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc';
          (e.currentTarget as HTMLElement).style.color = '#1e293b';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLElement).style.color = '#475569';
        }
      }}
    >
      {item.title}
    </Link>
  );
}

/* ── Nav section ── */

function NavSection({ item }: { item: NavItem }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: '#94a3b8',
          padding: '0 12px 8px 16px',
        }}
      >
        {item.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {item.items?.map((child) => (
          <NavLink key={child.href ?? child.title} item={child} />
        ))}
      </div>
    </div>
  );
}

/* ── Sidebar content (shared between desktop & mobile) ── */

function SidebarContent() {
  return (
    <nav>
      {navigation.map((section) => (
        <NavSection key={section.title} item={section} />
      ))}
    </nav>
  );
}

/* ── Desktop sidebar ── */

export function DocsSidebar() {
  return (
    <aside
      className="docs-sidebar-desktop"
      style={{
        position: 'fixed',
        top: '57px',
        left: 0,
        bottom: 0,
        width: '280px',
        borderRight: '1px solid #e2e8f0',
        backgroundColor: '#fbfbfc',
        overflowY: 'auto',
        padding: '24px 16px 40px',
        zIndex: 30,
      }}
    >
      {/* Logo / branding */}
      <div style={{ padding: '0 12px 20px 16px', marginBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
        <Link href="/docs" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.01em' }}>
            Documentation
          </span>
        </Link>
      </div>
      <SidebarContent />
    </aside>
  );
}

/* ── Mobile sidebar ── */

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB trigger */}
      <button
        onClick={() => setOpen(true)}
        className="docs-sidebar-mobile-fab"
        aria-label="Open navigation"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 50,
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: '#4f46e5',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)',
        }}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setOpen(false)}
            className={`docs-sidebar-mobile-overlay ${open ? 'is-open' : ''}`}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              backgroundColor: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
            }}
          />
          {/* Drawer */}
          <div
            className={`docs-sidebar-mobile-drawer ${open ? 'is-open' : ''}`}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              zIndex: 51,
              width: '300px',
              backgroundColor: '#fbfbfc',
              borderRight: '1px solid #e2e8f0',
              overflowY: 'auto',
              padding: '20px 16px 40px',
              boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 20px 16px', marginBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.01em' }}>
                Documentation
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarContent />
          </div>
        </>
      )}
    </>
  );
}

/* ── Top header bar ── */

export function DocsHeader() {
  const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3001';

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '57px',
        zIndex: 40,
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <NodeRailsLogo withText className="w-[170px] h-auto" />
          </Link>
          <div className="docs-header-divider" style={{ width: '1px', height: '20px', backgroundColor: '#e2e8f0' }} />
          <Link href="/docs" className="docs-header-link" style={{ fontSize: '14px', fontWeight: 500, color: '#475569', textDecoration: 'none' }}>
            Documentation
          </Link>
          <Link href="/docs/api-reference/checkout-sessions" className="docs-header-link" style={{ fontSize: '14px', fontWeight: 500, color: '#475569', textDecoration: 'none' }}>
            API Reference
          </Link>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href="https://github.com/noderails"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <a
            href={`${DASHBOARD_URL}/login`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              color: 'white',
              backgroundColor: '#4f46e5',
              textDecoration: 'none',
              transition: 'background-color 0.15s',
            }}
          >
            Dashboard
          </a>
        </div>
      </div>
    </header>
  );
}
