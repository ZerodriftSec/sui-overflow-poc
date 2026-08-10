// Stub deepbook_predict::oracle_helper — test-only factory functions used by
// yolev::parlay_tests. Mirrors the real package's `create_settled_oracle` and
// `create_simple_oracle` signatures.
#[test_only]
module deepbook_predict::oracle_helper;

use sui::tx_context::TxContext;
use sui::clock::Clock;
use deepbook_predict::oracle::{Self, OracleSVI};

/// Settled oracle frozen at `price`, with `settle_at_ms` recorded.
public fun create_settled_oracle(price: u64, _settle_at_ms: u64, ctx: &mut TxContext): OracleSVI {
    oracle::create_settled(price, ctx)
}

/// Unsettled oracle + its clock. Matches the real signature.
public fun create_simple_oracle(
    _strike: u64,
    _price: u64,
    _settle_at_ms: u64,
    _now: u64,
    ctx: &mut TxContext,
): (OracleSVI, Clock) {
    oracle::create_unsettled(ctx)
}
