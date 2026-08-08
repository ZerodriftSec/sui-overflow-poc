/// StreamLine — shielded pool (Phase 2: graph hiding).
///
/// A UTXO/note pool that hides WHO pays WHOM, not just the amount. Notes are
/// commitments in an incremental Merkle tree; spends prove membership + a
/// nullifier without revealing which note was spent. An observer sees only that
/// *a* valid confidential transfer happened inside the pool — the payment graph,
/// amounts, and balances all stay hidden. Anonymity set = every note in the pool.
///
/// This is the primitive that upgrades StreamLine confidentiality from
/// "amounts hidden" (the account-model `confidential_balance`, which leaks
/// from/to) to "relationships hidden".
module streamline::shielded_pool;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::table::{Self, Table};
use streamline::confidential_balance;
use streamline::merkle_tree::{Self, MerkleTree};
use streamline::yield_vault::{Self, YieldVault, VaultReceipt};

const EUnknownRoot: u64 = 0;
const ENullifierUsed: u64 = 1;
const EInsufficientIdle: u64 = 2;

/// Dynamic-field key for the pool's invested vault position (Phase 3). A dynamic
/// field so we can add yield to the already-deployed ShieldedPool without an
/// upgrade-breaking struct change.
public struct VaultKey has copy, drop, store {}

public struct ShieldedPool<phantom T> has key {
    id: UID,
    /// Public reserve backing the notes (value enters on deposit, exits on withdraw).
    reserve: Balance<T>,
    /// Merkle tree of note commitments.
    tree: MerkleTree,
    /// Spent nullifiers (double-spend guard).
    nullifiers: Table<u256, bool>,
}

public struct Deposited has copy, drop { commitment: u256, leaf_index: u64, amount: u64 }
public struct Spent has copy, drop { nullifier: u256, cm1: u256, cm2: u256 }
public struct Withdrawn has copy, drop { nullifier: u256, amount: u64, cm_change: u256 }

/// Phase 4: a Seal ciphertext of a note's opening (value, pk, rho), tagged by its
/// commitment. Recipients scan these, trial-decrypt via Seal (only theirs opens),
/// and recover the note to spend it. Selective disclosure = the owner re-encrypts
/// the opening to a chosen auditor's identity; nothing is ever public.
public struct EncryptedNote has copy, drop { commitment: u256, ciphertext: vector<u8> }

public fun create_pool<T>(ctx: &mut TxContext) {
    transfer::share_object(ShieldedPool<T> {
        id: object::new(ctx),
        reserve: balance::zero<T>(),
        tree: merkle_tree::new(),
        nullifiers: table::new(ctx),
    });
}

/// Value in: lock `payment` and add a note `cm` bound (by `proof`) to open to the
/// exact deposited amount. The amount + your address are public here (the
/// anonymity-set boundary); everything after is hidden.
public fun deposit<T>(
    pool: &mut ShieldedPool<T>,
    payment: Coin<T>,
    cm: u256,
    proof: vector<u8>,
) {
    let amount = payment.value();
    confidential_balance::verify_deposit(cm, amount, proof);
    pool.reserve.join(payment.into_balance());
    let leaf_index = merkle_tree::insert(&mut pool.tree, cm);
    event::emit(Deposited { commitment: cm, leaf_index, amount });
}

/// Value out: spend a note to reveal a public `amount` and keep the remainder in
/// `cm_change`. Rejects unknown roots / spent nullifiers. Reveals only the
/// withdrawn amount — not which note, nor the change.
public fun withdraw<T>(
    pool: &mut ShieldedPool<T>,
    root: u256,
    nf: u256,
    amount: u64,
    cm_change: u256,
    proof: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(merkle_tree::is_known_root(&pool.tree, root), EUnknownRoot);
    assert!(!pool.nullifiers.contains(nf), ENullifierUsed);
    confidential_balance::verify_withdraw(root, nf, amount, cm_change, proof);
    pool.nullifiers.add(nf, true);
    merkle_tree::insert(&mut pool.tree, cm_change);
    event::emit(Withdrawn { nullifier: nf, amount, cm_change });
    coin::from_balance(pool.reserve.split(amount), ctx)
}

/// Confidential transfer: spend one note (proven to be in the tree at any recent
/// `root`), create two output notes (recipient + change), conserving value. The
/// proof reveals only `root`, the `nf`, and the two output commitments — never
/// which leaf was spent, the amounts, or the owners. Rejects unknown roots and
/// already-spent nullifiers (double-spend). No coins move (internal transfer).
public fun spend<T>(
    pool: &mut ShieldedPool<T>,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    proof: vector<u8>,
) {
    confidential_balance::verify_shielded(root, nf, cm1, cm2, proof);
    apply_spend(pool, root, nf, cm1, cm2);
    event::emit(Spent { nullifier: nf, cm1, cm2 });
}

