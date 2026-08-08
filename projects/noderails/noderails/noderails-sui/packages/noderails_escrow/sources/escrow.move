/// Escrow lifecycle entry functions — capture, settle, dispute, refund.
module noderails_escrow::escrow;

use std::option::Option;
use noderails_escrow::auth;
use noderails_escrow::config::{Self, EscrowConfig, PaymentRegistry};
use noderails_escrow::payment::{Self, PaymentRecord};
use noderails_escrow::wallet::{Self, NodeRailsWallet, WalletRegistry};
use std::type_name::{Self, TypeName};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::table::{Self, Table};

const E_BAD_STATUS: u64 = 100;
const E_DUPLICATE: u64 = 101;
const E_NOT_FOUND: u64 = 102;
const E_BAD_AUTH: u64 = 103;
const E_BAD_INTENT: u64 = 104;

public struct PaymentCoinKey has copy, drop, store {
    payment_intent_id: vector<u8>,
}

public struct RegistryState has store {
    payments: Table<vector<u8>, PaymentRecord>,
}

public struct PaymentCaptured has copy, drop {
    payment_intent_id: vector<u8>,
    merchant: address,
    payer: address,
    coin_type: TypeName,
    amount: u64,
    fee_bps: u16,
}

public struct PaymentSettled has copy, drop {
    payment_intent_id: vector<u8>,
    merchant: address,
    merchant_amount: u64,
    platform_fee: u64,
}

public struct DisputeInitiated has copy, drop {
    payment_intent_id: vector<u8>,
    merchant: address,
    payer: address,
}

public struct DisputeResolved has copy, drop {
    payment_intent_id: vector<u8>,
    winner: address,
    amount: u64,
    platform_fee: u64,
}

public struct PaymentRefunded has copy, drop {
    payment_intent_id: vector<u8>,
    payer: address,
    amount: u64,
}

// --- User wallet entries (ctx.sender = owner; no tx authority) ---

public entry fun wallet_create(
    wallet_registry: &mut WalletRegistry,
    ctx: &mut TxContext,
) {
    let _ = wallet::ensure_wallet(wallet_registry, ctx);
}

public entry fun wallet_init_subscription<T>(
    wallet_registry: &mut WalletRegistry,
    coin: Coin<T>,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &mut TxContext,
) {
    wallet::init_wallet_subscription<T>(
        wallet_registry,
        coin,
        merchant,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
        ctx,
    );
}

public entry fun wallet_fund_and_authorize<T>(
    wallet: &mut NodeRailsWallet,
    coin: Coin<T>,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &mut TxContext,
) {
    wallet::fund_and_authorize_subscription<T>(
        wallet,
        coin,
        merchant,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
        ctx,
    );
}

/// Resolve payer wallet object id from registry (devInspect / checkout preflight).
public fun wallet_id_for_owner(
    wallet_registry: &WalletRegistry,
    owner: address,
): Option<sui::object::ID> {
    wallet::wallet_id_for_owner(wallet_registry, owner)
}

public entry fun wallet_deposit<T>(
    wallet: &mut NodeRailsWallet,
    coin: Coin<T>,
    ctx: &mut TxContext,
) {
    wallet::deposit<T>(wallet, coin, ctx);
}

public entry fun wallet_authorize_subscription<T>(
    wallet: &mut NodeRailsWallet,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &mut TxContext,
) {
    wallet::authorize_subscription<T>(
        wallet,
        merchant,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
        ctx,
    );
}

public entry fun wallet_cancel_subscription<T>(
    wallet: &mut NodeRailsWallet,
    merchant: address,
    ctx: &mut TxContext,
) {
    wallet::cancel_subscription<T>(wallet, merchant, ctx);
}

public entry fun wallet_withdraw<T>(
    wallet: &mut NodeRailsWallet,
    amount: u64,
    ctx: &mut TxContext,
) {
    let coin = wallet::withdraw<T>(wallet, amount, ctx);
    transfer::public_transfer(coin, ctx.sender());
}

