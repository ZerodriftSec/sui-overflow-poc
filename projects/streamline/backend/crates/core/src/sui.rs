//! Minimal Sui JSON-RPC client over `reqwest`. We deliberately avoid the heavy
//! `sui-sdk` git dependency — the indexer only needs `suix_queryEvents` and a
//! couple of object reads, which are simple JSON-RPC calls.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, thiserror::Error)]
pub enum SuiError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("rpc error {code}: {message}")]
    Rpc { code: i64, message: String },
    /// The endpoint returned a non-2xx status or a non-JSON body (e.g. a public
    /// fullnode rate-limiting us with an HTML error page or an empty response).
    #[error("rpc transport: http {status}, body: {body}")]
    Transport { status: u16, body: String },
    #[error("decode error: {0}")]
    Decode(#[from] serde_json::Error),
}

/// Exponential backoff between RPC retries: ~250ms, 500ms, 1s.
async fn backoff(attempt: u32, reason: &str) {
    let ms = 250u64 * 2u64.pow(attempt.saturating_sub(1));
    tracing::debug!("rpc retry {attempt} after {ms}ms ({reason})");
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

/// Trim a (possibly huge / HTML) response body to a one-line snippet for logs.
fn snippet(body: &str) -> String {
    let one_line = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.len() > 200 {
        format!("{}…", &one_line[..200])
    } else {
        one_line
    }
}

pub type Result<T> = std::result::Result<T, SuiError>;

/// Cursor identifying a position in the event stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventId {
    #[serde(rename = "txDigest")]
    pub tx_digest: String,
    #[serde(rename = "eventSeq")]
    pub event_seq: String,
}

/// A single Move event as returned by `suix_queryEvents`.
#[derive(Debug, Clone, Deserialize)]
pub struct SuiEvent {
    pub id: EventId,
    #[serde(rename = "packageId")]
    pub package_id: String,
    #[serde(rename = "transactionModule")]
    pub transaction_module: String,
    pub sender: String,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "parsedJson")]
    pub parsed_json: Value,
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: Option<String>,
}

impl SuiEvent {
    /// The short event name, e.g. `StreamCreated` from `<pkg>::stream::StreamCreated`.
    pub fn short_type(&self) -> &str {
        self.event_type.rsplit("::").next().unwrap_or(&self.event_type)
    }
}

/// A page of events with pagination metadata.
#[derive(Debug, Clone, Deserialize)]
pub struct EventPage {
    pub data: Vec<SuiEvent>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<EventId>,
    #[serde(rename = "hasNextPage")]
    pub has_next_page: bool,
}

#[derive(Clone)]
pub struct SuiClient {
    http: reqwest::Client,
    url: String,
}

impl SuiClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            url: url.into(),
        }
    }

    /// Issue a JSON-RPC call and deserialize the `result` field.
    pub async fn rpc<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: Value,
    ) -> Result<T> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        // Public fullnodes intermittently rate-limit (HTTP 429) or return gateway
        // HTML / empty bodies. Read the body as text, check the status, and retry
        // transient failures with exponential backoff before giving up — and when
        // we do give up, surface the status + a body snippet instead of an opaque
        // "expected ident at line 1 column 2" JSON-decode error.
        const MAX_ATTEMPTS: u32 = 4;
        let mut attempt = 0u32;
        let resp: Value = loop {
            attempt += 1;
            let send = self.http.post(&self.url).json(&body).send().await;
            let http_resp = match send {
                Ok(r) => r,
                Err(e) if attempt < MAX_ATTEMPTS => {
                    backoff(attempt, &format!("send failed: {e}")).await;
                    continue;
                }
                Err(e) => return Err(e.into()),
            };

            let status = http_resp.status();
            let text = http_resp.text().await.unwrap_or_default();

            let retryable = status.as_u16() == 429 || status.is_server_error();
            if !status.is_success() {
                if retryable && attempt < MAX_ATTEMPTS {
                    backoff(attempt, &format!("http {}", status.as_u16())).await;
                    continue;
                }
                return Err(SuiError::Transport {
                    status: status.as_u16(),
                    body: snippet(&text),
                });
            }

            match serde_json::from_str::<Value>(&text) {
                Ok(v) => break v,
                // 2xx but not JSON → almost always a transient proxy/CDN page.
                Err(_) if attempt < MAX_ATTEMPTS => {
                    backoff(attempt, "non-JSON body").await;
                    continue;
                }
                Err(_) => {
                    return Err(SuiError::Transport {
                        status: status.as_u16(),
                        body: snippet(&text),
                    });
                }
            }
        };

        if let Some(err) = resp.get("error") {
            return Err(SuiError::Rpc {
                code: err.get("code").and_then(Value::as_i64).unwrap_or(0),
                message: err
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
            });
        }
        let result = resp.get("result").cloned().unwrap_or(Value::Null);
        Ok(serde_json::from_value(result)?)
    }

    /// Query events emitted by a given package + module, oldest first.
    ///
    /// Uses `MoveEventModule` (not `MoveModule`): it matches on the package that
    /// *defines* the event type — the type-origin — which stays the ORIGINAL
    /// package id across upgrades. `MoveModule` matches the package that *emitted*
    /// the call (the latest upgraded id), so after a package upgrade it silently
    /// drops every stream created against the new id. `package` here must be the
    /// original/defining package.
    pub async fn query_events(
        &self,
        package: &str,
        module: &str,
        cursor: Option<&EventId>,
        limit: u32,
    ) -> Result<EventPage> {
        let filter = json!({ "MoveEventModule": { "package": package, "module": module } });
        let cursor = cursor
            .map(|c| json!({ "txDigest": c.tx_digest, "eventSeq": c.event_seq }))
            .unwrap_or(Value::Null);
        self.rpc(
            "suix_queryEvents",
            json!([filter, cursor, limit, false]),
        )
        .await
    }

    /// Fetch a single object with its content (BCS-decoded fields as JSON).
    pub async fn get_object(&self, id: &str) -> Result<Value> {
        self.rpc(
            "sui_getObject",
            json!([id, { "showContent": true, "showType": true }]),
        )
        .await
    }
}