/// Apply a verified spend (nullifier + insert outputs). Used by `spend` and by
/// `private_stream::settle_vested` after a `private_settle` proof.
public(package) fun apply_spend<T>(
    pool: &mut ShieldedPool<T>,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
) {
    assert!(merkle_tree::is_known_root(&pool.tree, root), EUnknownRoot);
    assert!(!pool.nullifiers.contains(nf), ENullifierUsed);
    pool.nullifiers.add(nf, true);
    merkle_tree::insert(&mut pool.tree, cm1);
    merkle_tree::insert(&mut pool.tree, cm2);
}

/// Alias for private-engagement settles (same tree mutation as a shielded spend).
public(package) fun apply_private_settle<T>(
    pool: &mut ShieldedPool<T>,
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
) {
    apply_spend(pool, root, nf, cm1, cm2);
}

/// Phase 4: publish a Seal-encrypted note opening so the recipient can discover
/// it. Called in the same PTB as `spend`/`deposit` (atomic). Carries only
/// ciphertext — decryption is gated off-chain by Seal's `seal_approve`.
public fun publish_note<T>(
    _pool: &ShieldedPool<T>,
    commitment: u256,
    ciphertext: vector<u8>,
) {
    event::emit(EncryptedNote { commitment, ciphertext });
}

// === Phase 3: dual yield — pooled capital earns via the yield vault ===

/// Move `amount` of idle reserve into the yield vault. While value sits in the
/// pool (as anyone's note) it earns — a spend never leaves the vault, so both
/// ends of a transfer keep earning (yield → yield). Permissionless: anyone can
/// put the pool's idle float to work. Consolidates into one receipt.
public fun invest<T>(
    pool: &mut ShieldedPool<T>,
    vault: &mut YieldVault<T>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(amount > 0 && pool.reserve.value() >= amount, EInsufficientIdle);
    let mut total = amount;
    if (df::exists_with_type<VaultKey, VaultReceipt<T>>(&pool.id, VaultKey {})) {
        let prev: VaultReceipt<T> = df::remove(&mut pool.id, VaultKey {});
        let back = yield_vault::redeem(vault, prev, clock, ctx);
        total = total + back.value();
        pool.reserve.join(back.into_balance());
    };
    let coin = coin::from_balance(pool.reserve.split(total), ctx);
    let receipt = yield_vault::deposit(vault, coin, clock, ctx);
    df::add(&mut pool.id, VaultKey {}, receipt);
}

/// Redeem the entire invested position (principal + accrued yield) back to idle.
public fun divest<T>(
    pool: &mut ShieldedPool<T>,
    vault: &mut YieldVault<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    if (df::exists_with_type<VaultKey, VaultReceipt<T>>(&pool.id, VaultKey {})) {
        let prev: VaultReceipt<T> = df::remove(&mut pool.id, VaultKey {});
        let back = yield_vault::redeem(vault, prev, clock, ctx);
        pool.reserve.join(back.into_balance());
    };
}

/// Current underlying value of the pool's invested position at `now` (0 if none).
public fun invested_value<T>(pool: &ShieldedPool<T>, vault: &YieldVault<T>, now: u64): u64 {
    if (df::exists_with_type<VaultKey, VaultReceipt<T>>(&pool.id, VaultKey {})) {
        let receipt: &VaultReceipt<T> = df::borrow(&pool.id, VaultKey {});
        yield_vault::receipt_value(vault, receipt, now)
    } else { 0 }
}

// === Views ===

public fun current_root<T>(pool: &ShieldedPool<T>): u256 {
    merkle_tree::current_root(&pool.tree)
}
public fun is_spent<T>(pool: &ShieldedPool<T>, nf: u256): bool {
    pool.nullifiers.contains(nf)
}
public fun reserve_value<T>(pool: &ShieldedPool<T>): u64 { pool.reserve.value() }

// === Test-only ===
/// Insert a note without a deposit proof (to set up `spend`/`withdraw` tests with
/// a note whose deposit proof we don't hold).
#[test_only]
public fun deposit_note_for_testing<T>(pool: &mut ShieldedPool<T>, cm: u256): u64 {
    merkle_tree::insert(&mut pool.tree, cm)
}
#[test_only]
public fun fund_for_testing<T>(pool: &mut ShieldedPool<T>, b: Balance<T>) {
    pool.reserve.join(b);
}
