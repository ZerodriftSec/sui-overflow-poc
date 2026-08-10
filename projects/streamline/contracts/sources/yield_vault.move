/// StreamLine — native yield adapter (Scallop-shaped; testnet stand-in).
///
/// This is the default approved adapter in `protocol_registry` (`native_vault`).
/// Scallop is mainnet-only, so on testnet we mirror its lending interface with a
/// minimal interest-bearing vault. Scallop's `mint(version, market, coin, clock)
/// -> Coin<MarketCoin<T>>` / `redeem(...) -> Coin<T>` maps to our
/// `deposit -> VaultReceipt<T>` / `redeem -> Coin<T>`: deposit a coin, get a
/// share receipt, watch it accrue, redeem for principal + interest. Yield comes
/// from a continuously-compounding index (`apr_bps`), paid out of a pre-funded
/// reserve buffer. On mainnet these calls swap 1:1 for `scallop_protocol::mint`/
/// `redeem` behind a dedicated adapter package registered in `protocol_registry`.
module streamline::yield_vault;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

/// Index fixed-point scale (1.0 == 1e12). Index only ever grows.
const SCALE: u128 = 1_000_000_000_000;
/// Milliseconds in a 365-day year (interest accrual base).
const YEAR_MS: u128 = 31_536_000_000;
const BPS_DENOM: u128 = 10_000;

const EZeroAmount: u64 = 0;
const EWrongVault: u64 = 1;

/// A lending pool for coin `T`. Shared so anyone can deposit/redeem; the index
/// captures accrued interest so shares appreciate against the underlying.
public struct YieldVault<phantom T> has key {
    id: UID,
    reserve: Balance<T>,
    total_shares: u64,
    /// Appreciation index, scaled by SCALE; underlying-per-share = index / SCALE.
    index: u128,
    last_ms: u64,
    apr_bps: u64,
}

/// Proof of a deposit (Scallop's `Coin<MarketCoin<T>>` analog). Holds `shares`;
/// `has store` so it can live in a wallet or be moved.
public struct VaultReceipt<phantom T> has key, store {
    id: UID,
    vault_id: ID,
    shares: u64,
}

public struct VaultCreated has copy, drop { vault_id: ID, apr_bps: u64 }
public struct Deposited has copy, drop { vault_id: ID, amount: u64, shares: u64 }
public struct Redeemed has copy, drop { vault_id: ID, shares: u64, amount: u64 }

/// Open a new yield pool for coin `T` at a fixed `apr_bps`.
public fun create_vault<T>(apr_bps: u64, clock: &Clock, ctx: &mut TxContext) {
    let vault = YieldVault<T> {
        id: object::new(ctx),
        reserve: balance::zero<T>(),
        total_shares: 0,
        index: SCALE,
        last_ms: clock.timestamp_ms(),
        apr_bps,
    };
    event::emit(VaultCreated { vault_id: object::id(&vault), apr_bps });
    transfer::share_object(vault);
}

/// Seed the reserve buffer that pays interest (no shares minted). On testnet the
/// mock-USDC faucet funds this; on mainnet borrower interest plays this role.
public fun fund<T>(vault: &mut YieldVault<T>, coin: Coin<T>) {
    vault.reserve.join(coin.into_balance());
}

/// Advance the index by the interest accrued since `last_ms`.
fun accrue<T>(vault: &mut YieldVault<T>, now: u64) {
    if (now <= vault.last_ms) return;
    vault.index = project_index(vault, now);
    vault.last_ms = now;
}

/// Index it *would* have at `now`, without mutating (used by views + accrue).
fun project_index<T>(vault: &YieldVault<T>, now: u64): u128 {
    if (now <= vault.last_ms) return vault.index;
    let dt = (now - vault.last_ms) as u128;
    let growth =
        vault.index * (vault.apr_bps as u128) * dt / (BPS_DENOM * YEAR_MS);
    vault.index + growth
}

/// Supply `coin` and receive a share receipt (Scallop `mint`).
public fun deposit<T>(
    vault: &mut YieldVault<T>,
    coin: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): VaultReceipt<T> {
    accrue(vault, clock.timestamp_ms());
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    // shares = amount / (index / SCALE)
    let shares = ((amount as u128) * SCALE / vault.index) as u64;
    vault.reserve.join(coin.into_balance());
    vault.total_shares = vault.total_shares + shares;
    let vault_id = object::id(vault);
    event::emit(Deposited { vault_id, amount, shares });
    VaultReceipt { id: object::new(ctx), vault_id, shares }
}

/// Redeem a receipt for principal + accrued interest (Scallop `redeem`).
public fun redeem<T>(
    vault: &mut YieldVault<T>,
    receipt: VaultReceipt<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    accrue(vault, clock.timestamp_ms());
    let VaultReceipt { id, vault_id, shares } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    id.delete();
    let mut payout = ((shares as u128) * vault.index / SCALE) as u64;
    let avail = vault.reserve.value();
    if (payout > avail) payout = avail;
    vault.total_shares =
        if (vault.total_shares > shares) vault.total_shares - shares else 0;
    event::emit(Redeemed { vault_id, shares, amount: payout });
    coin::from_balance(vault.reserve.split(payout), ctx)
}

// === Views ===

/// Current underlying value of `shares` at time `now` (live preview).
public fun value_of<T>(vault: &YieldVault<T>, shares: u64, now: u64): u64 {
    ((shares as u128) * project_index(vault, now) / SCALE) as u64
}

public fun receipt_value<T>(
    vault: &YieldVault<T>,
    receipt: &VaultReceipt<T>,
    now: u64,
): u64 {
    value_of(vault, receipt.shares, now)
}

public fun reserve_value<T>(vault: &YieldVault<T>): u64 { vault.reserve.value() }
public fun apr_bps<T>(vault: &YieldVault<T>): u64 { vault.apr_bps }
public fun total_shares<T>(vault: &YieldVault<T>): u64 { vault.total_shares }
public fun index<T>(vault: &YieldVault<T>): u128 { vault.index }
public fun receipt_shares<T>(receipt: &VaultReceipt<T>): u64 { receipt.shares }
public fun receipt_vault<T>(receipt: &VaultReceipt<T>): ID { receipt.vault_id }
