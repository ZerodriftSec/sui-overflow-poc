/// Payout session and execution — parity with Solana merchant manager.
module noderails_merchant_manager::payout;

use noderails_merchant_manager::config::{Self, MerchConfig, RoleRecord};
use std::type_name::{Self, TypeName};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::ed25519;
use sui::event;
use sui::object::{Self, UID};
use sui::table::{Self, Table};
use sui::transfer;

const SESSION_DOMAIN: vector<u8> = b"NodeRailsMerchantManager::Session:v1";
const PAYOUT_COIN_DOMAIN: vector<u8> = b"NodeRailsMerchantManager::NoderailsPayoutCoin:v1";
const PAYOUT_NATIVE_DOMAIN: vector<u8> = b"NodeRailsMerchantManager::NoderailsNativePayout:v1";

public struct NonceRegistry has key {
    id: UID,
}

public struct NonceTable has store {
    used: Table<vector<u8>, bool>,
}

public struct PayoutExecuted has copy, drop {
    payout_intent_id: vector<u8>,
    merchant: address,
    recipient: address,
    coin_type: TypeName,
    amount: u64,
}

public struct NativePayoutExecuted has copy, drop {
    payout_intent_id: vector<u8>,
    merchant: address,
    recipient: address,
    amount: u64,
}

public fun initialize(super_admin: address, ctx: &mut TxContext) {
    let cfg = config::create_config(super_admin, ctx);
    let mut nonce_reg = NonceRegistry { id: object::new(ctx) };
    df::add(nonce_uid_mut(&mut nonce_reg), b"nonces", NonceTable {
        used: table::new(ctx),
    });
    config::share_config(cfg);
    transfer::share_object(nonce_reg);
}

public fun add_admin(
    cfg: &MerchConfig,
    new_role: RoleRecord,
    ctx: &TxContext,
) {
    config::require_super_admin(cfg, ctx.sender());
    config::assert_role(&new_role, config::admin());
    config::transfer_role(new_role, ctx.sender());
}

public entry fun execute_payout<T>(
    cfg: &MerchConfig,
    exec_role: &RoleRecord,
    nonce_reg: &mut NonceRegistry,
    clock: &Clock,
    payout_intent_id: vector<u8>,
    merchant: address,
    recipient: address,
    coin: Coin<T>,
    session_expiry_ms: u64,
    session_signature: vector<u8>,
    session_public_key: vector<u8>,
    platform_signature: vector<u8>,
    platform_public_key: vector<u8>,
    nonce: vector<u8>,
    ctx: &TxContext,
) {
    assert!(!config::is_paused(cfg), 3);
    config::require_exec_authorized(config::role(exec_role));
    assert!(payout_intent_id.length() == 32, 4);
    assert!(nonce.length() == 32, 5);
    assert!(clock.timestamp_ms() <= session_expiry_ms, 6);
    let amount = coin::value(&coin);
    assert!(amount > 0, 7);
    let session_msg = build_session_message(merchant, session_expiry_ms);
    assert!(
        ed25519::ed25519_verify(&session_signature, &session_public_key, &session_msg),
        8,
    );
    let payout_msg = build_payout_coin_message(
        &payout_intent_id,
        merchant,
        recipient,
        &type_name::with_defining_ids<T>(),
        amount,
        &nonce,
    );
    assert!(
        ed25519::ed25519_verify(&platform_signature, &platform_public_key, &payout_msg),
        9,
    );
    mark_nonce_used(nonce_reg, nonce);
    transfer::public_transfer(coin, recipient);
    event::emit(PayoutExecuted {
        payout_intent_id,
        merchant,
        recipient,
        coin_type: type_name::with_defining_ids<T>(),
        amount,
    });
}

