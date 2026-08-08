//! Postgres access layer. Uses runtime (non-macro) sqlx queries so the crate
//! compiles without a live database.

use anyhow::Result;
use serde::Serialize;
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::FromRow;

use streamline_core::events::*;

/// A stream row as stored and served to the frontend.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StreamRecord {
    pub id: String,
    pub sender: String,
    pub freelancer: String,
    pub coin_type: String,
    pub total: i64,
    pub remaining: i64,
    pub state: String,
    pub current_milestone: i64,
    pub n_milestones: i64,
    pub duration_ms: i64,
    pub drip_interval_ms: i64,
    pub last_drip_ms: i64,
    pub review_deadline_ms: Option<i64>,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct DripRecord {
    pub id: i64,
    pub stream_id: String,
    pub amount: i64,
    pub timestamp_ms: i64,
    pub tx_digest: Option<String>,
}

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn init_schema(pool: &PgPool) -> Result<()> {
    pool.execute_many_schema(include_str!("schema.sql")).await
}

/// Helper trait so we can run the multi-statement schema in one call.
trait SchemaExec {
    async fn execute_many_schema(&self, sql: &str) -> Result<()>;
}

impl SchemaExec for PgPool {
    async fn execute_many_schema(&self, sql: &str) -> Result<()> {
        sqlx::raw_sql(sql).execute(self).await?;
        Ok(())
    }
}

pub async fn upsert_created(
    pool: &PgPool,
    ev: &StreamCreated,
    timestamp_ms: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO streams
            (id, sender, freelancer, total, remaining, state,
             n_milestones, created_at_ms, last_drip_ms)
        VALUES ($1,$2,$3,$4,$4,'locked',$5,$6,$6)
        ON CONFLICT (id) DO UPDATE SET
            sender = EXCLUDED.sender,
            freelancer = EXCLUDED.freelancer,
            total = EXCLUDED.total,
            n_milestones = EXCLUDED.n_milestones,
            updated_at = now()
        "#,
    )
    .bind(&ev.stream_id)
    .bind(&ev.sender)
    .bind(&ev.freelancer)
    .bind(ev.total as i64)
    .bind(ev.n_milestones as i64)
    .bind(timestamp_ms)
    .execute(pool)
    .await?;
    Ok(())
}

