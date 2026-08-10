/// StreamLine — org treasury (the payroll pool).
///
/// A per-org float of coin `T`: deposit idle USDC, withdraw it, or park it in the
/// native `yield_vault` adapter to earn while unallocated. One shared object per
/// org; anyone may top it up (`deposit`), but only the owner may `withdraw` /
/// `invest` / `divest`. The invested position is held as a single
/// `VaultReceipt<T>` — `invest` consolidates any prior position so we never
/// accumulate receipts.
///
/// Payroll model: **Treasury = capital pool**, worker legs are normal `Stream`s
/// funded via `stream::create_stream_from_treasury_v2` (and the confidential
/// twin). `ensure_idle` pulls invested yield back when a hire needs more float
/// than currently liquid.
module streamline::treasury;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use streamline::yield_vault::{Self, YieldVault, VaultReceipt};

const ENotOwner: u64 = 0;
const EZeroAmount: u64 = 1;
const EInsufficientIdle: u64 = 2;
const ENotInvested: u64 = 3;
const EInsufficientReserve: u64 = 4;

/// Dynamic-field key for the earmarked reserve balance. Held as a dynamic field
/// (not a struct field) so it can be added by an upgrade — struct layouts are
/// frozen across upgrades, dynamic fields are not.
public struct ReserveKey has copy, drop, store {}

/// An org's capital pool. Shared so the keeper / sponsor can co-sign; `owner`
/// gates every value-removing call.
public struct Treasury<phantom T> has key {
    id: UID,
    owner: address,
    /// Liquid, un-invested float.
    idle: Balance<T>,
    /// Invested position in the yield vault, if any (one consolidated receipt).
    invested: Option<VaultReceipt<T>>,
}

public struct TreasuryOpened has copy, drop { treasury_id: ID, owner: address }
public struct Funded has copy, drop { treasury_id: ID, amount: u64 }
public struct Withdrawn has copy, drop { treasury_id: ID, amount: u64 }
public struct Invested has copy, drop { treasury_id: ID, amount: u64 }
public struct Divested has copy, drop { treasury_id: ID, amount: u64 }
public struct Reserved has copy, drop { treasury_id: ID, amount: u64 }
public struct Unreserved has copy, drop { treasury_id: ID, amount: u64 }

/// Open an empty treasury for coin `T`, owned by the caller.
public fun open<T>(ctx: &mut TxContext) {
    let t = Treasury<T> {
        id: object::new(ctx),
        owner: ctx.sender(),
        idle: balance::zero<T>(),
        invested: option::none(),
    };
    event::emit(TreasuryOpened { treasury_id: object::id(&t), owner: t.owner });
    transfer::share_object(t);
}

/// Deposit USDC into the float (anyone may fund the pool).
public fun deposit<T>(t: &mut Treasury<T>, coin: Coin<T>) {
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    t.idle.join(coin.into_balance());
    event::emit(Funded { treasury_id: object::id(t), amount });
}

/// Withdraw idle float back to the owner.
public fun withdraw<T>(
    t: &mut Treasury<T>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(amount > 0, EZeroAmount);
    assert!(t.idle.value() >= amount, EInsufficientIdle);
    event::emit(Withdrawn { treasury_id: object::id(t), amount });
    coin::from_balance(t.idle.split(amount), ctx)
}

/// Move `amount` of idle float into the yield vault. Redeems any prior position
/// first so the treasury holds exactly one receipt; net idle drops by `amount`.
public fun invest<T>(
    t: &mut Treasury<T>,
    vault: &mut YieldVault<T>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(amount > 0, EZeroAmount);
    assert!(t.idle.value() >= amount, EInsufficientIdle);

    let mut invest_total = amount;
    if (t.invested.is_some()) {
        let prev = t.invested.extract();
        let back = yield_vault::redeem(vault, prev, clock, ctx);
        invest_total = invest_total + back.value();
        t.idle.join(back.into_balance());
    };
    let coin = coin::from_balance(t.idle.split(invest_total), ctx);
    let receipt = yield_vault::deposit(vault, coin, clock, ctx);
    t.invested.fill(receipt);
    event::emit(Invested { treasury_id: object::id(t), amount });
}