public entry fun execute_native_payout(
    cfg: &MerchConfig,
    exec_role: &RoleRecord,
    nonce_reg: &mut NonceRegistry,
    clock: &Clock,
    payout_intent_id: vector<u8>,
    merchant: address,
    recipient: address,
    payment: Coin<sui::sui::SUI>,
    session_expiry_ms: u64,
    session_signature: vector<u8>,
    session_public_key: vector<u8>,
    platform_signature: vector<u8>,
    platform_public_key: vector<u8>,
    nonce: vector<u8>,
    ctx: &TxContext,
) {
    assert!(!config::is_paused(cfg), 3);
    config::require_exec_authorized(config::role(exec_role));
    assert!(payout_intent_id.length() == 32, 4);
    assert!(nonce.length() == 32, 5);
    assert!(clock.timestamp_ms() <= session_expiry_ms, 6);
    let amount = coin::value(&payment);
    assert!(amount > 0, 7);
    let session_msg = build_session_message(merchant, session_expiry_ms);
    assert!(
        ed25519::ed25519_verify(&session_signature, &session_public_key, &session_msg),
        8,
    );
    let payout_msg = build_payout_native_message(&payout_intent_id, merchant, recipient, amount, &nonce);
    assert!(
        ed25519::ed25519_verify(&platform_signature, &platform_public_key, &payout_msg),
        9,
    );
    mark_nonce_used(nonce_reg, nonce);
    transfer::public_transfer(payment, recipient);
    event::emit(NativePayoutExecuted {
        payout_intent_id,
        merchant,
        recipient,
        amount,
    });
}

fun mark_nonce_used(nonce_reg: &mut NonceRegistry, nonce: vector<u8>) {
    let table = df::borrow_mut<vector<u8>, NonceTable>(nonce_uid_mut(nonce_reg), b"nonces");
    assert!(!table.used.contains(nonce), 10);
    table.used.add(nonce, true);
}

fun build_session_message(merchant: address, expiry_ms: u64): vector<u8> {
    let mut out = SESSION_DOMAIN;
    append_address(&mut out, merchant);
    append_u64_le(&mut out, expiry_ms);
    out
}

fun build_payout_coin_message(
    payout_intent_id: &vector<u8>,
    merchant: address,
    recipient: address,
    coin_type: &TypeName,
    amount: u64,
    nonce: &vector<u8>,
): vector<u8> {
    let mut out = PAYOUT_COIN_DOMAIN;
    append_bytes(&mut out, payout_intent_id);
    append_address(&mut out, merchant);
    append_address(&mut out, recipient);
    append_bytes(&mut out, std::ascii::as_bytes(type_name::as_string(coin_type)));
    append_u64_le(&mut out, amount);
    append_bytes(&mut out, nonce);
    out
}

fun build_payout_native_message(
    payout_intent_id: &vector<u8>,
    merchant: address,
    recipient: address,
    amount: u64,
    nonce: &vector<u8>,
): vector<u8> {
    let mut out = PAYOUT_NATIVE_DOMAIN;
    append_bytes(&mut out, payout_intent_id);
    append_address(&mut out, merchant);
    append_address(&mut out, recipient);
    append_u64_le(&mut out, amount);
    append_bytes(&mut out, nonce);
    out
}

fun append_bytes(out: &mut vector<u8>, data: &vector<u8>) {
    let mut i = 0;
    while (i < data.length()) {
        out.push_back(data[i]);
        i = i + 1;
    };
}

fun append_address(out: &mut vector<u8>, addr: address) {
    append_bytes(out, &addr.to_bytes());
}

fun append_u64_le(out: &mut vector<u8>, v: u64) {
    out.push_back((v & 0xff) as u8);
    out.push_back(((v >> 8) & 0xff) as u8);
    out.push_back(((v >> 16) & 0xff) as u8);
    out.push_back(((v >> 24) & 0xff) as u8);
    out.push_back(((v >> 32) & 0xff) as u8);
    out.push_back(((v >> 40) & 0xff) as u8);
    out.push_back(((v >> 48) & 0xff) as u8);
    out.push_back(((v >> 56) & 0xff) as u8);
}

fun nonce_uid_mut(reg: &mut NonceRegistry): &mut UID {
    &mut reg.id
}
