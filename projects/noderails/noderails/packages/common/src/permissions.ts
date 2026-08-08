/**
 * Granular team member permissions.
 *
 * Org-level permissions apply across the entire org.
 * App-scoped permissions only apply to apps the team member has access to.
 */

// ── Org-level permissions ──

export const ORG_PERMISSIONS = {
  APPS_CREATE: 'APPS_CREATE',
  APPS_DELETE: 'APPS_DELETE',
  APPS_EDIT: 'APPS_EDIT',
  TEAM_MANAGE: 'TEAM_MANAGE',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
} as const;

// ── App-scoped permissions ──

export const APP_PERMISSIONS = {
  PAYMENTS_VIEW: 'PAYMENTS_VIEW',
  PAYMENT_LINKS_MANAGE: 'PAYMENT_LINKS_MANAGE',
  API_KEYS_MANAGE: 'API_KEYS_MANAGE',
  WEBHOOKS_MANAGE: 'WEBHOOKS_MANAGE',
  CUSTOMERS_VIEW: 'CUSTOMERS_VIEW',
  CUSTOMERS_MANAGE: 'CUSTOMERS_MANAGE',
  REFUNDS_MANAGE: 'REFUNDS_MANAGE',
  SUBSCRIPTIONS_VIEW: 'SUBSCRIPTIONS_VIEW',
  SUBSCRIPTIONS_MANAGE: 'SUBSCRIPTIONS_MANAGE',
  INVOICES_VIEW: 'INVOICES_VIEW',
  INVOICES_MANAGE: 'INVOICES_MANAGE',
  PAYOUTS_VIEW: 'PAYOUTS_VIEW',
  PAYOUTS_MANAGE: 'PAYOUTS_MANAGE',
  DISPUTES_VIEW: 'DISPUTES_VIEW',
  DISPUTES_MANAGE: 'DISPUTES_MANAGE',
  STATS_VIEW: 'STATS_VIEW',
} as const;

// ── Combined ──

export const ALL_PERMISSIONS = { ...ORG_PERMISSIONS, ...APP_PERMISSIONS } as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[keyof typeof ORG_PERMISSIONS];
export type AppPermission = (typeof APP_PERMISSIONS)[keyof typeof APP_PERMISSIONS];
export type Permission = OrgPermission | AppPermission;

/** All valid permission strings */
export const VALID_PERMISSIONS = Object.values(ALL_PERMISSIONS) as Permission[];

/** Quick set for O(1) lookup */
const orgPermSet = new Set<string>(Object.values(ORG_PERMISSIONS));

/** Check if a permission is org-level (not app-scoped) */
export function isOrgPermission(p: string): p is OrgPermission {
  return orgPermSet.has(p);
}

/** The "full access" preset — all permissions */
export const FULL_ACCESS_PERMISSIONS: Permission[] = [...VALID_PERMISSIONS];

/** Human-readable labels for UI display */
export const PERMISSION_LABELS: Record<Permission, { label: string; description: string; category: 'org' | 'app' }> = {
  // Org
  APPS_CREATE:           { label: 'Create Apps',           description: 'Create new applications',               category: 'org' },
  APPS_DELETE:           { label: 'Delete Apps',           description: 'Delete existing applications',          category: 'org' },
  APPS_EDIT:             { label: 'Edit Apps',             description: 'Edit app settings, chains, and tokens', category: 'org' },
  TEAM_MANAGE:           { label: 'Manage Team',           description: 'Add, edit, and remove team members',    category: 'org' },
  SETTINGS_MANAGE:       { label: 'Org Settings',          description: 'Edit organization name and settings',   category: 'org' },
  // App-scoped
  PAYMENTS_VIEW:         { label: 'View Payments',         description: 'View payment intents and transactions', category: 'app' },
  PAYMENT_LINKS_MANAGE:  { label: 'Manage Payment Links',  description: 'Create, edit, and delete payment links', category: 'app' },
  API_KEYS_MANAGE:       { label: 'Manage API Keys',       description: 'Create, view, and revoke API keys',    category: 'app' },
  WEBHOOKS_MANAGE:       { label: 'Manage Webhooks',       description: 'Configure webhook endpoints',          category: 'app' },
  CUSTOMERS_VIEW:        { label: 'View Customers',        description: 'View customer records',                 category: 'app' },
  CUSTOMERS_MANAGE:      { label: 'Manage Customers',      description: 'Create and edit customers',             category: 'app' },
  REFUNDS_MANAGE:        { label: 'Manage Refunds',        description: 'Process refunds',                       category: 'app' },
  SUBSCRIPTIONS_VIEW:    { label: 'View Subscriptions',    description: 'View subscriptions',                    category: 'app' },
  SUBSCRIPTIONS_MANAGE:  { label: 'Manage Subscriptions',  description: 'Create, pause, resume, cancel subs',   category: 'app' },
  INVOICES_VIEW:         { label: 'View Invoices',         description: 'View invoices',                         category: 'app' },
  INVOICES_MANAGE:       { label: 'Manage Invoices',       description: 'Create, send, and void invoices',       category: 'app' },
  PAYOUTS_VIEW:          { label: 'View Payouts',          description: 'View payout history',                   category: 'app' },
  PAYOUTS_MANAGE:        { label: 'Manage Payouts',        description: 'Create and execute payouts',            category: 'app' },
  DISPUTES_VIEW:         { label: 'View Disputes',         description: 'View dispute records',                  category: 'app' },
  DISPUTES_MANAGE:       { label: 'Manage Disputes',       description: 'Respond to customer disputes',          category: 'app' },
  STATS_VIEW:            { label: 'View Stats',            description: 'View dashboard statistics',             category: 'app' },
};
