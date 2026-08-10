// Stub deepbook_predict::oracle for offline test compilation. The real package
// is not vendored in this checkout; we provide the API surface that the
// yolev::parlay module + its tests touch. Tests that resolve legs against a
// "settled" oracle will read the price stored at construction time.
module deepbook_predict::oracle;

use sui::object::{Self, UID};
use sui::tx_context::TxContext;
use sui::clock::{Self as clock, Clock};

/// Stand-in for the venue's settled oracle object.
public struct OracleSVI has key {
    id: UID,
    settled: bool,
    settlement_price: u64,
}

public fun id(o: &OracleSVI): ID { object::id(o) }

public fun is_settled(o: &OracleSVI): bool { o.settled }

public fun settlement_price(o: &OracleSVI): std::option::Option<u64> {
    if (o.settled) {
        std::option::some(o.settlement_price)
    } else {
        std::option::none()
    }
}

#[test_only]
public fun create_settled(price: u64, ctx: &mut TxContext): OracleSVI {
    OracleSVI {
        id: object::new(ctx),
        settled: true,
        settlement_price: price,
    }
}

#[test_only]
public fun create_unsettled(ctx: &mut TxContext): (OracleSVI, Clock) {
    let clk = clock::create_for_testing(ctx);
    (
        OracleSVI {
            id: object::new(ctx),
            settled: false,
            settlement_price: 0,
        },
        clk,
    )
}
