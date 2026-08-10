/// ZK gift card — prepaid USDC in a shareable URL with amount hidden until claim.
/// Funds sit in a shared vault; each card stores only a Poseidon commitment.
/// Create binds the deposit with wrap.circom; claim/cancel reveal with unwrap.circom.
/// Sibling to request-links (pull invoices).
module streamline::giftcard;

use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;
use sui::transfer;
use streamline::confidential_balance;

// === Errors ===
const EZeroAmount: u64 = 0;
const ENotSender: u64 = 1;
const EAlreadyClaimed: u64 = 2;
const EBadSecret: u64 = 3;
const EExpired: u64 = 4;
const EEmptyHash: u64 = 5;
const EBadCommitment: u64 = 6;
const EInsufficientReserve: u64 = 7;

/// Aggregate reserve backing all gift cards for coin type `T`.
public struct GiftCardVault<phantom T> has key {
    id: UID,
    reserve: Balance<T>,
}

/// Shared gift card. Amount is only the Poseidon commitment until claim/cancel.
public struct GiftCard has key {
    id: UID,
    sender: address,
    /// blake2b256(secret) — secret lives only in the claim URL.
    claim_hash: vector<u8>,
    /// Poseidon(amount, blinding) — opening lives in the claim URL.
    amount_commitment: vector<u8>,
    note: String,
    /// 0 = never expires; otherwise ms since epoch.
    expires_ms: u64,
    claimed: bool,
}

public struct GiftCardCreated has copy, drop {
    card_id: ID,
    sender: address,
    expires_ms: u64,
}

public struct GiftCardClaimed has copy, drop {
    card_id: ID,
    claimer: address,
    amount: u64,
}

public struct GiftCardCancelled has copy, drop {
    card_id: ID,
    sender: address,
    amount: u64,
}

/// One-time shared vault for gift-card reserves.
public fun create_vault<T>(ctx: &mut TxContext) {
    transfer::share_object(GiftCardVault<T> {
        id: object::new(ctx),
        reserve: balance::zero(),
    });
}

/// Deposit `coin` into the vault and share a gift card bound to `commitment`
/// via wrap proof. `claim_hash` must be blake2b256(secret).
public fun create<T>(
    vault: &mut GiftCardVault<T>,
    coin: Coin<T>,
    commitment: vector<u8>,
    wrap_proof: vector<u8>,
    claim_hash: vector<u8>,
    note: String,
    expires_ms: u64,
    ctx: &mut TxContext,
) {
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    assert!(!claim_hash.is_empty(), EEmptyHash);
    assert!(commitment.length() == confidential_balance::scalar_len(), EBadCommitment);

    confidential_balance::verify_wrap(commitment, amount, wrap_proof);
    vault.reserve.join(coin.into_balance());

    let card = GiftCard {
        id: object::new(ctx),
        sender: ctx.sender(),
        claim_hash,
        amount_commitment: commitment,
        note,
        expires_ms,
        claimed: false,
    };
    event::emit(GiftCardCreated {
        card_id: object::id(&card),
        sender: card.sender,
        expires_ms,
    });
    transfer::share_object(card);
}

/// Claim with the secret preimage + unwrap proof opening `amount_commitment`.
public fun claim<T>(
    vault: &mut GiftCardVault<T>,
    card: &mut GiftCard,
    secret: vector<u8>,
    value: u64,
    unwrap_proof: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(!card.claimed, EAlreadyClaimed);
    if (card.expires_ms > 0) {
        assert!(clock.timestamp_ms() <= card.expires_ms, EExpired);
    };
    let digest = hash::blake2b256(&secret);
    assert!(digest == card.claim_hash, EBadSecret);
    assert!(vault.reserve.value() >= value, EInsufficientReserve);

    confidential_balance::verify_unwrap(card.amount_commitment, value, unwrap_proof);

    card.claimed = true;
    event::emit(GiftCardClaimed {
        card_id: object::id(card),
        claimer: ctx.sender(),
        amount: value,
    });
    coin::from_balance(vault.reserve.split(value), ctx)
}

/// Sender reclaim — unwrap proof required (amount never stored in plaintext).
public fun cancel<T>(
    vault: &mut GiftCardVault<T>,
    card: &mut GiftCard,
    value: u64,
    unwrap_proof: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == card.sender, ENotSender);
    assert!(!card.claimed, EAlreadyClaimed);
    assert!(vault.reserve.value() >= value, EInsufficientReserve);

    confidential_balance::verify_unwrap(card.amount_commitment, value, unwrap_proof);

    card.claimed = true;
    event::emit(GiftCardCancelled {
        card_id: object::id(card),
        sender: card.sender,
        amount: value,
    });
    coin::from_balance(vault.reserve.split(value), ctx)
}

// === Views ===

public fun sender(c: &GiftCard): address { c.sender }
public fun claimed(c: &GiftCard): bool { c.claimed }
public fun expires_ms(c: &GiftCard): u64 { c.expires_ms }
public fun note(c: &GiftCard): String { c.note }
public fun amount_commitment(c: &GiftCard): vector<u8> { c.amount_commitment }
public fun reserve<T>(v: &GiftCardVault<T>): u64 { v.reserve.value() }
