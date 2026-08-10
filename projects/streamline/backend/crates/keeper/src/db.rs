//! Read-only access to the shared streams table. The keeper only needs to know
//! which streams are due for settlement; the indexer owns all writes.

use anyhow::Result;
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::FromRow;

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;
    Ok(pool)
}

/// A DRIPPING stream and the fields needed to decide whether a drip is due.
#[derive(Debug, Clone, FromRow)]
pub struct DrippingStream {
    pub id: String,
    pub coin_type: String,
    pub total: i64,
    pub duration_ms: i64,
    pub last_drip_ms: i64,
}

/// A PENDING_REVIEW stream eligible for keeper auto-approval.
#[derive(Debug, Clone, FromRow)]
pub struct PendingStream {
    pub id: String,
    pub coin_type: String,
}

pub async fn dripping_streams(pool: &PgPool) -> Result<Vec<DrippingStream>> {
    let rows = sqlx::query_as::<_, DrippingStream>(
        r#"SELECT id, coin_type, total, duration_ms, last_drip_ms
           FROM streams
           WHERE state = 'dripping'"#,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// PENDING_REVIEW streams whose review deadline has elapsed (silence ≠ blocking).
pub async fn pending_past_deadline(pool: &PgPool, now_ms: i64) -> Result<Vec<PendingStream>> {
    let rows = sqlx::query_as::<_, PendingStream>(
        r#"SELECT id, coin_type
           FROM streams
           WHERE state = 'pending_review'
             AND review_deadline_ms IS NOT NULL
             AND review_deadline_ms <= $1"#,
    )
    .bind(now_ms)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
