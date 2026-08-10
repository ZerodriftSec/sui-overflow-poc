//! Domain types shared across the indexer and keeper. These mirror the Move
//! `Stream` object and the events it emits.

use serde::{Deserialize, Serialize};

/// USDC has 6 decimals on Sui. 1 USDC = 1_000_000 base units.
pub const USDC_DECIMALS: u32 = 6;
pub const USDC_BASE: u64 = 1_000_000;
/// Gasless floor: 1.00 USDC per transfer = 1_000_000 base units. Set so each
/// on-chain drip moves enough value that the ~0.004 SUI settlement gas is <1% of
/// it; at the old 0.01 USDC floor, gas rivalled the amount being streamed.
pub const MIN_DRIP_BASE: u64 = 1_000_000;

/// On-chain stream state machine
/// (LOCKED → PENDING → DRIPPING → PAUSED/SUSPENDED → DONE).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamState {
    Locked,
    PendingReview,
    Dripping,
    Paused,
    Done,
    /// Org payroll hold (sender can resume alone).
    Suspended,
}

impl StreamState {
    pub fn as_str(&self) -> &'static str {
        match self {
            StreamState::Locked => "locked",
            StreamState::PendingReview => "pending_review",
            StreamState::Dripping => "dripping",
            StreamState::Paused => "paused",
            StreamState::Done => "done",
            StreamState::Suspended => "suspended",
        }
    }

    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(StreamState::Locked),
            1 => Some(StreamState::PendingReview),
            2 => Some(StreamState::Dripping),
            3 => Some(StreamState::Paused),
            4 => Some(StreamState::Done),
            5 => Some(StreamState::Suspended),
            _ => None,
        }
    }
}

/// A milestone within a stream — paid out once approved.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub index: u64,
    pub name: String,
    /// Amount in base units (USDC * 1e6).
    pub amount: u64,
}

/// One leg of a split: where a fraction of each drip is routed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitLeg {
    pub destination: String,
    /// Basis points; all legs must sum to 10_000.
    pub weight_bps: u16,
    /// If true, route into a lending/yield protocol instead of a wallet.
    pub yield_flag: bool,
}

/// Cached view of a Stream shared object, as the indexer stores and serves it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stream {
    pub id: String,
    pub sender: String,
    pub freelancer: String,
    pub coin_type: String,
    pub total: u64,
    pub remaining: u64,
    pub state: StreamState,
    pub current_milestone: u64,
    pub milestones: Vec<Milestone>,
    pub splits: Vec<SplitLeg>,
    /// Total stream duration in ms. Accrual is `total * elapsed / duration`,
    /// kept proportional (not a truncated per-ms rate) for sub-unit precision.
    pub duration_ms: u64,
    /// Computed drip interval enforcing the 0.01 USDC gasless floor.
    pub drip_interval_ms: u64,
    /// Watermark: last settlement timestamp (ms since epoch).
    pub last_drip_ms: u64,
    /// Review deadline for the current milestone (ms), if PENDING_REVIEW.
    pub review_deadline_ms: Option<u64>,
    pub created_at_ms: u64,
}
