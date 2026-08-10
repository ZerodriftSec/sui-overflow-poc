/// Shared escrow configuration — roles, fee recipient, platform keys.
module noderails_escrow::config;

use sui::object::{Self, ID, UID};
use sui::transfer;

public struct EscrowConfig has key {
    id: UID,
    fee_recipient: address,
    super_admin: address,
    transaction_authorities: vector<address>,
    authorized_noderails_keys: vector<vector<u8>>,
    paused: bool,
    full_stopped: bool,
}

public struct PaymentRegistry has key {
    id: UID,
    config_id: ID,
}

public fun max_fee_bps(): u16 { 1000 }
public fun max_authorities(): u64 { 8 }
public fun max_noderails_keys(): u64 { 8 }

public fun create_config(
    fee_recipient: address,
    super_admin: address,
    transaction_authorities: vector<address>,
    authorized_noderails_keys: vector<vector<u8>>,
    ctx: &mut TxContext,
): EscrowConfig {
    assert!(fee_recipient != @0x0, 0);
    assert!(transaction_authorities.length() > 0, 1);
    assert!(authorized_noderails_keys.length() > 0, 2);
    assert!(transaction_authorities.length() <= max_authorities(), 3);
    assert!(authorized_noderails_keys.length() <= max_noderails_keys(), 4);
    EscrowConfig {
        id: object::new(ctx),
        fee_recipient,
        super_admin,
        transaction_authorities,
        authorized_noderails_keys,
        paused: false,
        full_stopped: false,
    }
}

public fun create_registry(config: &EscrowConfig, ctx: &mut TxContext): PaymentRegistry {
    PaymentRegistry {
        id: object::new(ctx),
        config_id: object::id(config),
    }
}

public fun share_config(cfg: EscrowConfig) {
    transfer::share_object(cfg);
}

public fun share_registry(reg: PaymentRegistry) {
    transfer::share_object(reg);
}

public fun is_transaction_authority(cfg: &EscrowConfig, who: address): bool {
    cfg.transaction_authorities.contains(&who)
}

public fun can_settle(cfg: &EscrowConfig, merchant: address, who: address): bool {
    who == merchant || cfg.transaction_authorities.contains(&who)
}

public fun require_super_admin(cfg: &EscrowConfig, who: address) {
    assert!(who == cfg.super_admin, 10);
}

public fun require_not_paused(cfg: &EscrowConfig) {
    assert!(!cfg.paused, 11);
}

public fun require_not_full_stopped(cfg: &EscrowConfig) {
    assert!(!cfg.full_stopped, 12);
}

public fun registry_uid(reg: &PaymentRegistry): &UID {
    &reg.id
}

public fun registry_uid_mut(reg: &mut PaymentRegistry): &mut UID {
    &mut reg.id
}

public fun authorized_noderails_keys(cfg: &EscrowConfig): &vector<vector<u8>> {
    &cfg.authorized_noderails_keys
}

public fun fee_recipient_addr(cfg: &EscrowConfig): address {
    cfg.fee_recipient
}

public fun set_fee_recipient(
    config: &mut EscrowConfig,
    fee_recipient: address,
    ctx: &TxContext,
) {
    require_super_admin(config, ctx.sender());
    assert!(fee_recipient != @0x0, 0);
    config.fee_recipient = fee_recipient;
}

public fun set_transaction_authorities(
    config: &mut EscrowConfig,
    keys: vector<address>,
    ctx: &TxContext,
) {
    require_super_admin(config, ctx.sender());
    assert!(keys.length() > 0, 1);
    assert!(keys.length() <= max_authorities(), 2);
    config.transaction_authorities = keys;
}

public fun set_authorized_noderails_keys(
    config: &mut EscrowConfig,
    keys: vector<vector<u8>>,
    ctx: &TxContext,
) {
    require_super_admin(config, ctx.sender());
    assert!(keys.length() > 0, 3);
    assert!(keys.length() <= max_noderails_keys(), 4);
    config.authorized_noderails_keys = keys;
}

public fun pause(config: &mut EscrowConfig, ctx: &TxContext) {
    require_super_admin(config, ctx.sender());
    config.paused = true;
}

public fun unpause(config: &mut EscrowConfig, ctx: &TxContext) {
    require_super_admin(config, ctx.sender());
    config.paused = false;
}

public fun full_stop(config: &mut EscrowConfig, ctx: &TxContext) {
    require_super_admin(config, ctx.sender());
    assert!(!config.full_stopped, 5);
    config.full_stopped = true;
}

public fun lift_full_stop(config: &mut EscrowConfig, ctx: &TxContext) {
    require_super_admin(config, ctx.sender());
    assert!(config.full_stopped, 6);
    config.full_stopped = false;
}
