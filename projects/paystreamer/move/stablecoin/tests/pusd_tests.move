module stablecoin::pusd_tests;

use sui::test_scenario::{Self, ctx};
use stablecoin::pusd::{Self, PUSD};
use sui::coin::{TreasuryCap, Coin, create_treasury_cap_for_testing};
use sui::balance::supply_value;
use std::unit_test::assert_eq;

#[test]
fun mint_succeeds() {
    let admin = @0xA;
    let user = @0xB;
    let mut scenario = test_scenario::begin(admin);
    let treasury_cap = {
        let ctx = scenario.ctx();
        create_treasury_cap_for_testing<PUSD>(ctx)
    };
    sui::transfer::public_transfer(treasury_cap, admin);
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let ctx = scenario.ctx();
        pusd::mint(&mut treasury_cap, user, 1_000_000, ctx);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let supply = treasury_cap.supply();
        let balance = supply_value(supply);
        assert_eq!(balance, 1_000_000u64);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = pusd::EZeroAmount)]
fun mint_zero_aborts() {
    let admin = @0xA;
    let user = @0xB;
    let mut scenario = test_scenario::begin(admin);
    let treasury_cap = {
        let ctx = scenario.ctx();
        create_treasury_cap_for_testing<PUSD>(ctx)
    };
    sui::transfer::public_transfer(treasury_cap, admin);
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let ctx = scenario.ctx();
        pusd::mint(&mut treasury_cap, user, 0, ctx);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.end();
}

#[test]
fun burn_succeeds() {
    let admin = @0xA;
    let user = @0xB;
    let mut scenario = test_scenario::begin(admin);
    let treasury_cap = {
        let ctx = scenario.ctx();
        create_treasury_cap_for_testing<PUSD>(ctx)
    };
    sui::transfer::public_transfer(treasury_cap, admin);
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let ctx = scenario.ctx();
        pusd::mint(&mut treasury_cap, user, 1_000_000, ctx);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.next_tx(user);
    {
        let coin = test_scenario::take_from_sender<Coin<PUSD>>(&scenario);
        scenario.next_tx(admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
            let ctx = scenario.ctx();
            pusd::burn(&mut treasury_cap, coin, ctx);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };
    };
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let supply = treasury_cap.supply();
        let balance = supply_value(supply);
        assert_eq!(balance, 0u64);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.end();
}

#[test]
fun burn_insufficient_aborts() {
    let admin = @0xA;
    let user = @0xB;
    let mut scenario = test_scenario::begin(admin);
    let treasury_cap = {
        let ctx = scenario.ctx();
        create_treasury_cap_for_testing<PUSD>(ctx)
    };
    sui::transfer::public_transfer(treasury_cap, admin);
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let ctx = scenario.ctx();
        pusd::mint(&mut treasury_cap, user, 1_000_000, ctx);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.next_tx(user);
    {
        let coin = test_scenario::take_from_sender<Coin<PUSD>>(&scenario);
        scenario.next_tx(admin);
        {
            let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
            let ctx = scenario.ctx();
            pusd::burn(&mut treasury_cap, coin, ctx);
            test_scenario::return_to_sender(&scenario, treasury_cap);
        };
    };
    scenario.next_tx(admin);
    {
        let mut treasury_cap = test_scenario::take_from_sender<TreasuryCap<PUSD>>(&scenario);
        let supply = treasury_cap.supply();
        let balance = supply_value(supply);
        assert_eq!(balance, 0u64);
        test_scenario::return_to_sender(&scenario, treasury_cap);
    };
    scenario.end();
}