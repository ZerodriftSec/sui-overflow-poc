// Stub propbook::registry — offline test surface for parlay624_tests setup.
#[test_only]
module propbook::registry;

use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};
use sui::transfer;
use propbook::pyth_feed::{Self, PythFeed};

public struct OracleRegistry has key {
    id: UID,
}

public fun init_for_testing(ctx: &mut TxContext) {
    transfer::share_object(OracleRegistry { id: object::new(ctx) });
}

/// Create + share a PythFeed on chain and return its id.
public fun create_and_share_pyth_feed(_reg: &mut OracleRegistry, _source: u32, ctx: &mut TxContext): ID {
    let feed = pyth_feed::create(ctx);
    let id = object::id(&feed);
    transfer::share_object(feed);
    id
}
