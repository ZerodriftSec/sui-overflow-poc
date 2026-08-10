//! Polls Sui for StreamLine events and folds them into Postgres, advancing a
//! persisted cursor so it resumes across restarts. Also fans live updates out
//! to WebSocket clients.

use std::time::Duration;

use serde_json::{json, Value};
use streamline_core::events::*;
use streamline_core::sui::{EventId, SuiClient, SuiEvent};

use crate::{db, state::AppState, state::LiveUpdate};

/// Move u64s arrive as JSON strings; numbers may also appear. Read either.
fn u64_field(v: &Value, key: &str) -> u64 {
    match v.get(key) {
        Some(Value::String(s)) => s.parse().unwrap_or(0),
        Some(Value::Number(n)) => n.as_u64().or_else(|| n.as_f64().map(|f| f as u64)).unwrap_or(0),
        _ => 0,
    }
}

fn bool_field(v: &Value, key: &str) -> bool {
    match v.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => s == "true" || s == "1",
        Some(Value::Number(n)) => n.as_u64().unwrap_or(0) != 0,
        _ => false,
    }
}

fn state_label(code: u64) -> &'static str {
    match code {
        0 => "locked",
        1 => "pending_review",
        2 => "dripping",
        3 => "paused",
        4 => "done",
        5 => "suspended",
        _ => "locked",
    }
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Id field may be a string or `{ "id": "0x…" }` BCS shape.
fn id_field(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(o)) => o
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

pub async fn run(state: AppState) {
    let interval = Duration::from_millis(state.config.poll_interval_ms);
    let client = SuiClient::new(&state.config.sui_rpc_url);

    loop {
        if state.config.has_package() {
            if let Err(e) = poll_module(&state, &client, &state.config.module, 1).await {
                tracing::warn!("poll stream error: {e:#}");
            }
            if let Err(e) = poll_module(&state, &client, "giftcard", 2).await {
                tracing::warn!("poll giftcard error: {e:#}");
            }
            if let Err(e) = backfill_missing(&state, &client).await {
                tracing::warn!("backfill sweep error: {e:#}");
            }
        }
        tokio::time::sleep(interval).await;
    }
}

/// Sweep streams that are missing coin type / timing and fill them from chain.
async fn backfill_missing(state: &AppState, client: &SuiClient) -> anyhow::Result<()> {
    for id in db::streams_missing_meta(&state.pool).await? {
        if let Err(e) = backfill_meta(state, client, &id).await {
            tracing::warn!("backfill meta for {id} failed: {e:#}");
        }
    }
    for id in db::streams_needing_state_sync(&state.pool).await? {
        if let Err(e) = sync_stream_state(state, client, &id).await {
            tracing::warn!("state sync for {id} failed: {e:#}");
        }
    }
    Ok(())
}

async fn poll_module(
    state: &AppState,
    client: &SuiClient,
    module: &str,
    cursor_id: i32,
) -> anyhow::Result<()> {
    let cursor = db::get_cursor_n(&state.pool, cursor_id)
        .await?
        .map(|(d, s)| EventId {
            tx_digest: d,
            event_seq: s,
        });

    let page = client
        .query_events(&state.config.package_id, module, cursor.as_ref(), 50)
        .await?;

    for ev in &page.data {
        if let Err(e) = process_event(state, client, ev).await {
            tracing::warn!("event {} failed: {e:#}", ev.short_type());
        }
    }

    if let Some(c) = page.next_cursor {
        db::set_cursor_n(&state.pool, cursor_id, &c.tx_digest, &c.event_seq).await?;
    }
    Ok(())
}

async fn audit(
    state: &AppState,
    kind: &str,
    module: &str,
    subject_id: &str,
    sender: &str,
    counterparty: &str,
    amount: i64,
    amount_b: i64,
    meta: Value,
    timestamp_ms: i64,
    tx_digest: &str,
) -> anyhow::Result<()> {
    db::insert_audit_event(
        &state.pool,
        kind,
        module,
        subject_id,
        sender,
        counterparty,
        amount,
        amount_b,
        &meta.to_string(),
        timestamp_ms,
        tx_digest,
    )
    .await
}

