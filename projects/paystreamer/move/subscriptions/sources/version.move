///
/// The protocol-wide `CORE` one-time witness is declared in
/// `ac.move`.
/// from there. This module owns the version triples; migration entry points
/// across the package consult `version()` to decide whether to apply.
module subscriptions::version {
    // === Version constants ===

    /// Major version. Bumped on breaking changes that require a migration.
    const VERSION_MAJOR: u16 = 2;

    /// Minor version. Bumped on backward-compatible additions.
    const VERSION_MINOR: u16 = 0;

    const VERSION_PATCH: u16 = 0;

    // === Accessors ===

    /// Returns the current major protocol version.
    /// Role: any caller (read-only view).
    public fun version_major(): u16 { VERSION_MAJOR }

    /// Returns the current minor protocol version.
    /// Role: any caller (read-only view).
    public fun version_minor(): u16 { VERSION_MINOR }

    /// Returns the current patch protocol version.
    /// Role: any caller (read-only view).
    public fun version_patch(): u16 { VERSION_PATCH }

    /// Returns the full protocol version as `(major, minor, patch)`.
    /// Role: any caller (read-only view).
    public fun version(): (u16, u16, u16) { (VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH) }

    #[test_only]
    /// Test-only accessor mirroring `version_major`. Kept under `#[test_only]`
    /// to ensure production code paths use the public view functions.
    public fun version_major_test(): u16 { VERSION_MAJOR }
}
