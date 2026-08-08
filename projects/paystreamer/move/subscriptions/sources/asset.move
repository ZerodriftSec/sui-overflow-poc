/// Asset tag and pluggable balance container — the confidential-transfer seam.
///
/// This module owns two related types:
///
/// 1. `Asset<T>` — a type-level tag identifying the asset a subscription is
///    denominated in. It carries a `TypeName` of `T` for cheap registry
///    lookups, but is otherwise a phantom-tag: the actual funds live in a
///    `BalanceContainer<T>`, not in the `Asset<T>` itself.
/// 2. `BalanceContainer<T>` — a tagged union of balance implementations.
///    (confidential `TokenAccount<T>` reference) lives in
///    `extensions::confidential` and is purely additive: a fresh enum
///    discriminant, a fresh constructor, and an implementation of the same
///    4-method interface. Core is unchanged.
///
/// The 4-method interface — `view_value`, `try_withdraw`, `deposit`,
/// `is_denied_for` — is the only public surface for accessing the
/// underlying balance. `account.move`, `billing.move`, and `payment.move`
/// call these functions and never touch `Balance<T>` directly.
///
/// When Sui confidential transfers stabilize on mainnet, the CT path is
/// added as a new variant in `extensions/confidential.move` and the
/// contract gains a new asset class without touching `account`,
/// `billing`, `policies`, or `payment`.
module subscriptions::asset {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use std::type_name::{Self, TypeName};

    // === Asset tag ===

    /// Type-level tag identifying the asset a subscription is denominated
    /// in. Distinct from the balance container: `Asset<USDC>` is a public
    /// would be the same denomination held in a confidential `TokenAccount`.
    ///
    /// The phantom `T` parameter carries the denomination type at the type
    /// level. The runtime `tag: TypeName` field enables O(1) lookups
    /// against the `CoinTypeRegistry` without re-running the type name
    /// extraction at every call site.
    public struct Asset<phantom T> has copy, drop, store {
        tag: TypeName,
    }

    /// Constructor for an `Asset<T>` tag. The `TypeName` is captured at
    /// construction time using `with_original_ids`, so the tag is stable
    /// across upgrades that do not rename the type.
    ///
    /// Role: any caller. The `Asset<T>` is a cheap value type.
    public fun asset<T>(): Asset<T> {
        Asset { tag: type_name::with_original_ids<T>() }
    }

    /// `TypeName` of the tagged type `T`. Useful for registry lookups and
    /// for matching an `Asset<T>` against a `CoinTypeRegistry` entry.
    ///
    /// Role: any caller (read-only view).
    public fun type_name_of<T>(a: &Asset<T>): TypeName { a.tag }

    // === BalanceContainer (variant enum) ===

    /// (`public_balance`). A future variant 1 (confidential) is added in
    /// `extensions::confidential` and stores an opaque handle to a
    /// `TokenAccount<T>` reference (object ID, auditor PK, etc.).
    ///
    /// `BalanceContainer<T>` is parameterized on `T` and has `store` (but
    /// not `drop`, because `Balance<T>` lacks `drop`). It lives inside
    /// `SubscriptionAccount<T>` (which is `key + store`, also lacking
    /// `drop`), so the drop constraint is not a problem.
    ///
    /// The 4-method interface functions take `&BalanceContainer<T>` or
    /// `&mut BalanceContainer<T>`. Callers never reach into the fields
    /// directly; the `public_balance` and `extension_bytes` fields are
    /// module-private in spirit (the public surface is the interface).
    public struct BalanceContainer<phantom T> has store {
        variant: u8,
        /// Variant 0: the live public `Balance<T>`. Storing the actual
        /// `Balance<T>` (rather than a serialized `vector<u8>` encoding)
        /// serialize/deserialize round-trip on every operation. A future
        /// variant 1 would leave this empty and use `extension_bytes` for
        /// its own opaque state.
        public_balance: Balance<T>,
        /// Reserved for the future confidential extension (variant 1).
        /// Empty for variant 0.
        extension_bytes: vector<u8>,
    }

    // === Errors ===

