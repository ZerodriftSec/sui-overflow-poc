/// Coin type registry: multisig-managed map from coin `TypeName` to
/// `u8` discriminant.
///
/// This module owns the shared `CoinTypeRegistry` object that the
/// `REGISTRY_ADMIN_ROLE` holders populate to add new stablecoin types
/// without a package upgrade. The registry is the single source of truth
/// for which coin types are accepted by the protocol; `account.move` and
/// `payment.move` look up the discriminant here at account-creation time
///
/// **governance-extensible**. The bootstrap path uses the multisig
/// `register_coin_type<T>(ctx)` flow.
///
/// Discriminant 0 is reserved for native SUI.
///
/// `admin_address` field as the authority. The bootstrap admin must be
/// rotated to the multisig in the same publish tx that calls
/// `init`-time registrations; the `rotate_admin` entry point handles the
/// rotation with an off-chain script and on-chain audit trail.
module subscriptions::registry {
    use sui::object;
    use sui::tx_context::TxContext;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::transfer;
    use std::type_name::{Self, TypeName};

    // === CoinTypeRegistry ===

    /// Shared, multisig-only mutable object that maps coin `TypeName` to
    /// `u8` discriminant. New stablecoin types are added by
    /// `REGISTRY_ADMIN_ROLE` holders via `register_coin_type<T>`.
    /// The registry is the single source of truth for which coin types
    /// are accepted by the protocol.
    ///
    /// Discriminant 0 is reserved for native SUI.
    public struct CoinTypeRegistry has key, store {
        id: object::UID,
        /// `TypeName -> u8` discriminant. Allows forward lookup from a
        /// generic coin type to its registered discriminant.
        discriminants: Table<TypeName, u8>,
        /// `u8 -> TypeName`. Reverse lookup from discriminant to type.
        types: Table<u8, TypeName>,
        /// The address authorized to add or remove coin types. Bootstrap
        /// field; the bootstrap admin address is the source of truth.
        admin_address: address,
        /// Schema version. Bumped on metadata-format changes.
        version: u16,
    }

    // === Errors ===

    /// The coin `TypeName` is already in the registry. Re-registering a
    /// known type is a programmer error or a duplicate multisig tx.
    const ECoinTypeAlreadyRegistered: u64 = 0x04001;

    /// The coin `TypeName` is not registered. Removing an unknown type
    /// is a programmer error.
    const ECoinTypeNotFound: u64 = 0x04002;

    /// The `u8` discriminant is not registered.
    const EDiscriminantNotFound: u64 = 0x04005;

    /// Caller is not the current `admin_address`. The bootstrap admin
        /// future hardening pass.
    const EUnauthorizedRegistryAdmin: u64 = 0x04003;

    /// The new admin address is the zero address. A role granted to
    /// `@0x0` can never be exercised and is a footgun.
    const EZeroAddress: u64 = 0x04004;

    // === Events ===

    /// Emitted on every successful `register_coin_type<T>` call.
    public struct CoinTypeRegistered has copy, drop {
        coin_type: TypeName,
        discriminant: u8,
        v: u16,
    }

    // === init: mint the shared CoinTypeRegistry ===

    /// One-time init. Mints the shared `CoinTypeRegistry`. The deployer
    /// (`ctx.sender()`) becomes the initial admin; production deployments
    /// must immediately rotate `admin_address` to the multisig via
    /// `rotate_admin`, then call `register_coin_type<T>` for any
    /// additional coin types in the same bootstrap transaction.
    ///
    /// Discriminant 0 is reserved for native SUI.
    fun init(ctx: &mut TxContext) {
        let registry = CoinTypeRegistry {
            id: object::new(ctx),
            discriminants: table::new(ctx),
            types: table::new(ctx),
            admin_address: ctx.sender(),
            version: 1,
        };
        transfer::share_object(registry);
    }

    // === Accessors (view) ===

    /// Current bootstrap admin address.
    public fun admin_address(r: &CoinTypeRegistry): address { r.admin_address }

    /// Schema version of the registry. Bumped on metadata-format changes.
    public fun version(r: &CoinTypeRegistry): u16 { r.version }

    /// `u8` discriminant registered against `T`, or `none` if the type is
    /// not in the registry. Read-only view; safe to call from any context.
    public fun discriminant_of<T>(r: &CoinTypeRegistry): std::option::Option<u8> {
        let tn = type_name::with_original_ids<T>();
        if (r.discriminants.contains(tn)) {
            std::option::some(*r.discriminants.borrow(tn))
        } else {
            std::option::none()
        }
    }

