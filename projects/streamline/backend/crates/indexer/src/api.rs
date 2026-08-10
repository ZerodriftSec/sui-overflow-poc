//! HTTP surface: REST endpoints the frontend reads, plus a WebSocket feed for
//! live drip/state updates.

use std::collections::HashMap;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{db, state::AppState};

pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any);
    Router::new()
        .route("/health", get(health))
        .route("/streams", get(list_streams))
        .route("/stream/{id}", get(get_stream))
        .route("/stream/{id}/drips", get(get_drips))
        .route("/audit", get(list_audit))
        .route("/payroll", get(payroll))
        .route("/ws", get(ws_upgrade))
        .layer(cors)
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

async fn list_streams(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let freelancer = q.get("freelancer").map(String::as_str);
    let sender = q.get("sender").map(String::as_str);
    match db::list_streams(&st.pool, freelancer, sender).await {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => internal(e),
    }
}

async fn get_stream(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match db::get_stream(&st.pool, &id).await {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "stream not found").into_response(),
        Err(e) => internal(e),
    }
}

async fn get_drips(
    State(st): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match db::get_drips(&st.pool, &id).await {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => internal(e),
    }
}

async fn list_audit(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let party = q.get("party").or_else(|| q.get("sender")).map(String::as_str);
    let subject_id = q.get("subject").or_else(|| q.get("stream")).map(String::as_str);
    let from_ms = q.get("from_ms").and_then(|s| s.parse().ok());
    let to_ms = q.get("to_ms").and_then(|s| s.parse().ok());
    let limit = q
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    match db::list_audit_events(&st.pool, party, subject_id, from_ms, to_ms, limit).await {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => internal(e),
    }
}

async fn payroll(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let Some(sender) = q.get("sender").map(String::as_str) else {
        return (StatusCode::BAD_REQUEST, "sender required").into_response();
    };
    let from_ms = q.get("from_ms").and_then(|s| s.parse().ok());
    let to_ms = q.get("to_ms").and_then(|s| s.parse().ok());
    match db::payroll_statement(&st.pool, sender, from_ms, to_ms).await {
        Ok(rows) => Json(rows).into_response(),
        Err(e) => internal(e),
    }
}

fn internal(e: anyhow::Error) -> axum::response::Response {
    tracing::error!("request error: {e:#}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error").into_response()
}

async fn ws_upgrade(
    State(st): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_loop(socket, st))
}

/// Streams live updates to a client until it disconnects.
async fn ws_loop(mut socket: WebSocket, st: AppState) {
    let mut rx = st.tx.subscribe();
    loop {
        tokio::select! {
            update = rx.recv() => match update {
                Ok(u) => {
                    let json = serde_json::to_string(&u).unwrap_or_default();
                    if socket.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                Err(_) => continue, // lagged; keep going
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(_)) => {} // ignore client messages
                _ => break,       // closed
            },
        }
    }
}
