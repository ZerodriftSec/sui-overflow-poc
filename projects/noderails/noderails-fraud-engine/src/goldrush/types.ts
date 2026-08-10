/**
 * Minimal shapes for GoldRush Foundational API JSON (Solana uses the same envelope as other chains).
 */

export interface GoldRushEnvelope<T> {
  data?: T;
  error?: boolean;
  error_message?: string | null;
  error_code?: number | null;
}

export interface BalanceItem {
  contract_address?: string | null;
  contract_ticker_symbol?: string | null;
  contract_name?: string | null;
  type?: string | null;
  is_spam?: boolean | null;
  is_native_token?: boolean | null;
  quote?: number | null;
  balance?: string | null;
}

export interface BalancesResponseBody {
  address?: string;
  chain_name?: string;
  chain_id?: number;
  updated_at?: string;
  items?: BalanceItem[];
}

export interface TxItem {
  tx_hash?: string | null;
  successful?: boolean | null;
  block_signed_at?: string | null;
  from_address?: string | null;
  to_address?: string | null;
  value_quote?: number | null;
}

export interface TransactionsResponseBody {
  address?: string;
  chain_name?: string;
  updated_at?: string;
  items?: TxItem[];
  links?: { prev?: string | null; next?: string | null };
}

export interface TransactionSummaryItem {
  total_count?: number | null;
  transfer_count?: number | null;
  earliest_transaction?: {
    block_signed_at?: string | null;
    tx_hash?: string | null;
  } | null;
  latest_transaction?: {
    block_signed_at?: string | null;
    tx_hash?: string | null;
  } | null;
}

export interface TransactionSummaryResponseBody {
  address?: string;
  chain_name?: string;
  updated_at?: string;
  items?: TransactionSummaryItem[];
}
