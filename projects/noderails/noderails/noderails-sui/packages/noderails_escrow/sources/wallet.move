/// Internal NodeRailsWallet storage — no entry functions; escrow module exposes all entries.
module noderails_escrow::wallet;

use std::option::{Self, Option};
use std::type_name::{Self, TypeName};
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::object::{Self, ID, UID};
use sui::table::{Self, Table};
use sui::transfer;

const E_WALLET_EXISTS: u64 = 200;
const E_WALLET_NOT_FOUND: u64 = 201;
const E_NOT_OWNER: u64 = 202;
const E_RULE_INACTIVE: u64 = 203;
const E_INSUFFICIENT: u64 = 204;
const E_BAD_RULE: u64 = 205;

public struct NodeRailsWallet has key {
    id: UID,
    owner: address,
}

public struct WalletRegistry has key {
    id: UID,
}

public struct OwnerIndex has store {
    wallets: Table<address, ID>,
}

public struct WalletBalanceKey has copy, drop, store {
    coin_type: TypeName,
}

public struct SubscriptionRuleKey has copy, drop, store {
    merchant: address,
    coin_type: TypeName,
}

public struct SubscriptionRule has store, copy, drop {
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    status: u8,
}

const RULE_ACTIVE: u8 = 1;
const RULE_CANCELLED: u8 = 2;

public struct WalletCreated has copy, drop {
    owner: address,
    wallet_id: ID,
}

public struct WalletDeposited has copy, drop {
    owner: address,
    coin_type: TypeName,
    amount: u64,
}

public struct SubscriptionAuthorized has copy, drop {
    owner: address,
    merchant: address,
    coin_type: TypeName,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
}

public struct WalletWithdrawn has copy, drop {
    owner: address,
    coin_type: TypeName,
    amount: u64,
}

public struct SubscriptionCancelled has copy, drop {
    owner: address,
    merchant: address,
    coin_type: TypeName,
}

public fun create_registry(ctx: &mut TxContext): WalletRegistry {
    let mut reg = WalletRegistry { id: object::new(ctx) };
    df::add(&mut reg.id, b"owners", OwnerIndex {
        wallets: table::new(ctx),
    });
    reg
}

public fun share_registry(reg: WalletRegistry) {
    transfer::share_object(reg);
}

public fun wallet_owner(wallet: &NodeRailsWallet): address {
    wallet.owner
}

public fun wallet_id_for_owner(registry: &WalletRegistry, owner: address): Option<ID> {
    let idx = df::borrow<vector<u8>, OwnerIndex>(&registry.id, b"owners");
    if (idx.wallets.contains(owner)) {
        option::some(*idx.wallets.borrow(owner))
    } else {
        option::none()
    }
}

public fun subscription_rule_balance<T>(
    wallet: &NodeRailsWallet,
    merchant: address,
): (u64, u64, u64, u8) {
    let coin_type = type_name::with_defining_ids<T>();
    let key = SubscriptionRuleKey { merchant, coin_type };
    let bal_key = WalletBalanceKey { coin_type };
    let balance = if (df::exists(&wallet.id, bal_key)) {
        balance::value(df::borrow<WalletBalanceKey, Balance<T>>(&wallet.id, bal_key))
    } else {
        0
    };
    if (!df::exists(&wallet.id, key)) {
        return (balance, 0, 0, RULE_CANCELLED)
    };
    let rule = df::borrow<SubscriptionRuleKey, SubscriptionRule>(&wallet.id, key);
    (balance, rule.remaining_budget, rule.max_per_charge, rule.status)
}

public(package) fun ensure_wallet(
    registry: &mut WalletRegistry,
    ctx: &mut TxContext,
): ID {
    let owner = ctx.sender();
    let idx = df::borrow_mut<vector<u8>, OwnerIndex>(&mut registry.id, b"owners");
    if (idx.wallets.contains(owner)) {
        return *idx.wallets.borrow(owner)
    };
    let wallet = NodeRailsWallet {
        id: object::new(ctx),
        owner,
    };
    let wallet_id = object::id(&wallet);
    idx.wallets.add(owner, wallet_id);
    transfer::share_object(wallet);
    event::emit(WalletCreated { owner, wallet_id });
    wallet_id
}

public(package) fun assert_owner(wallet: &NodeRailsWallet, who: address) {
    assert!(wallet.owner == who, E_NOT_OWNER);
}

public(package) fun deposit<T>(
    wallet: &mut NodeRailsWallet,
    coin: Coin<T>,
    ctx: &TxContext,
) {
    assert_owner(wallet, ctx.sender());
    let coin_type = type_name::with_defining_ids<T>();
    let amount = coin::value(&coin);
    assert!(amount > 0, 0);
    let key = WalletBalanceKey { coin_type };
    let bal = coin::into_balance(coin);
    if (df::exists(&wallet.id, key)) {
        let pool = df::borrow_mut<WalletBalanceKey, Balance<T>>(&mut wallet.id, key);
        balance::join(pool, bal);
    } else {
        df::add(&mut wallet.id, key, bal);
    };
    event::emit(WalletDeposited { owner: wallet.owner, coin_type, amount });
}

public(package) fun authorize_subscription<T>(
    wallet: &mut NodeRailsWallet,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &TxContext,
) {
    assert_owner(wallet, ctx.sender());
    assert!(merchant != @0x0, 0);
    assert!(remaining_budget > 0, 0);
    assert!(max_per_charge > 0, 0);
    assert!(max_per_charge <= remaining_budget, E_BAD_RULE);
    let coin_type = type_name::with_defining_ids<T>();
    let key = SubscriptionRuleKey { merchant, coin_type };
    let rule = SubscriptionRule {
        remaining_budget,
        max_per_charge,
        expires_at_ms,
        status: RULE_ACTIVE,
    };
    if (df::exists(&wallet.id, key)) {
        *df::borrow_mut<SubscriptionRuleKey, SubscriptionRule>(&mut wallet.id, key) = rule;
    } else {
        df::add(&mut wallet.id, key, rule);
    };
    event::emit(SubscriptionAuthorized {
        owner: wallet.owner,
        merchant,
        coin_type,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
    });
}