async fn process_event(
    state: &AppState,
    client: &SuiClient,
    ev: &SuiEvent,
) -> anyhow::Result<()> {
    let j = &ev.parsed_json;
    let now = ev
        .timestamp_ms
        .as_deref()
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    let digest = &ev.id.tx_digest;

    match ev.short_type() {
        EV_CREATED => {
            let e = StreamCreated {
                stream_id: id_field(j, "stream_id"),
                sender: str_field(j, "sender"),
                freelancer: str_field(j, "freelancer"),
                total: u64_field(j, "total"),
                n_milestones: u64_field(j, "n_milestones"),
            };
            db::upsert_created(&state.pool, &e, now).await?;
            audit(
                state,
                "stream_created",
                "stream",
                &e.stream_id,
                &e.sender,
                &e.freelancer,
                e.total as i64,
                0,
                json!({ "n_milestones": e.n_milestones }),
                now,
                digest,
            )
            .await?;
            if let Err(err) = backfill_meta(state, client, &e.stream_id).await {
                tracing::warn!("backfill meta for {} failed: {err:#}", e.stream_id);
            }
        }
        EV_MILESTONE_RAISED => {
            let e = MilestoneRaised {
                stream_id: id_field(j, "stream_id"),
                milestone_index: u64_field(j, "milestone_index"),
                review_deadline_ms: u64_field(j, "review_deadline_ms"),
            };
            db::set_pending(&state.pool, &e).await?;
            let (sender, freelancer) = parties(state, &e.stream_id).await;
            audit(
                state,
                "milestone_raised",
                "stream",
                &e.stream_id,
                &sender,
                &freelancer,
                0,
                0,
                json!({
                    "milestone_index": e.milestone_index,
                    "review_deadline_ms": e.review_deadline_ms
                }),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: e.stream_id,
                state: "pending_review".into(),
            });
        }
        EV_MILESTONE_APPROVED => {
            let e = MilestoneApproved {
                stream_id: id_field(j, "stream_id"),
                milestone_index: u64_field(j, "milestone_index"),
            };
            db::set_dripping(&state.pool, &e).await?;
            let (sender, freelancer) = parties(state, &e.stream_id).await;
            audit(
                state,
                "milestone_approved",
                "stream",
                &e.stream_id,
                &sender,
                &freelancer,
                0,
                0,
                json!({ "milestone_index": e.milestone_index }),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: e.stream_id,
                state: "dripping".into(),
            });
        }
        EV_DRIPPED => {
            let e = StreamDripped {
                stream_id: id_field(j, "stream_id"),
                amount: u64_field(j, "amount"),
                timestamp_ms: u64_field(j, "timestamp_ms").max(now as u64),
            };
            db::apply_drip(&state.pool, &e, digest).await?;
            let (sender, freelancer) = parties(state, &e.stream_id).await;
            audit(
                state,
                "stream_dripped",
                "stream",
                &e.stream_id,
                &sender,
                &freelancer,
                e.amount as i64,
                0,
                json!({}),
                e.timestamp_ms as i64,
                digest,
            )
            .await?;
            if let Err(err) = sync_stream_state(state, client, &e.stream_id).await {
                tracing::warn!("state sync after drip {}: {err:#}", e.stream_id);
            }
            state.publish(LiveUpdate::Drip {
                stream_id: e.stream_id,
                amount: e.amount as i64,
                timestamp_ms: e.timestamp_ms as i64,
            });
        }
        EV_PAUSED => {
            let id = id_field(j, "stream_id");
            db::set_paused(&state.pool, &id).await?;
            let (sender, freelancer) = parties(state, &id).await;
            audit(
                state,
                "dispute_raised",
                "stream",
                &id,
                &sender,
                &freelancer,
                0,
                0,
                json!({}),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: id,
                state: "paused".into(),
            });
        }
        EV_SUSPENDED => {
            let id = id_field(j, "stream_id");
            db::set_stream_status(&state.pool, &id, "suspended").await?;
            let (sender, freelancer) = parties(state, &id).await;
            audit(
                state,
                "payroll_suspended",
                "stream",
                &id,
                &sender,
                &freelancer,
                0,
                0,
                json!({}),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: id,
                state: "suspended".into(),
            });
        }
        EV_RESUMED => {
            let id = id_field(j, "stream_id");
            db::set_stream_status(&state.pool, &id, "dripping").await?;
            let (sender, freelancer) = parties(state, &id).await;
            audit(
                state,
                "payroll_resumed",
                "stream",
                &id,
                &sender,
                &freelancer,
                0,
                0,
                json!({}),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: id,
                state: "dripping".into(),
            });
        }
        EV_STOPPED => {
            let id = id_field(j, "stream_id");
            let paid = u64_field(j, "freelancer_paid");
            let refunded = u64_field(j, "refunded");
            db::set_stream_status(&state.pool, &id, "done").await?;
            let (sender, freelancer) = parties(state, &id).await;
            audit(
                state,
                "payroll_stopped",
                "stream",
                &id,
                &sender,
                &freelancer,
                paid as i64,
                refunded as i64,
                json!({ "freelancer_paid": paid, "refunded": refunded }),
                now,
                digest,
            )
            .await?;
            state.publish(LiveUpdate::State {
                stream_id: id,
                state: "done".into(),
            });
        }
        EV_RESOLUTION_PROPOSED => {
            let stream_id = id_field(j, "stream_id");
            let proposer = str_field(j, "proposer");
            let resume = bool_field(j, "resume");
            let freelancer_bps = u64_field(j, "freelancer_bps");
            let (sender, freelancer) = parties(state, &stream_id).await;
            audit(
                state,
                "resolution_proposed",
                "stream",
                &stream_id,
                &sender,
                &freelancer,
                0,
                0,
                json!({
                    "proposer": proposer,
                    "resume": resume,
                    "freelancer_bps": freelancer_bps
                }),
                now,
                digest,
            )
            .await?;
        }
        EV_DISPUTE_RESOLVED => {
            let stream_id = id_field(j, "stream_id");
            let resumed = bool_field(j, "resumed");
            let freelancer_amount = u64_field(j, "freelancer_amount");
            let sender_amount = u64_field(j, "sender_amount");
            let (sender, freelancer) = parties(state, &stream_id).await;
            audit(
                state,
                "dispute_resolved",
                "stream",
                &stream_id,
                &sender,
                &freelancer,
                freelancer_amount as i64,
                sender_amount as i64,
                json!({ "resumed": resumed }),
                now,
                digest,
            )
            .await?;
            if let Err(err) = sync_stream_state(state, client, &stream_id).await {
                tracing::warn!("state sync after dispute resolve {stream_id}: {err:#}");
            }
        }
        EV_GIFT_CREATED => {
            let card_id = id_field(j, "card_id");
            let sender = str_field(j, "sender");
            let expires_ms = u64_field(j, "expires_ms");
            audit(
                state,
                "giftcard_created",
                "giftcard",
                &card_id,
                &sender,
                "",
                0,
                0,
                json!({ "expires_ms": expires_ms }),
                now,
                digest,
            )
            .await?;
        }
        EV_GIFT_CLAIMED => {
            let card_id = id_field(j, "card_id");
            let claimer = str_field(j, "claimer");
            let amount = u64_field(j, "amount");
            audit(
                state,
                "giftcard_claimed",
                "giftcard",
                &card_id,
                "",
                &claimer,
                amount as i64,
                0,
                json!({}),
                now,
                digest,
            )
            .await?;
        }
        EV_GIFT_CANCELLED => {
            let card_id = id_field(j, "card_id");
            let sender = str_field(j, "sender");
            let amount = u64_field(j, "amount");
            audit(
                state,
                "giftcard_cancelled",
                "giftcard",
                &card_id,
                &sender,
                "",
                amount as i64,
                0,
                json!({}),
                now,
                digest,
            )
            .await?;
        }
        other => tracing::debug!("ignoring event {other}"),
    }
    Ok(())
}

