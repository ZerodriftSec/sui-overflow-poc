//! StreamLine keeper — the permissionless settlement worker.
//!
//! On an interval it reads the shared streams table (populated by the indexer)
//! and, for every DRIPPING stream that has accrued at least the 0.01 USDC
//! gasless floor, submits `stream::drip`. It also `auto_approve`s milestones
//! whose review window has elapsed. Drips emit events the indexer ingests, which
//! advances `last_drip_ms` and closes the loop.

mod config;
mod db;
mod sui_cli;

use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use streamline_core::math;

use config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let cfg = Config::from_env();
    tracing::info!(
        package = %cfg.package_id,
        poll_ms = cfg.poll_interval_ms,
        dry_run = cfg.dry_run,
        "starting streamline-keeper"
    );

    if !cfg.has_package() {
        tracing::warn!("STREAMLINE_PACKAGE_ID not set — keeper will idle");
    }

    let pool = db::connect(&cfg.database_url).await?;
    tracing::info!("postgres connected");

    // Per-stream cooldown: skip a stream we just acted on until the indexer has
    // had a chance to ingest the resulting event and update its watermark.
    let mut last_action: HashMap<String, u64> = HashMap::new();
    let interval = Duration::from_millis(cfg.poll_interval_ms);

    loop {
        if cfg.has_package() {
            if let Err(e) = tick(&cfg, &pool, &mut last_action).await {
                tracing::warn!("tick error: {e:#}");
            }
        }
        tokio::time::sleep(interval).await;
    }
}

async fn tick(
    cfg: &Config,
    pool: &sqlx::PgPool,
    last_action: &mut HashMap<String, u64>,
) -> anyhow::Result<()> {
    let now = now_ms();

    // 1) Auto-approve milestones whose review window elapsed.
    for s in db::pending_past_deadline(pool, now as i64).await? {
        if on_cooldown(last_action, &s.id, now, cfg.cooldown_ms) {
            continue;
        }
        if cfg.coin_type_missing(&s.coin_type) {
            tracing::warn!("stream {} has no coin_type yet — is the indexer backfilling?", s.id);
            continue;
        }
        last_action.insert(s.id.clone(), now);
        if cfg.dry_run {
            tracing::info!("[dry-run] would auto_approve {}", s.id);
            continue;
        }
        match sui_cli::auto_approve(cfg, &s.coin_type, &s.id).await {
            Ok(d) => tracing::info!("auto_approved {} ({d})", s.id),
            Err(e) => tracing::warn!("auto_approve {} failed: {e:#}", s.id),
        }
    }

    // 2) Drip every dripping stream that has crossed the gasless floor.
    for s in db::dripping_streams(pool).await? {
        if cfg.coin_type_missing(&s.coin_type) || s.duration_ms <= 0 {
            continue; // metadata not backfilled yet
        }
        let due = math::drip_due(
            s.total as u64,
            s.duration_ms as u64,
            s.last_drip_ms as u64,
            now,
        );
        if !due {
            continue;
        }
        if on_cooldown(last_action, &s.id, now, cfg.cooldown_ms) {
            continue;
        }
        last_action.insert(s.id.clone(), now);
        if cfg.dry_run {
            tracing::info!("[dry-run] would drip {}", s.id);
            continue;
        }
        match sui_cli::drip(cfg, &s.coin_type, &s.id).await {
            Ok(d) => tracing::info!("dripped {} ({d})", s.id),
            Err(e) => tracing::warn!("drip {} failed: {e:#}", s.id),
        }
    }

    Ok(())
}

fn on_cooldown(map: &HashMap<String, u64>, id: &str, now: u64, cooldown_ms: u64) -> bool {
    map.get(id).is_some_and(|&t| now.saturating_sub(t) < cooldown_ms)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Config {
    fn coin_type_missing(&self, coin_type: &str) -> bool {
        coin_type.is_empty()
    }
}