/// Backfill the fields the `StreamCreated` event doesn't carry (the coin type
/// and timing), read from the on-chain object. Without this, `duration_ms`
/// stays 0 — which breaks both the keeper's drip math and the frontend's live
/// accrual counter.
pub async fn set_stream_meta(
    pool: &PgPool,
    id: &str,
    coin_type: &str,
    duration_ms: i64,
    drip_interval_ms: i64,
) -> Result<()> {
    sqlx::query(
        r#"UPDATE streams
           SET coin_type = $2, duration_ms = $3, drip_interval_ms = $4,
               updated_at = now()
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(coin_type)
    .bind(duration_ms)
    .bind(drip_interval_ms)
    .execute(pool)
    .await?;
    Ok(())
}

/// Ids of streams still missing their backfilled metadata (coin type / timing).
/// Covers streams ingested before backfill existed, or whose object read failed.
pub async fn streams_missing_meta(pool: &PgPool) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        r#"SELECT id FROM streams
           WHERE (coin_type = '' OR duration_ms = 0)
             AND state <> 'done'
           LIMIT 50"#,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

pub async fn set_pending(pool: &PgPool, ev: &MilestoneRaised) -> Result<()> {
    sqlx::query(
        r#"UPDATE streams
           SET state='pending_review', current_milestone=$2,
               review_deadline_ms=$3, updated_at=now()
           WHERE id=$1"#,
    )
    .bind(&ev.stream_id)
    .bind(ev.milestone_index as i64)
    .bind(ev.review_deadline_ms as i64)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_dripping(pool: &PgPool, ev: &MilestoneApproved) -> Result<()> {
    sqlx::query(
        r#"UPDATE streams
           SET state='dripping', current_milestone=$2,
               review_deadline_ms=NULL, updated_at=now()
           WHERE id=$1"#,
    )
    .bind(&ev.stream_id)
    .bind(ev.milestone_index as i64)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_stream_state(
    pool: &PgPool,
    id: &str,
    state: &str,
    current_milestone: i64,
    review_deadline_ms: Option<i64>,
    remaining: i64,
) -> Result<()> {
    sqlx::query(
        r#"UPDATE streams
           SET state = $2, current_milestone = $3,
               review_deadline_ms = $4, remaining = $5, updated_at = now()
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(state)
    .bind(current_milestone)
    .bind(review_deadline_ms)
    .bind(remaining)
    .execute(pool)
    .await?;
    Ok(())
}

/// Active streams whose DB state may lag chain (e.g. still "dripping" after a
/// milestone fully paid out inside the last `drip` tx).
pub async fn streams_needing_state_sync(pool: &PgPool) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        // `paused` is included so a dispute resolved on-chain (→ dripping on
        // resume, or → done on split) gets re-read; otherwise the stream is
        // stuck showing PAUSED in the UI forever.
        r#"SELECT id FROM streams WHERE state IN ('dripping', 'pending_review', 'locked', 'paused', 'suspended')
           AND state <> 'done' LIMIT 50"#,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

pub async fn apply_drip(
    pool: &PgPool,
    ev: &StreamDripped,
    tx_digest: &str,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"INSERT INTO drip_history (stream_id, amount, timestamp_ms, tx_digest)
           VALUES ($1,$2,$3,$4)"#,
    )
    .bind(&ev.stream_id)
    .bind(ev.amount as i64)
    .bind(ev.timestamp_ms as i64)
    .bind(tx_digest)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"UPDATE streams
           SET remaining = GREATEST(remaining - $2, 0),
               last_drip_ms = $3, updated_at = now()
           WHERE id = $1"#,
    )
    .bind(&ev.stream_id)
    .bind(ev.amount as i64)
    .bind(ev.timestamp_ms as i64)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn set_paused(pool: &PgPool, stream_id: &str) -> Result<()> {
    set_stream_status(pool, stream_id, "paused").await
}

/// Update only the `state` column (payroll suspend/resume/stop events).
pub async fn set_stream_status(pool: &PgPool, stream_id: &str, state: &str) -> Result<()> {
    sqlx::query("UPDATE streams SET state=$2, updated_at=now() WHERE id=$1")
        .bind(stream_id)
        .bind(state)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_stream(pool: &PgPool, id: &str) -> Result<Option<StreamRecord>> {
    let row = sqlx::query_as::<_, StreamRecord>("SELECT * FROM streams WHERE id=$1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn list_streams(
    pool: &PgPool,
    freelancer: Option<&str>,
    sender: Option<&str>,
) -> Result<Vec<StreamRecord>> {
    let rows = sqlx::query_as::<_, StreamRecord>(
        r#"SELECT * FROM streams
           WHERE ($1::text IS NULL OR freelancer=$1)
             AND ($2::text IS NULL OR sender=$2)
           ORDER BY created_at_ms DESC LIMIT 200"#,
    )
    .bind(freelancer)
    .bind(sender)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_drips(pool: &PgPool, stream_id: &str) -> Result<Vec<DripRecord>> {
    let rows = sqlx::query_as::<_, DripRecord>(
        "SELECT * FROM drip_history WHERE stream_id=$1 ORDER BY timestamp_ms DESC LIMIT 100",
    )
    .bind(stream_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_cursor(pool: &PgPool) -> Result<Option<(String, String)>> {
    get_cursor_n(pool, 1).await
}

pub async fn set_cursor(pool: &PgPool, tx_digest: &str, event_seq: &str) -> Result<()> {
    set_cursor_n(pool, 1, tx_digest, event_seq).await
}

pub async fn get_cursor_n(pool: &PgPool, id: i32) -> Result<Option<(String, String)>> {
    let row: Option<(Option<String>, Option<String>)> =
        sqlx::query_as("SELECT tx_digest, event_seq FROM poll_cursor WHERE id=$1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|(d, s)| match (d, s) {
        (Some(d), Some(s)) => Some((d, s)),
        _ => None,
    }))
}

pub async fn set_cursor_n(
    pool: &PgPool,
    id: i32,
    tx_digest: &str,
    event_seq: &str,
) -> Result<()> {
    sqlx::query(
        r#"INSERT INTO poll_cursor (id, tx_digest, event_seq)
           VALUES ($1,$2,$3)
           ON CONFLICT (id) DO UPDATE SET tx_digest=$2, event_seq=$3"#,
    )
    .bind(id)
    .bind(tx_digest)
    .bind(event_seq)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AuditEventRecord {
    pub id: i64,
    pub kind: String,
    pub module: String,
    pub subject_id: String,
    pub sender: String,
    pub counterparty: String,
    pub amount: i64,
    pub amount_b: i64,
    pub meta_json: String,
    pub timestamp_ms: i64,
    pub tx_digest: String,
}

pub async fn insert_audit_event(
    pool: &PgPool,
    kind: &str,
    module: &str,
    subject_id: &str,
    sender: &str,
    counterparty: &str,
    amount: i64,
    amount_b: i64,
    meta_json: &str,
    timestamp_ms: i64,
    tx_digest: &str,
) -> Result<()> {
    sqlx::query(
        r#"INSERT INTO audit_events
            (kind, module, subject_id, sender, counterparty, amount, amount_b, meta_json, timestamp_ms, tx_digest)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (tx_digest, kind, subject_id) DO NOTHING"#,
    )
    .bind(kind)
    .bind(module)
    .bind(subject_id)
    .bind(sender)
    .bind(counterparty)
    .bind(amount)
    .bind(amount_b)
    .bind(meta_json)
    .bind(timestamp_ms)
    .bind(tx_digest)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_audit_events(
    pool: &PgPool,
    party: Option<&str>,
    subject_id: Option<&str>,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    limit: i64,
) -> Result<Vec<AuditEventRecord>> {
    let rows = sqlx::query_as::<_, AuditEventRecord>(
        r#"SELECT * FROM audit_events
           WHERE ($1::text IS NULL OR sender=$1 OR counterparty=$1)
             AND ($2::text IS NULL OR subject_id=$2)
             AND ($3::bigint IS NULL OR timestamp_ms >= $3)
             AND ($4::bigint IS NULL OR timestamp_ms <= $4)
           ORDER BY timestamp_ms DESC
           LIMIT $5"#,
    )
    .bind(party)
    .bind(subject_id)
    .bind(from_ms)
    .bind(to_ms)
    .bind(limit.clamp(1, 2000))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Payroll statement rows: drip totals per stream for a sender in a window.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PayrollRow {
    pub stream_id: String,
    pub freelancer: String,
    pub coin_type: String,
    pub total_locked: i64,
    pub total_dripped: i64,
    pub drip_count: i64,
    pub first_drip_ms: Option<i64>,
    pub last_drip_ms: Option<i64>,
    pub digests: String,
}

pub async fn payroll_statement(
    pool: &PgPool,
    sender: &str,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
) -> Result<Vec<PayrollRow>> {
    let rows = sqlx::query_as::<_, PayrollRow>(
        r#"SELECT
             s.id AS stream_id,
             s.freelancer,
             s.coin_type,
             s.total AS total_locked,
             COALESCE(SUM(d.amount), 0)::bigint AS total_dripped,
             COUNT(d.id)::bigint AS drip_count,
             MIN(d.timestamp_ms) AS first_drip_ms,
             MAX(d.timestamp_ms) AS last_drip_ms,
             COALESCE(string_agg(DISTINCT d.tx_digest, ','), '') AS digests
           FROM streams s
           LEFT JOIN drip_history d ON d.stream_id = s.id
             AND ($2::bigint IS NULL OR d.timestamp_ms >= $2)
             AND ($3::bigint IS NULL OR d.timestamp_ms <= $3)
           WHERE s.sender = $1
           GROUP BY s.id, s.freelancer, s.coin_type, s.total
           ORDER BY total_dripped DESC"#,
    )
    .bind(sender)
    .bind(from_ms)
    .bind(to_ms)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
