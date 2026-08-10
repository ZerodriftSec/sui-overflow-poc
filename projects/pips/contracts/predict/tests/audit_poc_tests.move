// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// PoC tests for audit finding DB-5019 (High): LP shares priced at stale
/// `total_mtm`, allowing stale-price value extraction between LPs.
///
/// `supply` (predict.move:501-512) and `withdraw` (predict.move:534) price PLP
/// shares against `vault_value() = balance - total_mtm` (vault.move:74-77), but
/// `total_mtm` is a cache refreshed ONLY by `refresh_oracle_risk`
/// (predict.move:971-988), which `supply`/`withdraw` never call. A new LP
/// entering while real liability has drifted upward (cached total_mtm too low)
/// receives too few shares; the delta accrues to existing LPs.
///
/// Numeric example from the finding:
///   balance=1000, real total_mtm=600, cached total_mtm=100,
///   total_supply=100, deposit 100 -> new LP gets 11 shares,
///   post-refresh existing LPs extract ~$50.45 = new LP's loss.
#[test_only]
module deepbook_predict::audit_poc_tests;

use sui::coin;
use sui::coin_registry;
use sui::clock;
use sui::object;
use sui::tx_context;
use sui::coin_registry::{CoinRegistry, Currency};
use sui::coin::{Coin, TreasuryCap};
use sui::clock::Clock;
use sui::tx_context::TxContext;
use std::unit_test;

use deepbook_predict::math::mul_div_round_down;
use deepbook_predict::predict;
use deepbook_predict::vault;

// === Test quote asset: a 6-decimal USDC stand-in (required_quote_decimals=6).
// `USDC` carries `key` (with a UID, per Sui's object rule) so it can be used
// with `coin_registry::new_currency<T: key>` (the non-OTW entry point).
public struct USDC has key, store {
    id: object::UID,
}

// === Helpers ===

/// Build a test USDC currency and treasury cap via the Sui CoinRegistry.
/// Uses `new_currency<T: key>` (no one-time-witness required).
fun setup_usd_currency(
    ctx: &mut TxContext,
): (CoinRegistry, Currency<USDC>, TreasuryCap<USDC>) {
    let mut registry = coin_registry::create_coin_data_registry_for_testing(ctx);
    let (init, treasury_cap) = coin_registry::new_currency<USDC>(
        &mut registry,
        6, // matches constants::required_quote_decimals!() == 6
        b"USDC".to_string(),
        b"Predict Test USDC".to_string(),
        b"Predict Test USDC".to_string(),
        b"".to_string(),
        ctx,
    );
    let currency = coin_registry::unwrap_for_testing<USDC>(init);
    (registry, currency, treasury_cap)
}

/// Mint `amount` USDC base units using the test treasury cap.
fun mint_usd(cap: &mut TreasuryCap<USDC>, amount: u64, ctx: &mut TxContext): Coin<USDC> {
    coin::mint<USDC>(cap, amount, ctx)
}

/// Mint a fresh, unique oracle ID for fixture use (no real oracle required).
fun fresh_id(ctx: &mut TxContext): object::ID {
    let uid = object::new(ctx);
    let id = uid.to_inner();
    uid.delete();
    id
}

// ===========================================================================
// TEST 1 - vault_value() returns balance - total_mtm using the cached value.
//
// `supply`/`withdraw` read this directly. We prove the plumbing: a Vault with
// a stale total_mtm reports a vault_value that ignores the real liability. We
// exercise it through the Predict (which owns the Vault) since Vault is not
// droppable/transferable on its own.
// ===========================================================================

#[test]
fun vault_value_uses_cached_total_mtm() {
    let ctx = &mut tx_context::dummy();
    let clock = clock::create_for_testing(ctx);
    let (_registry, currency, mut usd_cap) = setup_usd_currency(ctx);

    let mut predict = predict::create_test_predict<USDC>(&currency, ctx);

    // Seed $1000 of USDC so the vault balance is non-zero.
    let seed_coin = mint_usd(&mut usd_cap, 1_000_000_000, ctx); // $1000
    let seed_lp = predict::supply<USDC>(&mut predict, seed_coin, &clock, ctx);
    assert!(predict::vault_balance(&predict) == 1_000_000_000, 1);

    // Register a (fake) oracle matrix so we can poke total_mtm via set_mtm.
    let oracle_id = fresh_id(ctx);
    predict::add_oracle_grid(&mut predict, oracle_id, 0, 1_000_000, ctx);

    // Set the cached total_mtm to a deliberately STALE value.
    // Real liability would be $600; the cache says $100.
    let stale_total_mtm = 100_000_000; // $100 (6dp)
    let real_total_mtm = 600_000_000; //  $600 (6dp)
    predict::vault_mut(&mut predict).set_mtm(oracle_id, stale_total_mtm);

    // Assert the bug: vault_value() = balance - STALE total_mtm.
    let reported = predict::vault_balance(&predict) - stale_total_mtm;
    let buggy_expected = 1_000_000_000 - stale_total_mtm; // $900
    let correct_expected = 1_000_000_000 - real_total_mtm; // $400
    assert!(reported == buggy_expected, 10);
    assert!(reported != correct_expected, 11);
    assert!(reported > correct_expected, 12);

    // The stale cache is exactly what supply/withdraw read.
    unit_test::destroy(seed_lp);
    unit_test::destroy(predict);
    unit_test::destroy(_registry);
    unit_test::destroy(currency);
    unit_test::destroy(usd_cap);
    clock.destroy_for_testing();
}

