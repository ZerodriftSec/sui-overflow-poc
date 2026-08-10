//! Keeper configuration, sourced from environment variables. Shares the
//! `DATABASE_URL` with the indexer so it reads the same stream state.

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    /// Path to the Sui CLI used to sign + submit settlement transactions.
    pub sui_bin: String,
    pub package_id: String,
    pub module: String,
    /// Shared Clock object (always 0x6 on Sui).
    pub clock_id: String,
    pub gas_budget: u64,
    pub poll_interval_ms: u64,
    /// Per-stream cooldown so we don't resubmit before the indexer catches the
    /// resulting event and advances `last_drip_ms`.
    pub cooldown_ms: u64,
    /// When true, log intended actions without submitting any transaction.
    pub dry_run: bool,
    /// Yield vault for auto-yield splits. When set, drips use `drip_with_yield`
    /// so yield-flagged legs auto-deposit. Requires `package_id` to be a version
    /// that has `drip_with_yield` (v8+).
    pub yield_vault_id: String,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            database_url: env_or("DATABASE_URL", "postgres://localhost/streamline"),
            sui_bin: env_or("SUI_BIN", "sui"),
            package_id: env_or("STREAMLINE_PACKAGE_ID", "0x0"),
            module: env_or("STREAMLINE_MODULE", "stream"),
            clock_id: env_or("SUI_CLOCK_ID", "0x6"),
            gas_budget: env_parse("KEEPER_GAS_BUDGET", 100_000_000),
            poll_interval_ms: env_parse("KEEPER_POLL_INTERVAL_MS", 5_000),
            cooldown_ms: env_parse("KEEPER_COOLDOWN_MS", 120_000),
            dry_run: env_parse("KEEPER_DRY_RUN", false),
            yield_vault_id: env_or("YIELD_VAULT_ID", "0x0"),
        }
    }

    /// Whether auto-yield drips are enabled (vault configured).
    pub fn has_yield_vault(&self) -> bool {
        !self.yield_vault_id.is_empty() && self.yield_vault_id != "0x0"
    }

    /// Whether a real package id is configured (otherwise the keeper idles).
    pub fn has_package(&self) -> bool {
        !self.package_id.is_empty() && self.package_id != "0x0"
    }
}
