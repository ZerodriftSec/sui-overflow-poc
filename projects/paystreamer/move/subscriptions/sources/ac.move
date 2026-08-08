///
/// This module owns:
/// 1. The user-facing `AccountCap` carrying the delegated permission.
/// 2. The permission bitfield constants used across the protocol.
///
module subscriptions::ac {
    use sui::object;
    use sui::tx_context::TxContext;

    // === AccountCap ===

    /// User-facing capability for a `SubscriptionAccount<T>`. Non-transferable
    /// by default (`key` only, not `store`). The bitfield `permissions`
    /// encodes which fine-grained actions the holder is allowed to perform
    /// on the account
    /// time.
    public struct AccountCap has key {
        id: object::UID,
        /// ID of the `SubscriptionAccount<T>` this cap authorizes.
        account_id: object::ID,
        /// Permission bitfield. `OWNER=1`, `DEPOSITOR=2`, `AGENT=4`.
        permissions: u32,
        /// Cap version; bumped when permissions are extended or revoked.
        version: u8,
        /// Creation timestamp in milliseconds (Sui `Clock`).
        created_at: u64,
    }

    // === Permission bitfield constants ===

    /// Owner permission: full authority over the account.
    const PERMISSION_OWNER: u32 = 1;       // bit 0

    /// Depositor permission: may deposit into the account.
    const PERMISSION_DEPOSITOR: u32 = 2;   // bit 1

    /// Agent permission: agentic-commerce seam (extension: `agent_pay`).
    const PERMISSION_AGENT: u32 = 4;       // bit 2

    // === Errors ===

    /// Permission bitfield is zero (no permissions) or contains bits beyond
    /// the defined mask (bits 3-31).
    const EInvalidPermission: u64 = 0x02001;

    // === AccountCap constructor + accessors ===

    /// Mint a fresh `AccountCap` bound to `account_id` with the given
    /// permission bitfield. The cap is returned by value; the caller is
    /// responsible for transferring it to the appropriate address.
    ///
    /// Role: caller must already hold `ACCOUNT_OWNER_ROLE` on the account (checked at the call site
    /// in `account.move`).
    public fun new_account_cap(
        account_id: object::ID,
        permissions: u32,
        clock_ms: u64,
        ctx: &mut TxContext,
    ): AccountCap {
        assert!(permissions != 0 && permissions <= 7, EInvalidPermission);
        AccountCap {
            id: object::new(ctx),
            account_id,
            permissions,
            version: 1,
            created_at: clock_ms,
        }
    }

    /// ID of the `SubscriptionAccount<T>` this cap authorizes.
    /// Role: any caller (read-only view).
    public fun account_id(cap: &AccountCap): object::ID { cap.account_id }

    /// Raw permission bitfield.
    /// Role: any caller (read-only view).
    public fun permissions(cap: &AccountCap): u32 { cap.permissions }

    /// Cap version.
    /// Role: any caller (read-only view).
    public fun version(cap: &AccountCap): u8 { cap.version }

    /// Creation timestamp in milliseconds (Sui `Clock`).
    /// Role: any caller (read-only view).
    public fun created_at(cap: &AccountCap): u64 { cap.created_at }

    /// True iff the cap's `permissions` bitfield contains every bit in
    /// `perm`. Zero-`perm` always returns `false` (no permission is a
    /// programmer error, not a positive grant).
    /// Role: any caller (read-only view).
    public fun has_permission(cap: &AccountCap, perm: u32): bool {
        (cap.permissions & perm) == perm && perm != 0
    }

    // === Permission constants accessors ===

    /// Owner permission bit (value `1`).
    /// Role: any caller (read-only view).
    public fun permission_owner(): u32 { PERMISSION_OWNER }

    /// Depositor permission bit (value `2`).
    /// Role: any caller (read-only view).
    public fun permission_depositor(): u32 { PERMISSION_DEPOSITOR }

    /// Agent permission bit (value `4`).
    /// Role: any caller (read-only view).
    public fun permission_agent(): u32 { PERMISSION_AGENT }

    // === Test-only helpers ===

    /// Transfer a freshly-minted `AccountCap` to a recipient. Since
    /// (§5.2: "non-transferable by default"), the only way to relocate
    /// it on chain is via this helper. This is intentionally narrow:
    /// the cap is minted and then handed to the user exactly once.
    /// Subsequent re-transfers are a future hardening pass (the
    ///
    /// Role: any caller. The cap is `key`-only, so the only entity
    /// that can pass it to this function is the one that just minted
    /// or currently holds it.
    public fun transfer_account_cap(cap: AccountCap, recipient: address) {
        sui::transfer::transfer(cap, recipient);
    }

    /// Test-only constructor that pins `created_at` to `0`, mirroring the
    /// `clock`-free behavior expected by Move unit tests. Production code
    /// must use `new_account_cap` with a real `clock.timestamp_ms()`.
    #[test_only]
    public fun new_account_cap_for_testing(
        account_id: object::ID,
        permissions: u32,
        ctx: &mut TxContext,
    ): AccountCap {
        new_account_cap(account_id, permissions, 0, ctx)
    }

    /// Test-only destructor. `AccountCap` has `key` but not `drop`, so unit
    /// tests need an explicit way to dispose of caps they constructed.
    #[test_only]
    public fun destroy_account_cap_for_testing(cap: AccountCap) {
        let AccountCap { id, account_id: _, permissions: _, version: _, created_at: _ } = cap;
        object::delete(id);
    }
}
