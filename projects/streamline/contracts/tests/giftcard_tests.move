/// Gift-card create + auth tests using the wrap fixture from confidential_balance.
/// Claim/cancel happy-path proofs need a dedicated UNWRAP_PROOF for the same
/// (commitment, amount) — WRAP_VK ≠ UNWRAP_VK, so WRAP_PROOF cannot stand in.
#[test_only]
#[allow(implicit_const_copy)]
module streamline::giftcard_tests;

use streamline::giftcard::{Self, GiftCard, GiftCardVault};
use sui::clock;
use sui::coin;
use sui::hash;
use sui::test_scenario as ts;

public struct TESTUSDC has drop {}

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;

/// Poseidon commitment for wrap of 500_000_000 (from confidential_balance_tests).
const C_AMOUNT: vector<u8> = x"596ab085862e0366f42e04de276f2b77725fb116487c2b1977efb7f72c999805";
const WRAP_PROOF: vector<u8> = x"4f6cf555097020f2c629344d0fa18129cf23bc0e02b654e3f66aacb6a547808376070b8cfa42db74e1a19cf807bb62f4bdc203fab13cb9aa84c9c50561b0be1124b4b81d55697e8256682367eeadc6b343f2bfd8adbeeadc5575aa5ab94b9d8a01ac5f3b129f9a062ed43aff13d0958485eba209f15ee6f7ea61b2dc1e23e015";
const AMOUNT: u64 = 500_000_000;

#[test]
fun create_hides_amount_in_vault() {
    let mut sc = ts::begin(ALICE);
    let secret = b"streamline-giftcard-secret";
    let claim_hash = hash::blake2b256(&secret);

    giftcard::create_vault<TESTUSDC>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ALICE);
    {
        let mut vault = ts::take_shared<GiftCardVault<TESTUSDC>>(&sc);
        let c = coin::mint_for_testing<TESTUSDC>(AMOUNT, ts::ctx(&mut sc));
        giftcard::create(
            &mut vault,
            c,
            C_AMOUNT,
            WRAP_PROOF,
            claim_hash,
            std::string::utf8(b"coffee"),
            0,
            ts::ctx(&mut sc),
        );
        assert!(giftcard::reserve(&vault) == AMOUNT, 0);
        ts::return_shared(vault);
    };

    ts::next_tx(&mut sc, ALICE);
    {
        let card = ts::take_shared<GiftCard>(&sc);
        assert!(!giftcard::claimed(&card), 1);
        assert!(giftcard::amount_commitment(&card) == C_AMOUNT, 2);
        assert!(giftcard::note(&card) == std::string::utf8(b"coffee"), 3);
        // No plaintext amount field — only commitment + vault reserve.
        ts::return_shared(card);
    };

    ts::end(sc);
}

#[test, expected_failure(abort_code = streamline::giftcard::EBadSecret)]
fun bad_secret_aborts_before_unwrap() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(ts::ctx(&mut sc));
    let claim_hash = hash::blake2b256(&b"right");

    giftcard::create_vault<TESTUSDC>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ALICE);
    {
        let mut vault = ts::take_shared<GiftCardVault<TESTUSDC>>(&sc);
        let c = coin::mint_for_testing<TESTUSDC>(AMOUNT, ts::ctx(&mut sc));
        giftcard::create(
            &mut vault,
            c,
            C_AMOUNT,
            WRAP_PROOF,
            claim_hash,
            std::string::utf8(b""),
            0,
            ts::ctx(&mut sc),
        );
        ts::return_shared(vault);
    };

    ts::next_tx(&mut sc, BOB);
    {
        let mut vault = ts::take_shared<GiftCardVault<TESTUSDC>>(&sc);
        let mut card = ts::take_shared<GiftCard>(&sc);
        // Aborts on secret check before unwrap VK is consulted.
        let paid = giftcard::claim(
            &mut vault,
            &mut card,
            b"wrong",
            AMOUNT,
            WRAP_PROOF,
            &clk,
            ts::ctx(&mut sc),
        );
        transfer::public_transfer(paid, BOB);
        ts::return_shared(card);
        ts::return_shared(vault);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

#[test, expected_failure(abort_code = streamline::giftcard::ENotSender)]
fun non_sender_cannot_cancel() {
    let mut sc = ts::begin(ALICE);
    let claim_hash = hash::blake2b256(&b"x");

    giftcard::create_vault<TESTUSDC>(ts::ctx(&mut sc));

    ts::next_tx(&mut sc, ALICE);
    {
        let mut vault = ts::take_shared<GiftCardVault<TESTUSDC>>(&sc);
        let c = coin::mint_for_testing<TESTUSDC>(AMOUNT, ts::ctx(&mut sc));
        giftcard::create(
            &mut vault,
            c,
            C_AMOUNT,
            WRAP_PROOF,
            claim_hash,
            std::string::utf8(b""),
            0,
            ts::ctx(&mut sc),
        );
        ts::return_shared(vault);
    };

    ts::next_tx(&mut sc, BOB);
    {
        let mut vault = ts::take_shared<GiftCardVault<TESTUSDC>>(&sc);
        let mut card = ts::take_shared<GiftCard>(&sc);
        let refund = giftcard::cancel(
            &mut vault,
            &mut card,
            AMOUNT,
            WRAP_PROOF,
            ts::ctx(&mut sc),
        );
        transfer::public_transfer(refund, BOB);
        ts::return_shared(card);
        ts::return_shared(vault);
    };

    ts::end(sc);
}
