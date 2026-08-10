/// StreamLine — approved yield-adapter registry (Sweem-style gate).
///
/// Org treasury invest/divest today routes through the native `yield_vault`
/// adapter (testnet stand-in / Scallop-shaped). This registry is the upgrade
/// path for mainnet adapters (Scallop, Navi, Suilend, …): adapters check
/// `is_approved` before moving capital. Names are UTF-8 protocol tags; the
/// `adapter_package` address is informational for off-chain PTB builders.
module streamline::protocol_registry;

use std::string::{Self, String};
use sui::event;
use sui::table::{Self, Table};

const ENotApproved: u64 = 1;
const EAlreadyListed: u64 = 2;

/// Capability that gates protocol listing.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared allow-list of yield adapters.
public struct ProtocolRegistry has key {
    id: UID,
    /// protocol name → package id (as address) that implements the adapter.
    protocols: Table<String, address>,
}

public struct RegistryCreated has copy, drop { registry_id: ID }
public struct ProtocolApproved has copy, drop {
    name: String,
    adapter_package: address,
}
public struct ProtocolRevoked has copy, drop { name: String }

/// Bootstrap registry + admin cap (one-shot deploy helper).
public fun create(ctx: &mut TxContext) {
    let reg = ProtocolRegistry {
        id: object::new(ctx),
        protocols: table::new(ctx),
    };
    event::emit(RegistryCreated { registry_id: object::id(&reg) });
    transfer::share_object(reg);
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Seed the native vault adapter (call once after create).
public fun approve_native(
    _: &AdminCap,
    reg: &mut ProtocolRegistry,
    native_package: address,
) {
    let name = string::utf8(b"native_vault");
    assert!(!reg.protocols.contains(name), EAlreadyListed);
    reg.protocols.add(name, native_package);
    event::emit(ProtocolApproved { name, adapter_package: native_package });
}

public fun approve(
    _: &AdminCap,
    reg: &mut ProtocolRegistry,
    name: String,
    adapter_package: address,
) {
    assert!(!reg.protocols.contains(name), EAlreadyListed);
    reg.protocols.add(name, adapter_package);
    event::emit(ProtocolApproved { name, adapter_package });
}

public fun revoke(_: &AdminCap, reg: &mut ProtocolRegistry, name: String) {
    assert!(reg.protocols.contains(name), ENotApproved);
    reg.protocols.remove(name);
    event::emit(ProtocolRevoked { name });
}

public fun is_approved(reg: &ProtocolRegistry, name: String): bool {
    reg.protocols.contains(name)
}

public fun assert_approved(reg: &ProtocolRegistry, name: String) {
    assert!(is_approved(reg, name), ENotApproved);
}

public fun adapter_package(reg: &ProtocolRegistry, name: String): address {
    assert!(is_approved(reg, name), ENotApproved);
    *reg.protocols.borrow(name)
}
