/// Payment status and timelock helpers — parity with EVM `PaymentStatus` and Solana escrow.
module noderails_escrow::payment;

use std::type_name::{Self, TypeName};

/// Mirrors `INodeRailsEscrow.PaymentStatus`.
public fun none(): u8 { 0 }
public fun captured(): u8 { 1 }
public fun settled(): u8 { 2 }
public fun disputed(): u8 { 3 }
public fun refunded(): u8 { 4 }

public struct PaymentRecord has store {
    merchant: address,
    payer: address,
    coin_type: TypeName,
    amount: u64,
    fee_bps: u16,
    status: u8,
    timelocks: vector<u8>,
}

public fun new_payment_record(
    merchant: address,
    payer: address,
    coin_type: TypeName,
    amount: u64,
    fee_bps: u16,
    timelocks: vector<u8>,
): PaymentRecord {
    PaymentRecord {
        merchant,
        payer,
        coin_type,
        amount,
        fee_bps,
        status: captured(),
        timelocks,
    }
}

public fun split_fee(amount: u64, fee_bps: u16): (u64, u64) {
    let fee = ((amount as u128) * (fee_bps as u128) / 10_000) as u64;
    (amount - fee, fee)
}

/// EVM `packTimelocks` / Solana `decode_timelocks_abs` layout (32-byte buffer).
public fun decode_timelocks_abs(buf: &vector<u8>): (u64, u64, u64) {
    assert!(buf.length() == 32, 0);
    let b = *buf;
    let hi = read_u128_be(b, 0);
    let lo = read_u128_be(b, 16);
    let captured = ((hi >> 96) as u32 as u64);
    let dispute_off = (((lo >> 32) & 0xffff_ffff) as u32 as u64);
    let settlement_off = (((lo >> 64) & 0xffff_ffff) as u32 as u64);
    (captured, captured + dispute_off, captured + settlement_off)
}

public fun validate_timelocks(buf: &vector<u8>) {
    assert!(buf.length() == 32, 1);
    let (c, d_at, s_at) = decode_timelocks_abs(buf);
    assert!(c > 0, 2);
    assert!(s_at >= c, 3);
    assert!(d_at <= s_at, 4);
}

public fun require_settlement_reached(buf: &vector<u8>, now_sec: u64) {
    let (_, _, settle_at) = decode_timelocks_abs(buf);
    assert!(now_sec >= settle_at, 5);
}

public fun require_dispute_open(buf: &vector<u8>, now_sec: u64) {
    let (_, dispute_at, settle_at) = decode_timelocks_abs(buf);
    assert!(now_sec >= dispute_at, 6);
    assert!(now_sec < settle_at, 7);
}

public fun require_before_settlement(buf: &vector<u8>, now_sec: u64) {
    let (_, _, settle_at) = decode_timelocks_abs(buf);
    assert!(now_sec < settle_at, 8);
}

public fun type_name_of<T>(): TypeName {
    type_name::with_defining_ids<T>()
}

public fun merchant(record: &PaymentRecord): address {
    record.merchant
}

public fun payer(record: &PaymentRecord): address {
    record.payer
}

public fun amount(record: &PaymentRecord): u64 {
    record.amount
}

public fun fee_bps(record: &PaymentRecord): u16 {
    record.fee_bps
}

public fun status(record: &PaymentRecord): u8 {
    record.status
}

public fun timelocks(record: &PaymentRecord): &vector<u8> {
    &record.timelocks
}

public fun set_status(record: &mut PaymentRecord, status: u8) {
    record.status = status;
}

fun read_u128_be(bytes: vector<u8>, offset: u64): u128 {
    let mut i = 0u64;
    let mut out = 0u128;
    while (i < 16) {
        let b = bytes[(offset + i) as u64] as u128;
        out = (out << 8) | b;
        i = i + 1;
    };
    out
}
