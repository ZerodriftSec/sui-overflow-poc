//! Shared application state: the DB pool, config, and a broadcast channel that
//! fans out live updates (drips, state changes) to connected WebSocket clients.

use serde::Serialize;
use sqlx::PgPool;
use tokio::sync::broadcast;

use crate::config::Config;

/// A real-time update pushed to subscribed frontends.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LiveUpdate {
    Drip {
        stream_id: String,
        amount: i64,
        timestamp_ms: i64,
    },
    State {
        stream_id: String,
        state: String,
    },
}

impl LiveUpdate {
    pub fn stream_id(&self) -> &str {
        match self {
            LiveUpdate::Drip { stream_id, .. } => stream_id,
            LiveUpdate::State { stream_id, .. } => stream_id,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub tx: broadcast::Sender<LiveUpdate>,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        let (tx, _rx) = broadcast::channel(1024);
        Self { pool, config, tx }
    }

    /// Broadcast a live update; ignores the error when no clients are listening.
    pub fn publish(&self, update: LiveUpdate) {
        let _ = self.tx.send(update);
    }
}
