//! On-chain events emitted by the StreamLine Move package. The indexer
//! subscribes to these and derives stream state from them.

use serde::{Deserialize, Serialize};

/// Event type tags as they appear in `MoveEvent.type` (after the package id):
/// `<pkg>::stream::StreamCreated`, etc.
pub const EV_CREATED: &str = "StreamCreated";
pub const EV_MILESTONE_RAISED: &str = "MilestoneRaised";
pub const EV_MILESTONE_APPROVED: &str = "MilestoneApproved";
pub const EV_DRIPPED: &str = "StreamDripped";
pub const EV_PAUSED: &str = "StreamPaused";
pub const EV_SUSPENDED: &str = "StreamSuspended";
pub const EV_RESUMED: &str = "StreamResumed";
pub const EV_STOPPED: &str = "StreamStopped";
pub const EV_RESOLUTION_PROPOSED: &str = "ResolutionProposed";
pub const EV_DISPUTE_RESOLVED: &str = "DisputeResolved";

/// Gift-card module (`streamline::giftcard`).
pub const EV_GIFT_CREATED: &str = "GiftCardCreated";
pub const EV_GIFT_CLAIMED: &str = "GiftCardClaimed";
pub const EV_GIFT_CANCELLED: &str = "GiftCardCancelled";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamCreated {
    pub stream_id: String,
    pub sender: String,
    pub freelancer: String,
    pub total: u64,
    pub n_milestones: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneRaised {
    pub stream_id: String,
    pub milestone_index: u64,
    pub review_deadline_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MilestoneApproved {
    pub stream_id: String,
    pub milestone_index: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDripped {
    pub stream_id: String,
    /// Total amount settled this drip, base units.
    pub amount: u64,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamPaused {
    pub stream_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamSuspended {
    pub stream_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamResumed {
    pub stream_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStopped {
    pub stream_id: String,
    pub freelancer_paid: u64,
    pub refunded: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionProposed {
    pub stream_id: String,
    pub proposer: String,
    pub resume: bool,
    pub freelancer_bps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisputeResolved {
    pub stream_id: String,
    pub resumed: bool,
    pub freelancer_amount: u64,
    pub sender_amount: u64,
}

/// A decoded StreamLine event tagged by kind, carrying the originating tx digest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    Created(StreamCreated),
    MilestoneRaised(MilestoneRaised),
    MilestoneApproved(MilestoneApproved),
    Dripped(StreamDripped),
    Paused(StreamPaused),
    Suspended(StreamSuspended),
    Resumed(StreamResumed),
    Stopped(StreamStopped),
    ResolutionProposed(ResolutionProposed),
    DisputeResolved(DisputeResolved),
}

impl StreamEvent {
    /// The stream id this event pertains to.
    pub fn stream_id(&self) -> &str {
        match self {
            StreamEvent::Created(e) => &e.stream_id,
            StreamEvent::MilestoneRaised(e) => &e.stream_id,
            StreamEvent::MilestoneApproved(e) => &e.stream_id,
            StreamEvent::Dripped(e) => &e.stream_id,
            StreamEvent::Paused(e) => &e.stream_id,
            StreamEvent::Suspended(e) => &e.stream_id,
            StreamEvent::Resumed(e) => &e.stream_id,
            StreamEvent::Stopped(e) => &e.stream_id,
            StreamEvent::ResolutionProposed(e) => &e.stream_id,
            StreamEvent::DisputeResolved(e) => &e.stream_id,
        }
    }
}