public(package) fun cancel_subscription<T>(
    wallet: &mut NodeRailsWallet,
    merchant: address,
    ctx: &TxContext,
) {
    assert_owner(wallet, ctx.sender());
    let coin_type = type_name::with_defining_ids<T>();
    let key = SubscriptionRuleKey { merchant, coin_type };
    assert!(df::exists(&wallet.id, key), E_WALLET_NOT_FOUND);
    let rule = df::borrow_mut<SubscriptionRuleKey, SubscriptionRule>(&mut wallet.id, key);
    rule.status = RULE_CANCELLED;
    event::emit(SubscriptionCancelled { owner: wallet.owner, merchant, coin_type });
}

public(package) fun withdraw<T>(
    wallet: &mut NodeRailsWallet,
    amount: u64,
    ctx: &mut TxContext,
): Coin<T> {
    assert_owner(wallet, ctx.sender());
    assert!(amount > 0, 0);
    let coin_type = type_name::with_defining_ids<T>();
    let key = WalletBalanceKey { coin_type };
    assert!(df::exists(&wallet.id, key), E_INSUFFICIENT);
    let pool = df::borrow_mut<WalletBalanceKey, Balance<T>>(&mut wallet.id, key);
    assert!(balance::value(pool) >= amount, E_INSUFFICIENT);
    let split_bal = balance::split(pool, amount);
    event::emit(WalletWithdrawn { owner: wallet.owner, coin_type, amount });
    coin::from_balance(split_bal, ctx)
}

public(package) fun debit_for_capture<T>(
    wallet: &mut NodeRailsWallet,
    merchant: address,
    amount: u64,
    now_ms: u64,
    ctx: &mut TxContext,
): Coin<T> {
    let coin_type = type_name::with_defining_ids<T>();
    let rule_key = SubscriptionRuleKey { merchant, coin_type };
    assert!(df::exists(&wallet.id, rule_key), E_RULE_INACTIVE);
    {
        let rule = df::borrow<SubscriptionRuleKey, SubscriptionRule>(&wallet.id, rule_key);
        assert!(rule.status == RULE_ACTIVE, E_RULE_INACTIVE);
        assert!(now_ms <= rule.expires_at_ms, E_RULE_INACTIVE);
        assert!(amount <= rule.max_per_charge, E_BAD_RULE);
        assert!(amount <= rule.remaining_budget, E_INSUFFICIENT);
    };
    let bal_key = WalletBalanceKey { coin_type };
    assert!(df::exists(&wallet.id, bal_key), E_INSUFFICIENT);
    let pool = df::borrow_mut<WalletBalanceKey, Balance<T>>(&mut wallet.id, bal_key);
    assert!(balance::value(pool) >= amount, E_INSUFFICIENT);
    let split_bal = balance::split(pool, amount);
    let rule = df::borrow_mut<SubscriptionRuleKey, SubscriptionRule>(&mut wallet.id, rule_key);
    rule.remaining_budget = rule.remaining_budget - amount;
    coin::from_balance(split_bal, ctx)
}

/// First-time subscription setup: create wallet, deposit, and authorize in one tx.
public(package) fun init_wallet_subscription<T>(
    registry: &mut WalletRegistry,
    coin: Coin<T>,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &mut TxContext,
) {
    let owner = ctx.sender();
    let idx = df::borrow_mut<vector<u8>, OwnerIndex>(&mut registry.id, b"owners");
    assert!(!idx.wallets.contains(owner), E_WALLET_EXISTS);
    assert!(merchant != @0x0, 0);
    assert!(remaining_budget > 0, 0);
    assert!(max_per_charge > 0, 0);
    assert!(max_per_charge <= remaining_budget, E_BAD_RULE);
    let coin_type = type_name::with_defining_ids<T>();
    let amount = coin::value(&coin);
    assert!(amount > 0, 0);
    let mut wallet = NodeRailsWallet {
        id: object::new(ctx),
        owner,
    };
    let bal_key = WalletBalanceKey { coin_type };
    df::add(&mut wallet.id, bal_key, coin::into_balance(coin));
    let rule_key = SubscriptionRuleKey { merchant, coin_type };
    df::add(
        &mut wallet.id,
        rule_key,
        SubscriptionRule {
            remaining_budget,
            max_per_charge,
            expires_at_ms,
            status: RULE_ACTIVE,
        },
    );
    let wallet_id = object::id(&wallet);
    idx.wallets.add(owner, wallet_id);
    transfer::share_object(wallet);
    event::emit(WalletCreated { owner, wallet_id });
    event::emit(WalletDeposited { owner, coin_type, amount });
    event::emit(SubscriptionAuthorized {
        owner,
        merchant,
        coin_type,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
    });
}

public(package) fun fund_and_authorize_subscription<T>(
    wallet: &mut NodeRailsWallet,
    coin: Coin<T>,
    merchant: address,
    remaining_budget: u64,
    max_per_charge: u64,
    expires_at_ms: u64,
    ctx: &TxContext,
) {
    deposit<T>(wallet, coin, ctx);
    authorize_subscription<T>(
        wallet,
        merchant,
        remaining_budget,
        max_per_charge,
        expires_at_ms,
        ctx,
    );
}
