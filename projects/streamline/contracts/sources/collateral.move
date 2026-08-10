/// Borrowing against a live stream. A DRIPPING stream has a calculable present
/// value, so a freelancer can mint a (non-transferable) `CollateralReceipt`
/// against it. The actual lending integration (Scallop/NAVI) is driven by a PTB
/// that wraps this call; on-chain we record the position and its present value.
module streamline::collateral;

use streamline::stream::{Self, Stream};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const ENotDripping: u64 = 0;
const EOverLtv: u64 = 1;
const EInsufficientLiquidity: u64 = 2;
const EWrongPool: u64 = 3;
const EUnderpaid: u64 = 4;

/// Discount applied to remaining stream value to get present value (bps).
const PV_DISCOUNT_BPS: u64 = 9_000; // 90%
const BPS_DENOM: u64 = 10_000;
/// Milliseconds in a 365-day year (borrow-interest accrual base).
const YEAR_MS: u128 = 31_536_000_000;

/// Non-transferable position receipt — `key` only (no `store`), so a holder
/// cannot transfer or wrap it.
public struct CollateralReceipt has key {
    id: UID,
    stream_id: ID,
    lender: address,
    principal: u64,
    auto_repay: bool,
}

public struct Collateralized has copy, drop {
    stream_id: ID,
    principal: u64,
    lender: address,
    pv: u64,
}

/// Present value of the remaining stream balance after the risk discount.
public fun present_value<T>(s: &Stream<T>): u64 {
    (((stream::remaining(s) as u128) * (PV_DISCOUNT_BPS as u128)) / (BPS_DENOM as u128)) as u64
}

/// Open a collateral position against a dripping stream. `principal` may not
/// exceed the present value. Mints a receipt to the caller (the freelancer).
public fun collateralize<T>(
    s: &Stream<T>,
    lender: address,
    principal: u64,
    auto_repay: bool,
    ctx: &mut TxContext,
) {
    assert!(stream::is_dripping(s), ENotDripping);
    let pv = present_value(s);
    assert!(principal <= pv, EOverLtv);

    let stream_id = object::id(s);
    let receipt = CollateralReceipt {
        id: object::new(ctx),
        stream_id,
        lender,
        principal,
        auto_repay,
    };
    event::emit(Collateralized { stream_id, principal, lender, pv });
    transfer::transfer(receipt, ctx.sender());
}

// === Views ===

public fun principal(r: &CollateralReceipt): u64 { r.principal }

public fun stream_id(r: &CollateralReceipt): ID { r.stream_id }

public fun auto_repay(r: &CollateralReceipt): bool { r.auto_repay }

// === Lending pool (concrete borrow-against-stream) ===
//
// `collateralize` above only *records* a position. The pool here actually funds
// it: lenders seed liquidity, a freelancer borrows up to their stream's present
// value and receives cash now, then repays principal + borrow interest. On
// mainnet this is where Scallop/NAVI liquidity would plug in.

public struct LendingPool<phantom T> has key {
    id: UID,
    reserve: Balance<T>,
    total_borrowed: u64,
    borrow_apr_bps: u64,
}

/// A live loan against a stream. `key, store` so the borrower holds it.
public struct LoanReceipt<phantom T> has key, store {
    id: UID,
    pool_id: ID,
    borrower: address,
    stream_id: ID,
    principal: u64,
    opened_ms: u64,
    borrow_apr_bps: u64,
}

public struct PoolCreated has copy, drop { pool_id: ID, borrow_apr_bps: u64 }
public struct Borrowed has copy, drop {
    pool_id: ID,
    stream_id: ID,
    borrower: address,
    principal: u64,
}
public struct Repaid has copy, drop {
    pool_id: ID,
    stream_id: ID,
    principal: u64,
    paid: u64,
}

/// Open a lending pool for coin `T` at a fixed borrow APR.
public fun create_pool<T>(borrow_apr_bps: u64, ctx: &mut TxContext) {
    let pool = LendingPool<T> {
        id: object::new(ctx),
        reserve: balance::zero<T>(),
        total_borrowed: 0,
        borrow_apr_bps,
    };
    event::emit(PoolCreated { pool_id: object::id(&pool), borrow_apr_bps });
    transfer::share_object(pool);
}

/// Seed pool liquidity (lenders).
public fun fund_pool<T>(pool: &mut LendingPool<T>, coin: Coin<T>) {
    pool.reserve.join(coin.into_balance());
}

/// Borrow `principal` against a dripping stream's present value. Mints a
/// `LoanReceipt` to the caller and returns the borrowed coin.
#[allow(lint(self_transfer))]
public fun borrow<T>(
    pool: &mut LendingPool<T>,
    s: &Stream<T>,
    principal: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(stream::is_dripping(s), ENotDripping);
    assert!(principal <= present_value(s), EOverLtv);
    assert!(principal <= pool.reserve.value(), EInsufficientLiquidity);
    let pool_id = object::id(pool);
    let stream_id = object::id(s);
    let loan = LoanReceipt<T> {
        id: object::new(ctx),
        pool_id,
        borrower: ctx.sender(),
        stream_id,
        principal,
        opened_ms: clock.timestamp_ms(),
        borrow_apr_bps: pool.borrow_apr_bps,
    };
    pool.total_borrowed = pool.total_borrowed + principal;
    transfer::transfer(loan, ctx.sender());
    event::emit(Borrowed { pool_id, stream_id, borrower: ctx.sender(), principal });
    coin::from_balance(pool.reserve.split(principal), ctx)
}

/// Amount owed on a loan at time `now` = principal + accrued borrow interest.
public fun owed<T>(loan: &LoanReceipt<T>, now: u64): u64 {
    let dt = (now - loan.opened_ms) as u128;
    let interest = (loan.principal as u128) * (loan.borrow_apr_bps as u128) * dt
        / ((BPS_DENOM as u128) * YEAR_MS);
    loan.principal + (interest as u64)
}

/// Repay a loan in full (principal + interest); change is returned to the payer.
public fun repay<T>(
    pool: &mut LendingPool<T>,
    loan: LoanReceipt<T>,
    mut payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    let due = owed(&loan, clock.timestamp_ms());
    assert!(coin::value(&payment) >= due, EUnderpaid);
    let LoanReceipt {
        id, pool_id, borrower: _, stream_id, principal, opened_ms: _, borrow_apr_bps: _,
    } = loan;
    assert!(pool_id == object::id(pool), EWrongPool);
    id.delete();
    let due_coin = coin::split(&mut payment, due, ctx);
    pool.reserve.join(due_coin.into_balance());
    pool.total_borrowed =
        if (pool.total_borrowed > principal) pool.total_borrowed - principal else 0;
    event::emit(Repaid { pool_id, stream_id, principal, paid: due });
    payment // change (zero-value if exact)
}

public fun pool_reserve<T>(pool: &LendingPool<T>): u64 { pool.reserve.value() }
public fun pool_borrowed<T>(pool: &LendingPool<T>): u64 { pool.total_borrowed }
public fun pool_apr_bps<T>(pool: &LendingPool<T>): u64 { pool.borrow_apr_bps }
public fun loan_principal<T>(loan: &LoanReceipt<T>): u64 { loan.principal }
public fun loan_stream<T>(loan: &LoanReceipt<T>): ID { loan.stream_id }
