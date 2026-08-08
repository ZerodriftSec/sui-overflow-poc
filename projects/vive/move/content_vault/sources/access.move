module content_vault::access;

use content_vault::events;
use sui::table::{Self, Table};

const ENoAccess: u64 = 1;
const EInvalidPerm: u64 = 2;

const READ: u8 = 1;
const WRITE: u8 = 2;
const ADMIN: u8 = 4;

/// Transferable admin capability for a project.
public struct ProjectAdminCap has key, store {
    id: UID,
    project_id: ID,
}

/// Per-project revocable access grants.
public struct AccessRegistry has key {
    id: UID,
    project_id: ID,
    grants: Table<address, u8>,
}

public fun read(): u8 { READ }
public fun write(): u8 { WRITE }
public fun admin(): u8 { ADMIN }
public fun read_write(): u8 { READ | WRITE }
public fun full(): u8 { READ | WRITE | ADMIN }

public(package) fun create_registry(project_id: ID, ctx: &mut TxContext): AccessRegistry {
    AccessRegistry {
        id: object::new(ctx),
        project_id,
        grants: table::new(ctx),
    }
}

public(package) fun create_admin_cap(project_id: ID, ctx: &mut TxContext): ProjectAdminCap {
    ProjectAdminCap {
        id: object::new(ctx),
        project_id,
    }
}

public(package) fun share_registry(registry: AccessRegistry) {
    transfer::share_object(registry);
}

public fun project_id(registry: &AccessRegistry): ID {
    registry.project_id
}

public fun admin_project_id(cap: &ProjectAdminCap): ID {
    cap.project_id
}

public fun registry_id(registry: &AccessRegistry): ID {
    object::id(registry)
}

public fun has_perm(registry: &AccessRegistry, who: address, perm: u8): bool {
    if (!table::contains(&registry.grants, who)) {
        return false
    };
    (*table::borrow(&registry.grants, who) & perm) == perm
}

public fun assert_perm(registry: &AccessRegistry, who: address, perm: u8) {
    assert!(has_perm(registry, who, perm), ENoAccess);
}

public fun assert_admin_cap(cap: &ProjectAdminCap, project_id: ID) {
    assert!(cap.project_id == project_id, ENoAccess);
}

public fun grant(
    registry: &mut AccessRegistry,
    admin: &ProjectAdminCap,
    who: address,
    perm: u8,
) {
    assert_admin_cap(admin, registry.project_id);
    assert!(perm > 0 && perm <= (READ | WRITE | ADMIN), EInvalidPerm);
    if (table::contains(&registry.grants, who)) {
        *table::borrow_mut(&mut registry.grants, who) = perm;
    } else {
        table::add(&mut registry.grants, who, perm);
    };
    events::emit_access_granted(registry.project_id, who, perm);
}

public fun revoke(
    registry: &mut AccessRegistry,
    admin: &ProjectAdminCap,
    who: address,
) {
    assert_admin_cap(admin, registry.project_id);
    if (table::contains(&registry.grants, who)) {
        table::remove(&mut registry.grants, who);
        events::emit_access_revoked(registry.project_id, who);
    };
}

/// Grant without admin-cap check — used only during project bootstrap.
public(package) fun bootstrap_grant(
    registry: &mut AccessRegistry,
    who: address,
    perm: u8,
) {
    if (table::contains(&registry.grants, who)) {
        *table::borrow_mut(&mut registry.grants, who) = perm;
    } else {
        table::add(&mut registry.grants, who, perm);
    };
    events::emit_access_granted(registry.project_id, who, perm);
}

entry fun grant_entry(
    registry: &mut AccessRegistry,
    admin: &ProjectAdminCap,
    who: address,
    perm: u8,
) {
    grant(registry, admin, who, perm);
}

entry fun revoke_entry(
    registry: &mut AccessRegistry,
    admin: &ProjectAdminCap,
    who: address,
) {
    revoke(registry, admin, who);
}
