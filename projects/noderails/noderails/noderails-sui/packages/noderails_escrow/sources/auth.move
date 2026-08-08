/// Platform Ed25519 authorization — parity with Solana capture preimages.
module noderails_escrow::auth;

use std::type_name::TypeName;
use sui::ed25519;
use sui::hash;

const CAPTURE_NATIVE_V1: vector<u8> = b"NodeRailsEscrow::CaptureNative:v1";
const CAPTURE_COIN_V1: vector<u8> = b"NodeRailsEscrow::CaptureCoin:v1";
const CAPTURE_WALLET_SUBSCRIPTION_V1: vector<u8> = b"NodeRailsEscrow::CaptureWalletSubscription:v1";

public fun build_capture_native_message(
    payment_intent_id: &vector<u8>,
    merchant: address,
    amount: u64,
    fee_bps: u16,
    timelocks: &vector<u8>,
): vector<u8> {
    let mut out = CAPTURE_NATIVE_V1;
    append_bytes(&mut out, payment_intent_id);
    append_address(&mut out, merchant);
    append_u64_le(&mut out, amount);
    append_u16_le(&mut out, fee_bps);
    append_bytes(&mut out, timelocks);
    out
}

public fun build_capture_coin_message(
    payment_intent_id: &vector<u8>,
    merchant: address,
    coin_type: &TypeName,
    amount: u64,
    fee_bps: u16,
    timelocks: &vector<u8>,
): vector<u8> {
    let mut out = CAPTURE_COIN_V1;
    append_bytes(&mut out, payment_intent_id);
    append_address(&mut out, merchant);
    append_type_name(&mut out, coin_type);
    append_u64_le(&mut out, amount);
    append_u16_le(&mut out, fee_bps);
    append_bytes(&mut out, timelocks);
    out
}

public fun build_capture_wallet_subscription_message(
    payment_intent_id: &vector<u8>,
    payer: address,
    merchant: address,
    coin_type: &TypeName,
    amount: u64,
    fee_bps: u16,
    timelocks: &vector<u8>,
): vector<u8> {
    let mut out = CAPTURE_WALLET_SUBSCRIPTION_V1;
    append_bytes(&mut out, payment_intent_id);
    append_address(&mut out, payer);
    append_address(&mut out, merchant);
    append_type_name(&mut out, coin_type);
    append_u64_le(&mut out, amount);
    append_u16_le(&mut out, fee_bps);
    append_bytes(&mut out, timelocks);
    out
}

public fun verify_noderails_signature(
    authorized_keys: &vector<vector<u8>>,
    message: &vector<u8>,
    signature: &vector<u8>,
    public_key: &vector<u8>,
): bool {
    if (!authorized_keys.contains(public_key)) {
        return false
    };
    if (signature.length() != 64 || public_key.length() != 32) {
        return false
    };
    let digest = sui_personal_message_signing_digest(message);
    ed25519::ed25519_verify(signature, public_key, &digest)
}

/// Blake2b-256 of Sui intent-wrapped personal message bytes (MTXM `sign-typed` / wallet path).
fun sui_personal_message_signing_digest(message: &vector<u8>): vector<u8> {
    let mut intent_message = vector[3u8, 0u8, 0u8];
    append_uleb128(&mut intent_message, message.length());
    append_bytes(&mut intent_message, message);
    hash::blake2b256(&intent_message)
}

fun append_uleb128(out: &mut vector<u8>, mut n: u64) {
    while (true) {
        let mut byte = (n & 0x7f) as u8;
        n = n >> 7;
        if (n != 0) {
            byte = byte | 0x80;
            out.push_back(byte);
        } else {
            out.push_back(byte);
            break
        }
    };
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

fun append_type_name(out: &mut vector<u8>, tn: &TypeName) {
    append_bytes(out, std::ascii::as_bytes(std::type_name::as_string(tn)));
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

fun append_u16_le(out: &mut vector<u8>, v: u16) {
    out.push_back((v & 0xff) as u8);
    out.push_back(((v >> 8) & 0xff) as u8);
}