/// Read-only wallet + rule state for preflight / checkout UI (devInspect).
public fun wallet_subscription_state<T>(
    wallet: &NodeRailsWallet,
    merchant: address,
): (u64, u64, u64, u8) {
    wallet::subscription_rule_balance<T>(wallet, merchant)
}

/// MTXM subscription capture — transaction authority + platform sig (EVM captureERC20 parity).
public entry fun capture_from_wallet<T>(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    wallet: &mut NodeRailsWallet,
    clock: &Clock,
    payment_intent_id: vector<u8>,
    merchant: address,
    payer: address,
    amount: u64,
    fee_bps: u16,
    timelocks: vector<u8>,
    platform_signature: vector<u8>,
    platform_public_key: vector<u8>,
    ctx: &mut TxContext,
) {
    config::require_not_paused(config);
    config::require_not_full_stopped(config);
    assert!(config::is_transaction_authority(config, ctx.sender()), E_BAD_AUTH);
    assert!(payment_intent_id.length() == 32, E_BAD_INTENT);
    assert!(fee_bps <= config::max_fee_bps(), 0);
    assert!(amount > 0, 0);
    assert!(wallet::wallet_owner(wallet) == payer, E_BAD_AUTH);
    payment::validate_timelocks(&timelocks);
    let coin_type = type_name::with_defining_ids<T>();
    let msg = auth::build_capture_wallet_subscription_message(
        &payment_intent_id,
        payer,
        merchant,
        &coin_type,
        amount,
        fee_bps,
        &timelocks,
    );
    assert!(
        auth::verify_noderails_signature(
            config::authorized_noderails_keys(config),
            &msg,
            &platform_signature,
            &platform_public_key,
        ),
        E_BAD_AUTH,
    );
    let now_ms = clock.timestamp_ms();
    let coin = wallet::debit_for_capture<T>(wallet, merchant, amount, now_ms, ctx);
    finalize_captured_payment<T>(
        registry,
        payment_intent_id,
        merchant,
        payer,
        coin_type,
        amount,
        fee_bps,
        timelocks,
        coin,
        now_ms,
    );
}

fun finalize_captured_payment<T>(
    registry: &mut PaymentRegistry,
    payment_intent_id: vector<u8>,
    merchant: address,
    payer: address,
    coin_type: TypeName,
    amount: u64,
    fee_bps: u16,
    timelocks: vector<u8>,
    coin: Coin<T>,
    _now_ms: u64,
) {
    {
        let state = df::borrow_mut<vector<u8>, RegistryState>(config::registry_uid_mut(registry), b"state");
        assert!(!state.payments.contains(payment_intent_id), E_DUPLICATE);
        let record = payment::new_payment_record(merchant, payer, coin_type, amount, fee_bps, timelocks);
        state.payments.add(payment_intent_id, record);
    };
    df::add(
        config::registry_uid_mut(registry),
        PaymentCoinKey { payment_intent_id: copy payment_intent_id },
        coin,
    );
    event::emit(PaymentCaptured {
        payment_intent_id,
        merchant,
        payer,
        coin_type,
        amount,
        fee_bps,
    });
}

/// One-time setup after publish — creates shared config + registry + wallet registry.
public fun initialize(
    fee_recipient: address,
    super_admin: address,
    transaction_authorities: vector<address>,
    authorized_noderails_keys: vector<vector<u8>>,
    ctx: &mut TxContext,
) {
    let cfg = config::create_config(
        fee_recipient,
        super_admin,
        transaction_authorities,
        authorized_noderails_keys,
        ctx,
    );
    let mut reg = config::create_registry(&cfg, ctx);
    df::add(config::registry_uid_mut(&mut reg), b"state", RegistryState {
        payments: table::new(ctx),
    });
    config::share_config(cfg);
    config::share_registry(reg);
    let wallet_reg = wallet::create_registry(ctx);
    wallet::share_registry(wallet_reg);
}

/// For package upgrades: create wallet registry if missing.
public entry fun initialize_wallet_registry(ctx: &mut TxContext) {
    let wallet_reg = wallet::create_registry(ctx);
    wallet::share_registry(wallet_reg);
}

