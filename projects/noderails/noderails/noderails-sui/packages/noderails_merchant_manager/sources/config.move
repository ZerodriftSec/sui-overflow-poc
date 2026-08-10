/// Shared merchant manager configuration.
module noderails_merchant_manager::config;

use sui::object::{Self, UID};
use sui::transfer;

public struct MerchConfig has key {
    id: UID,
    super_admin: address,
    paused: bool,
}

public struct RoleRecord has key {
    id: UID,
    role: u8,
}

public fun none(): u8 { 0 }
public fun transaction_key(): u8 { 1 }
public fun admin(): u8 { 2 }
public fun super_admin(): u8 { 3 }

public fun create_config(super_admin: address, ctx: &mut TxContext): MerchConfig {
    MerchConfig {
        id: object::new(ctx),
        super_admin,
        paused: false,
    }
}

public fun share_config(cfg: MerchConfig) {
    transfer::share_object(cfg);
}

public fun create_role(role: u8, ctx: &mut TxContext): RoleRecord {
    RoleRecord { id: object::new(ctx), role }
}

public fun transfer_role(rec: RoleRecord, owner: address) {
    transfer::transfer(rec, owner);
}

public fun require_exec_authorized(role: u8) {
    assert!(
        role == transaction_key() || role == admin() || role == super_admin(),
        0,
    );
}

public fun require_super_admin(cfg: &MerchConfig, who: address) {
    assert!(who == cfg.super_admin, 1);
}

public fun is_paused(cfg: &MerchConfig): bool {
    cfg.paused
}

public fun role(record: &RoleRecord): u8 {
    record.role
}

public fun assert_role(record: &RoleRecord, expected: u8) {
    assert!(record.role == expected, 2);
}