    /// Look up the `u8` discriminant for a `TypeName`. Aborts with
    /// `ECoinTypeNotFound` if the type is not registered.
    public fun get_discriminant(r: &CoinTypeRegistry, type_name_arg: &TypeName): u8 {
        assert!(r.discriminants.contains(*type_name_arg), ECoinTypeNotFound);
        *r.discriminants.borrow(*type_name_arg)
    }

    /// Reverse lookup: get the `TypeName` for a `u8` discriminant.
    /// Aborts with `EDiscriminantNotFound` if the discriminant is not registered.
    public fun get_type(r: &CoinTypeRegistry, discriminant: u8): TypeName {
        assert!(r.types.contains(discriminant), EDiscriminantNotFound);
        *r.types.borrow(discriminant)
    }

    // === Mutators (admin only) ===

    /// Register a new coin type. The caller must equal
    /// `CoinTypeRegistry.admin_address`.
    ///
    /// Discriminant allocation: auto-assigns the next available `u8`
    /// discriminant by finding the maximum existing discriminant in
    /// `types` and adding 1. Discriminant 0 is reserved for native SUI.
    ///
    /// #### Aborts
    /// - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
    /// - `ECoinTypeAlreadyRegistered` if `T` is already in the registry.
    public fun register_coin_type<T>(
        r: &mut CoinTypeRegistry,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == r.admin_address, EUnauthorizedRegistryAdmin);
        let tn = type_name::with_original_ids<T>();
        assert!(!r.discriminants.contains(tn), ECoinTypeAlreadyRegistered);

        let mut d: u8 = 0;
        let mut i: u8 = 0;
        while (i != 255u8) {
            if (r.types.contains(i)) {
                if (i >= d) { d = i + 1; };
            };
            i = i + 1;
        };

        r.discriminants.add(tn, d);
        r.types.add(d, tn);

        event::emit(CoinTypeRegistered {
            coin_type: tn,
            discriminant: d,
            v: 1,
        });
    }

    /// Remove a coin type. The caller must be the current admin. Emits
    /// `CoinTypeRemoved`. Future registrations of the same `T` after
    /// removal are allowed and re-allocate a fresh discriminant via
    /// `register_coin_type<T>`.
    ///
    /// #### Aborts
    /// - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
    /// - `ECoinTypeNotFound` if `T` is not in the registry.
    public fun remove_coin_type<T>(r: &mut CoinTypeRegistry, ctx: &mut TxContext) {
        assert!(ctx.sender() == r.admin_address, EUnauthorizedRegistryAdmin);
        let tn = type_name::with_original_ids<T>();
        assert!(r.discriminants.contains(tn), ECoinTypeNotFound);
        let d = r.discriminants.remove(tn);
        if (r.types.contains(d)) {
            let _ = r.types.remove(d);
        };
        event::emit(CoinTypeRemoved {
            type_name: tn,
            removed_by: ctx.sender(),
        });
    }

    /// Emitted on every successful `remove_coin_type<T>` call.
    public struct CoinTypeRemoved has copy, drop {
        type_name: TypeName,
        removed_by: address,
    }

    /// Rotate the bootstrap admin address. Should be replaced by an OZ
        /// Production deployments must call this once at bootstrap to
    /// transfer authority to the multisig.
    ///
    /// #### Aborts
    /// - `EUnauthorizedRegistryAdmin` if `ctx.sender() != admin_address`.
    /// - `EZeroAddress` if `new_admin == @0x0`.
    public fun rotate_admin(
        r: &mut CoinTypeRegistry,
        new_admin: address,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == r.admin_address, EUnauthorizedRegistryAdmin);
        assert!(new_admin != @0x0, EZeroAddress);
        r.admin_address = new_admin;
    }

    // === Test-only ===

    /// Test-only constructor. Mirrors the `init` body but returns the
    /// `CoinTypeRegistry` by value so unit tests can register, query,
    /// and dispose without going through a shared object.
    #[test_only]
    public fun new_registry_for_testing(ctx: &mut TxContext): CoinTypeRegistry {
        CoinTypeRegistry {
            id: object::new(ctx),
            discriminants: table::new(ctx),
            types: table::new(ctx),
            admin_address: ctx.sender(),
            version: 1,
        }
    }

    /// Test-only destructor. `CoinTypeRegistry` has `key + store` but
    /// not `drop`, so unit tests need an explicit way to dispose of
    /// registries they constructed. Both `Table` fields use
    /// `table::drop` which works for `copy + drop + store` value types.
    #[test_only]
    public fun destroy_for_testing(r: CoinTypeRegistry) {
        let CoinTypeRegistry {
            id,
            discriminants,
            types,
            admin_address: _,
            version: _,
        } = r;
        object::delete(id);
        table::drop(discriminants);
        table::drop(types);
    }
}