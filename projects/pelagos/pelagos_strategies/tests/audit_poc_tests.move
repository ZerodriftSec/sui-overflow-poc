#[test_only]
module pelagos_strategies::audit_poc_tests;

use pelagos_strategies::structured_note::{Self as note, Note, NotePosition};
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as ts};

public struct TESTCOIN has drop {}

/// PoC for finding DB-4894 (High): the structured_note waterfall payout
/// breaks principal protection because `redeem` clamps each individual payout
/// to the *current* pool balance with no solvency / pro-rata distribution at
/// `settle` time. An early redeemer withdraws the full nominal `settled_out`
/// (here 140 against a 100-principal position) and leaves the residual holder
/// to absorb the entire shortfall on the funded reserve.
///
/// Scenario (from the finding):
///   - floor_bps = 10_000 (100% principal protection promised).
///   - A deposits 100, B deposits 100 (pool = 200, total_shares = 200).
///   - Admin funds 20 of reserve (pool = 220).
///   - settle(payout_num = 140, payout_den = 100) -> settled_out per share = 140.
///   - A redeems: max(floor_out=100, settled_out=140) = 140, clamped to 220 -> 140.
///     Pool now 80, B's position is still owed 140.
///   - B redeems: max(floor_out=100, settled_out=140) = 140, clamped to 80 -> 80.
///     B receives 80 despite a "100% principal protection" guarantee, losing 20
///     of principal to the early redeemer.
#[test]
fun poc_waterfall_breaks_principal_protection() {
    let admin = @0xA;
    let alice = @0xB;
    let bob = @0xC;
    let mut sc = ts::begin(admin);

    // 100% principal-protection note.
    note::create_note<TESTCOIN>(10_000, b"PPN", 0, 1, ts::ctx(&mut sc));

    // Alice deposits 100.
    ts::next_tx(&mut sc, alice);
    {
        let mut n = ts::take_shared<Note<TESTCOIN>>(&sc);
        let c = coin::mint_for_testing<TESTCOIN>(100, ts::ctx(&mut sc));
        note::deposit<TESTCOIN>(&mut n, c, b"A", ts::ctx(&mut sc));
        ts::return_shared(n);
    };

    // Bob deposits 100 -> pool 200, total_shares 200.
    ts::next_tx(&mut sc, bob);
    {
        let mut n = ts::take_shared<Note<TESTCOIN>>(&sc);
        assert!(note::pool_value(&n) == 100, 0); // pre-Bob pool = Alice's 100
        assert!(note::total_shares(&n) == 100, 1);
        let c = coin::mint_for_testing<TESTCOIN>(100, ts::ctx(&mut sc));
        note::deposit<TESTCOIN>(&mut n, c, b"B", ts::ctx(&mut sc));
        assert!(note::pool_value(&n) == 200, 2);
        assert!(note::total_shares(&n) == 200, 3);
        ts::return_shared(n);
    };

    // Admin funds 20 of reserve -> pool 220.
    ts::next_tx(&mut sc, admin);
    {
        let cap = ts::take_from_sender<note::NoteAdminCap>(&sc);
        let mut n = ts::take_shared<Note<TESTCOIN>>(&sc);
        let up = coin::mint_for_testing<TESTCOIN>(20, ts::ctx(&mut sc));
        note::fund<TESTCOIN>(&cap, &mut n, up);
        assert!(note::pool_value(&n) == 220, 4);

        // Settle at 140 / 100 -> each 100-share position is owed settled_out = 140.
        note::settle<TESTCOIN>(&cap, &mut n, 140, 100);
        assert!(note::is_settled(&n), 5);
        ts::return_shared(n);
        ts::return_to_sender(&sc, cap);
    };

    // Alice redeems first: receives 140, pool drops to 80.
    ts::next_tx(&mut sc, alice);
    {
        let mut n = ts::take_shared<Note<TESTCOIN>>(&sc);
        let pos = ts::take_from_sender<NotePosition<TESTCOIN>>(&sc);
        note::redeem<TESTCOIN>(&mut n, pos, ts::ctx(&mut sc));
        assert!(note::pool_value(&n) == 80, 6);
        assert!(note::total_shares(&n) == 100, 7);
        ts::return_shared(n);
    };
    ts::next_tx(&mut sc, alice);
    {
        let c = ts::take_from_sender<Coin<TESTCOIN>>(&sc);
        assert!(coin::value(&c) == 140, 8);
        coin::burn_for_testing(c);
    };

    // Bob redeems last: only 80 remains in the pool. Even though floor_bps =
    // 10_000 promised him his full 100 principal, the per-call clamp caps the
    // payout to the live pool balance -> Bob gets 80, losing 20 of principal.
    ts::next_tx(&mut sc, bob);
    {
        let mut n = ts::take_shared<Note<TESTCOIN>>(&sc);
        let pos = ts::take_from_sender<NotePosition<TESTCOIN>>(&sc);
        note::redeem<TESTCOIN>(&mut n, pos, ts::ctx(&mut sc));
        assert!(note::pool_value(&n) == 0, 9);
        ts::return_shared(n);
    };
    ts::next_tx(&mut sc, bob);
    {
        let c = ts::take_from_sender<Coin<TESTCOIN>>(&sc);
        // BUG: Bob should receive >= 100 (floor) but only gets 80.
        assert!(coin::value(&c) == 80, 10);
        coin::burn_for_testing(c);
    };

    ts::end(sc);
}