/// Redeem the entire invested position (principal + accrued yield) back to idle.
public fun divest<T>(
    t: &mut Treasury<T>,
    vault: &mut YieldVault<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(t.invested.is_some(), ENotInvested);
    let receipt = t.invested.extract();
    let back = yield_vault::redeem(vault, receipt, clock, ctx);
    let amount = back.value();
    t.idle.join(back.into_balance());
    event::emit(Divested { treasury_id: object::id(t), amount });
}

/// Park `amount` of idle float into an earmarked reserve cushion. Reserve stays
/// liquid (no yield) but is held apart from the investable idle float — a payroll
/// buffer the owner sets aside. Stored as a dynamic-field `Balance<T>`.
public fun to_reserve<T>(t: &mut Treasury<T>, amount: u64, ctx: &mut TxContext) {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(amount > 0, EZeroAmount);
    assert!(t.idle.value() >= amount, EInsufficientIdle);
    let part = t.idle.split(amount);
    if (df::exists_with_type<ReserveKey, Balance<T>>(&t.id, ReserveKey {})) {
        let r: &mut Balance<T> = df::borrow_mut(&mut t.id, ReserveKey {});
        r.join(part);
    } else {
        df::add(&mut t.id, ReserveKey {}, part);
    };
    event::emit(Reserved { treasury_id: object::id(t), amount });
}

/// Release `amount` from the reserve cushion back into investable idle float.
public fun from_reserve<T>(t: &mut Treasury<T>, amount: u64, ctx: &mut TxContext) {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(amount > 0, EZeroAmount);
    assert!(df::exists_with_type<ReserveKey, Balance<T>>(&t.id, ReserveKey {}), EInsufficientReserve);
    let r: &mut Balance<T> = df::borrow_mut(&mut t.id, ReserveKey {});
    assert!(r.value() >= amount, EInsufficientReserve);
    let part = r.split(amount);
    t.idle.join(part);
    event::emit(Unreserved { treasury_id: object::id(t), amount });
}

/// Make sure at least `amount` sits in idle float, divesting the yield position
/// if needed. Used before payroll hires so a single PTB can fund a stream from
/// the pool even when capital is earning.
public fun ensure_idle<T>(
    t: &mut Treasury<T>,
    vault: &mut YieldVault<T>,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == t.owner, ENotOwner);
    assert!(amount > 0, EZeroAmount);
    if (t.idle.value() >= amount) return;
    if (t.invested.is_some()) {
        divest(t, vault, clock, ctx);
    };
    assert!(t.idle.value() >= amount, EInsufficientIdle);
}

// === Views ===

/// Liquid float available to withdraw or invest.
public fun idle_value<T>(t: &Treasury<T>): u64 { t.idle.value() }

/// Current underlying value of the invested position at `now` (0 if none).
public fun invested_value<T>(
    t: &Treasury<T>,
    vault: &YieldVault<T>,
    now: u64,
): u64 {
    if (t.invested.is_some()) {
        yield_vault::receipt_value(vault, t.invested.borrow(), now)
    } else { 0 }
}

/// Earmarked reserve cushion value (0 if none set aside).
public fun reserve_value<T>(t: &Treasury<T>): u64 {
    if (df::exists_with_type<ReserveKey, Balance<T>>(&t.id, ReserveKey {})) {
        let r: &Balance<T> = df::borrow(&t.id, ReserveKey {});
        r.value()
    } else { 0 }
}

public fun owner<T>(t: &Treasury<T>): address { t.owner }
public fun is_invested<T>(t: &Treasury<T>): bool { t.invested.is_some() }