    /// A variant-typed function was called on a `BalanceContainer<T>` whose
    /// variant 0 is legal; any other discriminant aborts.
    const EVariantMismatch: u64 = 0x03001;

    /// A zero-amount deposit or zero-amount withdraw. Programmer error;
    /// not a rate-limit decision.
    const EZeroAmount: u64 = 0x03002;

    /// `try_withdraw` was called for an amount that exceeds the live
    /// headroom in the container.
    const EInsufficientBalance: u64 = 0x03003;

    // === Constructor ===

    /// Create an empty `BalanceContainer<T>` for a public-balance `T`.
    /// The discriminant is 0 and `public_balance` is a zero `Balance<T>`;
    /// the first `deposit` populates it.
    ///
    /// Role: any caller. Construction is a one-time cost at
    /// `create_account` time.
    public fun new_public<T>(): BalanceContainer<T> {
        BalanceContainer {
            variant: 0,
            public_balance: balance::zero<T>(),
            extension_bytes: vector[],
        }
    }

    /// Variant discriminant of the container. Variant 0 = public balance
    ///
    /// Role: any caller (read-only view).
    public fun variant<T>(c: &BalanceContainer<T>): u8 { c.variant }

    // === 4-method interface (public-balance implementation) ===

    /// Read the current headroom in the smallest unit of `T`.
    /// For public balances, this is the live `balance::value` of the
    /// part of the fixed interface so the confidential extension can
    /// consult deny-list timing without changing callers.
    ///
    /// #### Aborts
    /// - `EVariantMismatch` if the container is not variant 0.
    public fun view_value<T>(c: &BalanceContainer<T>, _clock: &Clock): u64 {
        assert!(c.variant == 0, EVariantMismatch);
        balance::value(&c.public_balance)
    }

    /// Split off `amount` from the container and return it as a fresh
    /// `Balance<T>`. The caller is responsible for turning the returned
    /// `Balance<T>` into a `Coin<T>` and transferring it to the recipient
    /// (typically `coin::from_balance(b, ctx)` followed by
    /// `transfer::public_transfer`); we return `Balance<T>` so the caller
    /// can compose the value in a PTB.
    ///
    /// #### Aborts
    /// - `EVariantMismatch` if the container is not variant 0.
    /// - `EZeroAmount` if `amount == 0`.
    /// - `EInsufficientBalance` if the live headroom is below `amount`.
    public fun try_withdraw<T>(
        c: &mut BalanceContainer<T>,
        amount: u64,
        _ctx: &mut TxContext,
    ): Balance<T> {
        assert!(c.variant == 0, EVariantMismatch);
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&c.public_balance) >= amount, EInsufficientBalance);
        balance::split(&mut c.public_balance, amount)
    }

    /// Deposit a `Coin<T>` into the container. The coin is fully consumed
    /// and its balance is joined onto the container's `Balance<T>`.
    ///
    /// #### Aborts
    /// - `EVariantMismatch` if the container is not variant 0.
    /// - `EZeroAmount` if the coin has zero value.
    public fun deposit<T>(c: &mut BalanceContainer<T>, coin: Coin<T>, _ctx: &mut TxContext) {
        assert!(c.variant == 0, EVariantMismatch);
        let amt = coin::value(&coin);
        assert!(amt > 0, EZeroAmount);
        balance::join(&mut c.public_balance, coin::into_balance(coin));
    }

    /// Deny-list query. For public balances there is no on-chain deny-list
    /// hook; this always returns `false`. The confidential extension will
    /// override semantics here, consulting its issuer's auditor / freeze
    /// list. The address parameter is the would-be recipient or sender;
    /// variants.
    public fun is_denied_for<T>(_c: &BalanceContainer<T>, _addr: address): bool { false }

    // === Test-only ===

    /// Test-only destructor. `BalanceContainer<T>` has `store` but not
    /// `drop`, so unit tests need an explicit way to dispose of containers
    /// they constructed.
    #[test_only]
    public fun destroy_for_testing<T>(c: BalanceContainer<T>) {
        let BalanceContainer { variant: _, public_balance, extension_bytes: _ } = c;
        balance::destroy_for_testing(public_balance);
    }
}