public entry fun capture_payment<T>(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    clock: &Clock,
    payment_intent_id: vector<u8>,
    merchant: address,
    fee_bps: u16,
    timelocks: vector<u8>,
    coin: Coin<T>,
    platform_signature: vector<u8>,
    platform_public_key: vector<u8>,
    ctx: &mut TxContext,
) {
    config::require_not_paused(config);
    config::require_not_full_stopped(config);
    assert!(payment_intent_id.length() == 32, E_BAD_INTENT);
    assert!(fee_bps <= config::max_fee_bps(), 0);
    payment::validate_timelocks(&timelocks);
    let amount = coin::value(&coin);
    assert!(amount > 0, 0);
    let payer = ctx.sender();
    let coin_type = type_name::with_defining_ids<T>();
    let is_native = is_sui_type<T>();
    let msg = if (is_native) {
        auth::build_capture_native_message(&payment_intent_id, merchant, amount, fee_bps, &timelocks)
    } else {
        auth::build_capture_coin_message(&payment_intent_id, merchant, &coin_type, amount, fee_bps, &timelocks)
    };
    assert!(
        auth::verify_noderails_signature(
            config::authorized_noderails_keys(config),
            &msg,
            &platform_signature,
            &platform_public_key,
        ),
        E_BAD_AUTH,
    );
    let now_ms = clock.timestamp_ms();
    finalize_captured_payment<T>(
        registry,
        payment_intent_id,
        merchant,
        payer,
        coin_type,
        amount,
        fee_bps,
        timelocks,
        coin,
        now_ms,
    );
}

public entry fun settle_payment<T>(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    clock: &Clock,
    payment_intent_id: vector<u8>,
    ctx: &mut TxContext,
) {
    config::require_not_full_stopped(config);
    assert!(payment_intent_id.length() == 32, E_BAD_INTENT);
    let now_sec = clock.timestamp_ms() / 1000;
    let (merchant, amount, fee_bps) = {
        let state = df::borrow_mut<vector<u8>, RegistryState>(config::registry_uid_mut(registry), b"state");
        assert!(state.payments.contains(payment_intent_id), E_NOT_FOUND);
        let record = state.payments.borrow_mut(payment_intent_id);
        assert!(payment::status(record) == payment::captured(), E_BAD_STATUS);
        payment::require_settlement_reached(payment::timelocks(record), now_sec);
        assert!(config::can_settle(config, payment::merchant(record), ctx.sender()), E_BAD_AUTH);
        let merchant = payment::merchant(record);
        let amount = payment::amount(record);
        let fee_bps = payment::fee_bps(record);
        payment::set_status(record, payment::settled());
        (merchant, amount, fee_bps)
    };
    let key = PaymentCoinKey { payment_intent_id: copy payment_intent_id };
    let coin = df::remove<PaymentCoinKey, Coin<T>>(config::registry_uid_mut(registry), key);
    let (merchant_amt, fee) = payment::split_fee(amount, fee_bps);
    let mut bal = coin::into_balance(coin);
    let merchant_coin = coin::from_balance(balance::split(&mut bal, merchant_amt), ctx);
    transfer::public_transfer(merchant_coin, merchant);
    if (fee > 0) {
        let fee_coin = coin::from_balance(bal, ctx);
        transfer::public_transfer(fee_coin, config::fee_recipient_addr(config));
    } else {
        balance::destroy_zero(bal);
    };
    event::emit(PaymentSettled {
        payment_intent_id,
        merchant,
        merchant_amount: merchant_amt,
        platform_fee: fee,
    });
}

public entry fun initiate_dispute(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    clock: &Clock,
    payment_intent_id: vector<u8>,
    ctx: &TxContext,
) {
    config::require_not_full_stopped(config);
    assert!(config::is_transaction_authority(config, ctx.sender()), E_BAD_AUTH);
    let now_sec = clock.timestamp_ms() / 1000;
    let state = df::borrow_mut<vector<u8>, RegistryState>(config::registry_uid_mut(registry), b"state");
    assert!(state.payments.contains(payment_intent_id), E_NOT_FOUND);
    let record = state.payments.borrow_mut(payment_intent_id);
    assert!(payment::status(record) == payment::captured(), E_BAD_STATUS);
    payment::require_dispute_open(payment::timelocks(record), now_sec);
    let merchant = payment::merchant(record);
    let payer = payment::payer(record);
    payment::set_status(record, payment::disputed());
    event::emit(DisputeInitiated { payment_intent_id, merchant, payer });
}

