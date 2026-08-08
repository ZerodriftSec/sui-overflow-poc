export interface MerchantNameFields {
  orgName?: string | null;
  businessName?: string | null;
  individualName?: string | null;
  merchantType?: 'BUSINESS' | 'INDIVIDUAL' | string;
}

/** Resolves the merchant/org label shown on checkout and in the dashboard. */
export function resolveMerchantDisplayName(merchant: MerchantNameFields): string | null {
  const org = merchant.orgName?.trim();
  if (org) return org;

  if (merchant.merchantType === 'INDIVIDUAL') {
    return merchant.individualName?.trim() || null;
  }

  return merchant.businessName?.trim() || null;
}
