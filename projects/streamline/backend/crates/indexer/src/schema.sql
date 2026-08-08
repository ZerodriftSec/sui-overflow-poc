-- StreamLine indexer schema. Applied on startup (idempotent).

CREATE TABLE IF NOT EXISTS streams (
    id                  TEXT PRIMARY KEY,
    sender              TEXT NOT NULL,
    freelancer          TEXT NOT NULL,
    coin_type           TEXT NOT NULL DEFAULT '',
    total               BIGINT NOT NULL DEFAULT 0,
    remaining           BIGINT NOT NULL DEFAULT 0,
    state               TEXT NOT NULL DEFAULT 'locked',
    current_milestone   BIGINT NOT NULL DEFAULT 0,
    n_milestones        BIGINT NOT NULL DEFAULT 0,
    duration_ms         BIGINT NOT NULL DEFAULT 0,
    drip_interval_ms    BIGINT NOT NULL DEFAULT 0,
    last_drip_ms        BIGINT NOT NULL DEFAULT 0,
    review_deadline_ms  BIGINT,
    created_at_ms       BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_streams_freelancer ON streams (freelancer);
CREATE INDEX IF NOT EXISTS idx_streams_sender ON streams (sender);
CREATE INDEX IF NOT EXISTS idx_streams_state ON streams (state);

CREATE TABLE IF NOT EXISTS drip_history (
    id            BIGSERIAL PRIMARY KEY,
    stream_id     TEXT NOT NULL,
    amount        BIGINT NOT NULL,
    timestamp_ms  BIGINT NOT NULL,
    tx_digest     TEXT
);

CREATE INDEX IF NOT EXISTS idx_drip_stream ON drip_history (stream_id);

-- Unified compliance / audit timeline (streams + disputes + gift cards).
CREATE TABLE IF NOT EXISTS audit_events (
    id            BIGSERIAL PRIMARY KEY,
    kind          TEXT NOT NULL,
    module        TEXT NOT NULL DEFAULT 'stream',
    subject_id    TEXT NOT NULL DEFAULT '',
    sender        TEXT NOT NULL DEFAULT '',
    counterparty  TEXT NOT NULL DEFAULT '',
    amount        BIGINT NOT NULL DEFAULT 0,
    amount_b      BIGINT NOT NULL DEFAULT 0,
    meta_json     TEXT NOT NULL DEFAULT '{}',
    timestamp_ms  BIGINT NOT NULL DEFAULT 0,
    tx_digest     TEXT NOT NULL DEFAULT '',
    UNIQUE (tx_digest, kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_sender ON audit_events (sender);
CREATE INDEX IF NOT EXISTS idx_audit_counterparty ON audit_events (counterparty);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events (subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events (timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_events (kind);

-- Per-module poll cursors (id=1 stream, id=2 giftcard).
CREATE TABLE IF NOT EXISTS poll_cursor (
    id         INT PRIMARY KEY DEFAULT 1,
    tx_digest  TEXT,
    event_seq  TEXT
);
