module content_vault::seal_policy;

use content_vault::access::{Self, AccessRegistry};
use content_vault::utils;

const ENoAccess: u64 = 1;
const EBadIdentity: u64 = 2;

/// Seal key-server entrypoint.
///
/// Identity layout (after Seal strips the package-id prefix):
///   project_id_bytes (32) || file_id_bytes (32) || nonce...
///
/// Policy: caller must hold READ on the project's AccessRegistry, and the
/// identity must be prefixed by that registry's project_id.
entry fun seal_approve(id: vector<u8>, registry: &AccessRegistry, ctx: &TxContext) {
    assert!(id.length() >= 32, EBadIdentity);
    let expected = utils::seal_id_prefix(access::project_id(registry));
    assert!(utils::is_prefix(expected, id), EBadIdentity);
    assert!(
        access::has_perm(registry, ctx.sender(), access::read()),
        ENoAccess,
    );
}

/// Same check exposed as a pure assert for tests / PTB composition.
public fun assert_seal_approve(id: vector<u8>, registry: &AccessRegistry, ctx: &TxContext) {
    assert!(id.length() >= 32, EBadIdentity);
    let expected = utils::seal_id_prefix(access::project_id(registry));
    assert!(utils::is_prefix(expected, id), EBadIdentity);
    access::assert_perm(registry, ctx.sender(), access::read());
}