async fn parties(state: &AppState, stream_id: &str) -> (String, String) {
    match db::get_stream(&state.pool, stream_id).await {
        Ok(Some(s)) => (s.sender, s.freelancer),
        _ => (String::new(), String::new()),
    }
}

async fn backfill_meta(
    state: &AppState,
    client: &SuiClient,
    stream_id: &str,
) -> anyhow::Result<()> {
    let obj = client.get_object(stream_id).await?;
    let data = &obj["data"];

    let type_str = data["type"].as_str().unwrap_or_default();
    let coin_type = type_param(type_str).unwrap_or_default();

    let fields = &data["content"]["fields"];
    let duration_ms = u64_field(fields, "duration_ms") as i64;
    let drip_interval_ms = u64_field(fields, "drip_interval_ms") as i64;

    db::set_stream_meta(
        &state.pool,
        stream_id,
        &coin_type,
        duration_ms,
        drip_interval_ms,
    )
    .await?;
    Ok(())
}

async fn sync_stream_state(
    state: &AppState,
    client: &SuiClient,
    stream_id: &str,
) -> anyhow::Result<()> {
    let obj = client.get_object(stream_id).await?;
    let fields = &obj["data"]["content"]["fields"];
    let code = u64_field(fields, "state");
    let milestone = u64_field(fields, "current_milestone") as i64;
    let deadline = u64_field(fields, "review_deadline_ms") as i64;
    let remaining = u64_field(fields, "balance") as i64;
    let label = state_label(code);
    let review_deadline_ms = if label == "pending_review" && deadline > 0 {
        Some(deadline)
    } else {
        None
    };
    db::set_stream_state(
        &state.pool,
        stream_id,
        label,
        milestone,
        review_deadline_ms,
        remaining,
    )
    .await?;
    state.publish(LiveUpdate::State {
        stream_id: stream_id.into(),
        state: label.into(),
    });
    Ok(())
}

fn type_param(type_str: &str) -> Option<String> {
    let start = type_str.find('<')?;
    let end = type_str.rfind('>')?;
    if end <= start + 1 {
        return None;
    }
    Some(type_str[start + 1..end].trim().to_string())
}
