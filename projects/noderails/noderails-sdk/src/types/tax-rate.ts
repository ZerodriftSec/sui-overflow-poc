// ─── Response Types ──────────────────────────────────────────────────

export interface TaxRate {
  id: string;
  merchantId: string;
  displayName: string;
  percentage: string;
  inclusive: boolean;
  jurisdiction: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface TaxRateCreateParams {
  displayName: string;
  percentage: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
}

export interface TaxRateUpdateParams {
  displayName?: string;
  percentage?: number;
  inclusive?: boolean;
  jurisdiction?: string;
  description?: string;
  isActive?: boolean;
}

export interface TaxRateListParams {
  includeInactive?: boolean;
}
