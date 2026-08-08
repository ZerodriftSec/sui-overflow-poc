//! Indexer configuration, sourced from environment variables.

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub sui_rpc_url: String,
    pub package_id: String,
    pub module: String,
    pub port: u16,
    pub poll_interval_ms: u64,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

impl Config {
    pub fn from_env() -> Self {
        Config {
            database_url: env_or(
                "DATABASE_URL",
                "postgres://localhost/streamline",
            ),
            sui_rpc_url: env_or(
                "SUI_RPC_URL",
                "https://fullnode.testnet.sui.io:443",
            ),
            package_id: env_or("STREAMLINE_PACKAGE_ID", "0x0"),
            module: env_or("STREAMLINE_MODULE", "stream"),
            // Railway (and most PaaS) inject $PORT; fall back to INDEXER_PORT
            // for local runs, then a sane default.
            port: std::env::var("PORT")
                .or_else(|_| std::env::var("INDEXER_PORT"))
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8080),
            poll_interval_ms: env_or("POLL_INTERVAL_MS", "2000")
                .parse()
                .unwrap_or(2000),
        }
    }

    /// Whether a real package id is configured (otherwise the poller idles).
    pub fn has_package(&self) -> bool {
        !self.package_id.is_empty() && self.package_id != "0x0"
    }
}
