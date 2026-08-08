import type { Metadata, PaginationParams } from "./common";

// ─── Response Types ──────────────────────────────────────────────────

export interface Customer {
  id: string;
  appId: string;
  externalId: string | null;
  email: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  metadata: Metadata;
  createdAt: string;
  updatedAt: string;
  wallets?: CustomerWallet[];
}

export interface CustomerWallet {
  id: string;
  customerAccountId: string;
  /** EVM: numeric chain id (e.g. `1`). Solana clusters: `101` testnet, `102` devnet, `103` mainnet. */
  chainId: number;
  /** EVM: `0x`-prefixed address. Solana: base58-encoded public key. */
  walletAddress: string;
  hasActiveAuthorization: boolean;
  authorizationType: string | null;
  authorizationTxHash: string | null;
  authorizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Request Types ───────────────────────────────────────────────────

export interface CustomerCreateParams {
  /** Optional — auto-set from your SDK config if omitted. */
  appId?: string;
  externalId?: string;
  email?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: Metadata;
}

export interface CustomerUpdateParams {
  externalId?: string;
  email?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  metadata?: Metadata;
}

export interface CustomerListParams extends PaginationParams {
  appId?: string;
  search?: string;
}

export interface CustomerAddWalletParams {
  /** EVM: numeric chain id (e.g. `1`). Solana clusters: `101` testnet, `102` devnet, `103` mainnet. */
  chainId: number;
  /** EVM: `0x`-prefixed address. Solana: base58-encoded public key. */
  walletAddress: string;
}