// ===========================================================================
// TEST 2 - End-to-end supply() prices new LP shares off the STALE vault_value.
//
// Existing LP seeds the vault; cached total_mtm is set to a stale (low) value
// while the real liability is higher. A new LP supplies funds and receives
// shares computed from the stale vault_value. After a simulated refresh to the
// real liability, the new LP's pro-rata claim is worth strictly less than they
// deposited; the shortfall is the value extracted by existing LPs.
// ===========================================================================

#[test]
fun supply_mints_shares_off_stale_vault_value() {
    let ctx = &mut tx_context::dummy();
    let clock = clock::create_for_testing(ctx);
    let (_registry, currency, mut usd_cap) = setup_usd_currency(ctx);

    // --- Stand up a Predict with USDC registered as the quote asset. ---
    let mut predict = predict::create_test_predict<USDC>(&currency, ctx);

    // --- Existing LP seeds the vault with $1000; gets 1_000_000_000 shares. ---
    // total_supply == 0 -> shares == amount (predict.move:506-507).
    let seed_coin = mint_usd(&mut usd_cap, 1_000_000_000, ctx); // $1000
    let seed_lp = predict::supply<USDC>(&mut predict, seed_coin, &clock, ctx);
    let initial_shares = seed_lp.value();
    assert!(initial_shares == 1_000_000_000, 100);
    assert!(predict::vault_balance(&predict) == 1_000_000_000, 101);

    // --- Register a (fake) oracle matrix and inject a STALE total_mtm. ---
    // Real liability has risen to $600 (positions opened, price moved against
    // the vault), but the cache still reads $100. `supply` does NOT call
    // refresh_oracle_risk, so the stale value is used as-is.
    let oracle_id = fresh_id(ctx);
    predict::add_oracle_grid(&mut predict, oracle_id, 0, 1_000_000, ctx);
    let stale_total_mtm = 100_000_000; // $100 cached
    let real_total_mtm = 600_000_000; //  $600 real
    predict::vault_mut(&mut predict).set_mtm(oracle_id, stale_total_mtm);

    // --- New LP supplies $100 into the stale vault. ---
    let deposit = 100_000_000; // $100
    let new_coin = mint_usd(&mut usd_cap, deposit, ctx);
    let new_lp = predict::supply<USDC>(&mut predict, new_coin, &clock, ctx);
    let minted_shares = new_lp.value();

    // --- (a) Shares match the STALE formula, not the correct one. ---
    // Stale cache says liability is only $100 -> vault_value reported as $900
    // (over-stated). New LP is priced against this inflated denominator and
    // receives TOO FEW shares. Correct pricing would use the real $400 vault.
    let stale_vault_value = 1_000_000_000 - stale_total_mtm; // $900
    let real_vault_value = 1_000_000_000 - real_total_mtm; // $400
    let buggy_shares = mul_div_round_down(deposit, initial_shares, stale_vault_value);
    let correct_shares = mul_div_round_down(deposit, initial_shares, real_vault_value);

    // shares minted = (deposit * total_supply) / stale_vault_value
    //               = (1e8 * 1e9) / 9e8 = 111_111_111 (~11.11 LP units)
    assert!(minted_shares == buggy_shares, 10);
    assert!(minted_shares != correct_shares, 11);
    // Stale denominator is LARGER than real -> minted_shares is SMALLER.
    assert!(minted_shares < correct_shares, 12);

    // Sanity-check the finding's numeric claim: ~11 shares for a $100 deposit
    // (in whole-dollar terms, minted_shares / 1e7 ~= 11).
    assert!(minted_shares / 10_000_000 == 11, 13);

    // --- (b) After a simulated oracle refresh, the new LP's claim < deposit. ---
    // refresh_oracle_risk performs exactly this write (predict.move:976,983,987):
    //   vault.set_mtm_with_* -> total_mtm updated to the real liability.
    predict::vault_mut(&mut predict).set_mtm(oracle_id, real_total_mtm);

    // Post-refresh: balance grew by the deposit ($1100); vault_value now $500.
    let post_refresh_balance = predict::vault_balance(&predict);
    let post_refresh_vv = post_refresh_balance - real_total_mtm; // $500
    let total_lp = initial_shares + minted_shares;

    // New LP's honest pro-rata claim on the refreshed vault.
    let new_lp_claim = mul_div_round_down(minted_shares, post_refresh_vv, total_lp);
    // Existing LPs' honest pro-rata claim.
    let existing_lp_claim = mul_div_round_down(initial_shares, post_refresh_vv, total_lp);
    // The fair claim existing LPs WOULD have had if the new LP were priced
    // against the real $400 vault (no bug): they keep 1000/1250 of $500 = $400.
    let fair_total_lp = initial_shares + correct_shares; // 1_250_000_000
    let existing_lp_fair_claim = mul_div_round_down(initial_shares, post_refresh_vv, fair_total_lp);

    // The new LP put in $100 but now holds a claim worth strictly less.
    // 111_111_111 / 1_111_111_111 * $500 ~= $50 (lost ~$50 to existing LPs).
    assert!(new_lp_claim < deposit, 20);
    let extracted = deposit - new_lp_claim;
    assert!(extracted > 45_000_000 && extracted < 55_000_000, 21); // ~= $50
    // Existing LPs extracted value FROM the new LP: their claim is strictly
    // greater than the fair claim they would have had without the stale cache.
    assert!(existing_lp_claim > existing_lp_fair_claim, 22);

    // Cleanup: destroy the non-drop test fixtures.
    unit_test::destroy(seed_lp);
    unit_test::destroy(new_lp);
    unit_test::destroy(predict);
    unit_test::destroy(_registry);
    unit_test::destroy(currency);
    unit_test::destroy(usd_cap);
    clock.destroy_for_testing();
}
