// Stub propbook::pyth_feed — offline test surface. Provides the small read API
// parlay624::parlay624 needs (an exact-stamp history with `normalized_spot_at`)
// and a test-only recorder its tests use to seed prints.
module propbook::pyth_feed;

use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};
use sui::table::{Self, Table};

/// Shared settlement feed. Real propbook stores a slotted Pyth history; this
/// stub keeps a single normalized price per stamp_ms — enough for parlay624
/// resolve_leg to read the same print the venue would.
public struct PythFeed has key {
    id: UID,
    /// stamp_ms → normalized 1e9 price.
    prints: Table<u64, u64>,
}

/// A successful read: holds the normalized 1e9 price; `read_value` extracts it.
public struct PriceRead has drop {
    value: u64,
}

public struct PriceOption has drop {
    inner: std::option::Option<PriceRead>,
}

public fun is_some(o: &PriceOption): bool { o.inner.is_some() }

public fun destroy_some(o: PriceOption): PriceRead {
    let PriceOption { inner } = o;
    inner.destroy_some()
}

public fun read_value(p: &PriceRead): u64 { p.value }

/// The venue-identical read: normalized 1e9 price at a stamp.
public fun normalized_spot_at(feed: &PythFeed, stamp_ms: u64): PriceOption {
    if (feed.prints.contains(stamp_ms)) {
        PriceOption { inner: std::option::some(PriceRead { value: *feed.prints.borrow(stamp_ms) }) }
    } else {
        PriceOption { inner: std::option::none() }
    }
}

/// Create + share a PythFeed (real propbook does this via registry; tests build
/// one through the registry stub which calls this).
public fun create(ctx: &mut TxContext): PythFeed {
    PythFeed { id: object::new(ctx), prints: table::new(ctx) }
}

#[test_only]
public fun record_raw_for_testing(
    feed: &mut PythFeed,
    price_magnitude: u64,
    _price_negative: bool,
    exponent_magnitude: u64,
    exponent_negative: bool,
    _source_timestamp_us: u64,
    update_timestamp_ms: u64,
    _insert_at: bool,
) {
    // expo=9 negative ⇒ ×1e9 normalization = identity (magnitude == normalized).
    // We support the only mode the tests use (1e9 scale).
    let normalized = if (exponent_magnitude == 9 && exponent_negative) {
        price_magnitude
    } else if (exponent_magnitude == 0) {
        price_magnitude
    } else {
        price_magnitude // best-effort for unsupported scales in tests
    };
    if (feed.prints.contains(update_timestamp_ms)) {
        *feed.prints.borrow_mut(update_timestamp_ms) = normalized;
    } else {
        feed.prints.add(update_timestamp_ms, normalized);
    }
}

#[test_only]
public fun new_for_testing(ctx: &mut TxContext): PythFeed { create(ctx) }
