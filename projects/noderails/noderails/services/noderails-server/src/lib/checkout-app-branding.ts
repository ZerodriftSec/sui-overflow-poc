import { resolveMerchantDisplayName, type MerchantNameFields } from '@noderails/common';

export const MERCHANT_BRANDING_SELECT = {
  orgName: true,
  businessName: true,
  individualName: true,
  merchantType: true,
} as const;

type AppWithMerchantBranding = {
  name: string;
  environment: string;
  merchant: MerchantNameFields;
};

export function toPublicCheckoutApp(app: AppWithMerchantBranding) {
  return {
    name: app.name,
    environment: app.environment,
    orgName: resolveMerchantDisplayName(app.merchant),
  };
}