public fun resolve_dispute<T>(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    payment_intent_id: vector<u8>,
    winner: address,
    ctx: &mut TxContext,
) {
    config::require_not_full_stopped(config);
    assert!(config::is_transaction_authority(config, ctx.sender()), E_BAD_AUTH);
    let (merchant, payer, amount, fee_bps, merchant_wins) = {
        let state = df::borrow_mut<vector<u8>, RegistryState>(config::registry_uid_mut(registry), b"state");
        assert!(state.payments.contains(payment_intent_id), E_NOT_FOUND);
        let record = state.payments.borrow_mut(payment_intent_id);
        assert!(payment::status(record) == payment::disputed(), E_BAD_STATUS);
        assert!(winner == payment::merchant(record) || winner == payment::payer(record), E_BAD_AUTH);
        let merchant = payment::merchant(record);
        let payer = payment::payer(record);
        let amount = payment::amount(record);
        let fee_bps = payment::fee_bps(record);
        let merchant_wins = winner == merchant;
        payment::set_status(
            record,
            if (merchant_wins) payment::settled() else payment::refunded(),
        );
        (merchant, payer, amount, fee_bps, merchant_wins)
    };
    let key = PaymentCoinKey { payment_intent_id: copy payment_intent_id };
    let coin = df::remove<PaymentCoinKey, Coin<T>>(config::registry_uid_mut(registry), key);
    let mut bal = coin::into_balance(coin);
    if (merchant_wins) {
        let (merchant_amt, fee) = payment::split_fee(amount, fee_bps);
        let merchant_coin = coin::from_balance(balance::split(&mut bal, merchant_amt), ctx);
        transfer::public_transfer(merchant_coin, merchant);
        if (fee > 0) {
            let fee_coin = coin::from_balance(bal, ctx);
            transfer::public_transfer(fee_coin, config::fee_recipient_addr(config));
        } else {
            balance::destroy_zero(bal);
        };
        event::emit(DisputeResolved { payment_intent_id, winner, amount: merchant_amt, platform_fee: fee });
    } else {
        let refund_coin = coin::from_balance(bal, ctx);
        transfer::public_transfer(refund_coin, payer);
        event::emit(DisputeResolved { payment_intent_id, winner, amount, platform_fee: 0 });
    };
}

public entry fun refund_payment<T>(
    registry: &mut PaymentRegistry,
    config: &EscrowConfig,
    clock: &Clock,
    payment_intent_id: vector<u8>,
    ctx: &TxContext,
) {
    config::require_not_full_stopped(config);
    assert!(config::is_transaction_authority(config, ctx.sender()), E_BAD_AUTH);
    let now_sec = clock.timestamp_ms() / 1000;
    let (payer, amount) = {
        let state = df::borrow_mut<vector<u8>, RegistryState>(config::registry_uid_mut(registry), b"state");
        assert!(state.payments.contains(payment_intent_id), E_NOT_FOUND);
        let record = state.payments.borrow_mut(payment_intent_id);
        assert!(payment::status(record) == payment::captured(), E_BAD_STATUS);
        payment::require_before_settlement(payment::timelocks(record), now_sec);
        let payer = payment::payer(record);
        let amount = payment::amount(record);
        payment::set_status(record, payment::refunded());
        (payer, amount)
    };
    let key = PaymentCoinKey { payment_intent_id: copy payment_intent_id };
    let coin = df::remove<PaymentCoinKey, Coin<T>>(config::registry_uid_mut(registry), key);
    transfer::public_transfer(coin, payer);
    event::emit(PaymentRefunded { payment_intent_id, payer, amount });
}

fun is_sui_type<T>(): bool {
    type_name::with_defining_ids<T>() == type_name::with_defining_ids<sui::sui::SUI>()
}

use sui::transfer;
