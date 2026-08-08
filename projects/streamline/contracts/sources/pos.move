/// StreamLine POS — reusable payment QR codes that settle into an org treasury.
///
/// A merchant shares a payment QR (a `qr_id` string + the treasury id). When a
/// customer scans and pays, `pay` deposits the USDC straight into the merchant's
/// `Treasury` pool and emits a `PosPaid` event tagged with the `qr_id`. Per-QR
/// uses and totals are derived on-chain by aggregating those events — no counter
/// state is stored, so the numbers can never drift from what was actually paid.
module streamline::pos;

use std::string::String;
use sui::clock::Clock;
use sui::coin::Coin;
use sui::event;
use streamline::treasury::{Self as treasury, Treasury};

/// Payment must move a non-zero amount.
const EZeroAmount: u64 = 0;

/// Emitted on every scan-to-pay. Indexers / clients group by `qr_id` to get a
/// QR's use count and accumulated total, and by `treasury_id` for the merchant.
public struct PosPaid has copy, drop {
    qr_id: String,
    treasury_id: ID,
    payer: address,
    amount: u64,
    timestamp_ms: u64,
}

/// Customer pays a payment QR: deposit the full `payment` into the merchant's
/// treasury pool and emit a per-QR `PosPaid`. Permissionless — anyone can pay.
public fun pay<T>(
    qr_id: String,
    payment: Coin<T>,
    treasury_obj: &mut Treasury<T>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let amount = payment.value();
    assert!(amount > 0, EZeroAmount);
    let treasury_id = object::id(treasury_obj);
    treasury::deposit(treasury_obj, payment);
    event::emit(PosPaid {
        qr_id,
        treasury_id,
        payer: ctx.sender(),
        amount,
        timestamp_ms: clock.timestamp_ms(),
    });
}
